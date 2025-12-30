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
const ELEVENLABS_MONITOR_URL = 'wss://api.elevenlabs.io/v1/conversation/websocket';
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
            events: session.events || [], // Send buffer
            hospitalLocation: process.env.HOSPITAL_LOCATION
        }));
        ws.send(JSON.stringify({ type: 'snapshot', sessions: snapshot }));

        ws.on('close', () => {
            console.log('[Server] Admin disconnected');
            adminConnections.delete(ws);
        });
        return;
    }

    // --- 3. MONITOR CONNECTION HANDLING (Alternative via Socket) ---
    if (pathname === '/ws-monitor') {
        const conversationId = url.searchParams.get('conversation_id');
        if (conversationId) startMonitoring(conversationId);
        ws.close(); // Close this connection as startMonitoring handles its own
        return;
    }

    // --- 4. PROXY CONNECTION HANDLING (New Agent Sessions) ---
    // Existing logic for /ws-proxy (already implemented below)

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
    console.log(`[Server] [${sessionId}] Connecting to ElevenLabs: agent_id=${agentId}`);

    // Mandatory dynamic variables for this blood donation scenario
    const dynamicVars = {
        contact_name: "Suresh",
        gender: "Male",
        blood_group: "O Positive",
        required_by_datetime: "today by 11:00 AM",
        reason: "Emergency blood requirement after car accident"
    };

    // Passing dynamic variables in the query string is often required for 1008 prevention
    const elWsUrl = new URL(ELEVENLABS_WS_URL);
    elWsUrl.searchParams.append('agent_id', agentId);
    elWsUrl.searchParams.append('dynamic_variables', JSON.stringify(dynamicVars));

    const elevenLabsWs = new WebSocket(elWsUrl.toString(), {
        headers: {
            'xi-api-key': API_KEY
        }
    });

    console.log(`[Server] [${sessionId}] Generated ElevenLabs URL with dynamic variables: ${elWsUrl.toString().split('xi-api-key=')[0]} (Key Hidden)`);

    // Helper to broadcast events
    const broadcastEvent = (source, eventData) => {
        let safeData;
        try {
            safeData = JSON.parse(eventData);
        } catch (e) {
            safeData = { type: 'raw', data: eventData.toString() };
        }

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

    let hasSentInitiation = false;
    const messageBuffer = [];

    elevenLabsWs.on('open', () => {
        console.log(`[Server] [${sessionId}] Connected to ElevenLabs successfully`);

        // 1. Send Mandatory Initiation Metadata immediately from server
        // Using the structure exactly as provided in the user's snippet
        const initiationMetadata = {
            type: 'conversation_initiation_client_data',
            dynamic_variables: dynamicVars
        };

        const metadataStr = JSON.stringify(initiationMetadata);
        elevenLabsWs.send(metadataStr);
        console.log(`[Server] [${sessionId}] Sent mandatory initiation metadata (conversation_initiation_metadata_event)`);
        hasSentInitiation = true;

        // 2. Flush client buffer if any
        while (messageBuffer.length > 0) {
            const data = messageBuffer.shift();
            elevenLabsWs.send(data);
            console.log(`[Server] [${sessionId}] Flushed buffered client message to ElevenLabs`);
        }
    });

    elevenLabsWs.on('message', (data) => {
        const message = data.toString();
        const parsed = JSON.parse(message);

        // Detailed logging for debugging
        if (parsed.type === 'audio') {
            if (Math.random() < 0.1) console.log(`[Server] [${sessionId}] Received audio from ElevenLabs`);
        } else if (parsed.type === 'ping') {
            // console.log(`[Server] [${sessionId}] Received ping from ElevenLabs`);
        } else {
            console.log(`[Server] [${sessionId}] Received from ElevenLabs: ${parsed.type || 'unknown'} - ${message.slice(0, 100)}...`);
        }

        // 1. Forward to Client
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
        // 2. Broadcast to Admins
        broadcastEvent('agent', message);
    });

    elevenLabsWs.on('error', (error) => {
        console.error(`[Server] [${sessionId}] ElevenLabs WebSocket error:`, error.message);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: `ElevenLabs Error: ${error.message}` }));
        }
    });

    elevenLabsWs.on('close', (code, reason) => {
        console.log(`[Server] [${sessionId}] ElevenLabs connection closed. Code: ${code}, Reason: ${reason || 'No reason'}`);
        if (ws.readyState === WebSocket.OPEN) {
            ws.close(code, reason);
        }
    });

    // Handle messages from client
    ws.on('message', (data, isBinary) => {
        const messageToSend = isBinary ? data : data.toString();

        if (elevenLabsWs.readyState === 1 && hasSentInitiation) { // OPEN AND INITIALIZED
            elevenLabsWs.send(messageToSend);

            if (!isBinary) {
                const msgStr = data.toString();
                if (msgStr.includes('user_audio_chunk')) {
                    // Skip expensive JSON parsing/broadcasting for audio chunks
                    // Just signal activity to admins
                    console.log(`[Server] [${sessionId}] Forwarding user audio chunk to ElevenLabs (${msgStr.length} bytes)`);

                    broadcastToAdmins({
                        type: 'audio_activity',
                        sessionId,
                        source: 'user'
                    });
                } else {
                    console.log(`[Server] [${sessionId}] User sent command: ${msgStr.slice(0, 100)}...`);
                    broadcastEvent('user', data.toString());
                }
            } else {
                // Indicate audio activity without sending full blob
                broadcastToAdmins({
                    type: 'audio_activity',
                    sessionId,
                    source: 'user'
                });
            }
        } else if (elevenLabsWs.readyState === 0 || !hasSentInitiation) { // CONNECTING OR WAITING FOR INIT
            console.log(`[Server] [${sessionId}] Upstream not ready or init pending, buffering client message...`);
            messageBuffer.push(messageToSend);
        } else {
            console.warn(`[Server] [${sessionId}] Client sent message but ElevenLabs WS is status: ${elevenLabsWs.readyState}`);
        }
    });

    ws.on('close', () => {
        console.log(`[Server] [${sessionId}] Client disconnected`);
        if (elevenLabsWs.readyState === 1) {
            elevenLabsWs.close();
        }
        activeSessions.delete(sessionId);
        broadcastToAdmins({ type: 'session_end', sessionId });
    });
});


// Add endpoint for map config
app.get('/api/map-config', (req, res) => {
    res.json({
        hospitalLocation: process.env.HOSPITAL_LOCATION,
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
        agentId: process.env.ELEVENLABS_AGENT_ID
    });
});

// Add endpoint for distance calculation
app.get('/api/distance', async (req, res) => {
    const { destination } = req.query;
    const origin = process.env.HOSPITAL_LOCATION;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    console.log(`[Server] Distance request: Origin="${origin}", Destination="${destination}"`);

    if (!destination) return res.status(400).json({ error: 'Destination required' });

    try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        console.log(`[Server] Google Maps Response Status: ${data.status}`);

        if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
            const element = data.rows[0].elements[0];
            const result = {
                distance: element.distance.text,
                duration: element.duration.text,
                origin: origin,
                destination: destination
            };
            console.log(`[Server] Distance result:`, result);
            res.json(result);
        } else {
            console.error(`[Server] Route not found:`, data);
            res.status(404).json({ error: 'Route not found', details: data });
        }
    } catch (e) {
        console.error(`[Server] Distance error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Proxy server running on port ${PORT}`);
});
