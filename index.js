const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

// Global state
const activeSessions = new Map(); // sessionId -> { ws, agentId }
const adminConnections = new Set();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';
const API_KEY = process.env.ELEVENLABS_API_KEY;

// Broadcast to all connected admins
function broadcastToAdmins(message) {
    const payload = JSON.stringify(message);
    adminConnections.forEach(admin => {
        if (admin.readyState === WebSocket.OPEN) {
            admin.send(payload);
        }
    });
}

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // --- 1. ADMIN CONNECTION HANDLING ---
    if (pathname === '/ws-admin') {
        console.log('[Server] New Admin connected');
        adminConnections.add(ws);

        // Send snapshot of current active sessions
        const snapshot = Array.from(activeSessions.entries()).map(([id, session]) => ({
            sessionId: id,
            agentId: session.agentId,
            status: 'active',
            events: session.events || [] // Send buffer
        }));
        ws.send(JSON.stringify({ type: 'snapshot', sessions: snapshot }));

        ws.on('close', () => {
            console.log('[Server] Admin disconnected');
            adminConnections.delete(ws);
        });
        return; // Stop here for admin
    }

    // --- 2. AGENT CLIENT CONNECTION HANDLING ---
    const agentId = url.searchParams.get('agent_id');
    const sessionId = Math.random().toString(36).substring(7); // Generate Session ID

    if (!agentId) {
        console.error('[Server] No agent_id provided');
        ws.close(1008, 'agent_id is required');
        return;
    }

    console.log(`[Server] New Client Session: ${sessionId} (Agent: ${agentId})`);

    // Register Session
    activeSessions.set(sessionId, { ws, agentId, events: [] });
    broadcastToAdmins({ type: 'session_start', sessionId, agentId });

    // Connect to ElevenLabs
    const elevenLabsWs = new WebSocket(`${ELEVENLABS_WS_URL}?agent_id=${agentId}`);

    // Helper to broadcast events
    const broadcastEvent = (source, eventData) => {
        let safeData;
        try {
            safeData = JSON.parse(eventData);
        } catch (e) {
            safeData = { type: 'raw', data: eventData.toString() };
        }

        // Optimization: Truncate large audio data for admin view
        // User requested audio playback in admin, so we MUST forward the audio.
        // if (safeData.audio_event?.audio_base_64) safeData.audio_event.audio_base_64 = '<TRUNCATED>';
        // if (safeData.user_audio_chunk) safeData.user_audio_chunk = '<TRUNCATED>';

        const eventPayload = {
            type: 'event',
            sessionId,
            source, // 'user' or 'agent'
            event: safeData,
            timestamp: Date.now()
        };

        // Persist history
        const session = activeSessions.get(sessionId);
        if (session) {
            session.events.push(eventPayload);
            if (session.events.length > 50) session.events.shift(); // Keep last 50
        }

        broadcastToAdmins(eventPayload);
    };

    elevenLabsWs.on('open', () => {
        console.log(`[Server] [${sessionId}] Connected to ElevenLabs`);
    });

    elevenLabsWs.on('message', (data) => {
        const message = data.toString();
        // 1. Forward to Client
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
        // 2. Broadcast to Admins
        broadcastEvent('agent', message);
    });

    elevenLabsWs.on('error', (error) => {
        console.error(`[Server] [${sessionId}] ElevenLabs WebSocket error:`, error);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });

    elevenLabsWs.on('close', (code, reason) => {
        console.log(`[Server] [${sessionId}] ElevenLabs closed: ${code} ${reason}`);
        if (ws.readyState === WebSocket.OPEN) {
            ws.close(code, reason);
        }
    });

    // Handle messages from client
    ws.on('message', (data, isBinary) => {
        if (elevenLabsWs.readyState === WebSocket.OPEN) {
            const messageToSend = isBinary ? data : data.toString();
            elevenLabsWs.send(messageToSend);

            if (!isBinary) {
                broadcastEvent('user', data.toString());
            } else {
                // Indicate audio activity without sending full blob
                broadcastToAdmins({
                    type: 'audio_activity',
                    sessionId,
                    source: 'user'
                });
            }
        }
    });

    ws.on('close', () => {
        console.log(`[Server] [${sessionId}] Client disconnected`);
        if (elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
        }
        activeSessions.delete(sessionId);
        broadcastToAdmins({ type: 'session_end', sessionId });
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Proxy server running on port ${PORT}`);
});
