// Hook to manage Admin WebSocket connection
import { useState, useEffect, useRef, useCallback } from 'react';

export function useAdminSocket() {
    const [status, setStatus] = useState('disconnected');
    const [sessions, setSessions] = useState(new Map()); // sessionId -> { ...sessionData }
    const socketRef = useRef(null);

    const connect = useCallback(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) return;

        setStatus('connecting');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:3000/ws-admin`;

        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log('Admin connected');
            setStatus('connected');
        };

        ws.onclose = () => {
            console.log('Admin disconnected');
            setStatus('disconnected');
            // Auto-reconnect logic could go here
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (e) {
                console.error('Failed to parse admin message:', e);
            }
        };
    }, []);

    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }
    }, []);

    const handleMessage = (data) => {
        switch (data.type) {
            case 'snapshot':
                // Initial load of sessions
                const snapshotMap = new Map();
                data.sessions.forEach(s => {
                    snapshotMap.set(s.sessionId, { ...s, events: s.events || [], vadHistory: [] });
                });
                setSessions(snapshotMap);
                break;

            case 'session_start':
                setSessions(prev => {
                    const next = new Map(prev);
                    next.set(data.sessionId, {
                        sessionId: data.sessionId,
                        agentId: data.agentId,
                        status: 'active',
                        events: [],
                        vadHistory: []
                    });
                    return next;
                });
                break;

            case 'session_end':
                setSessions(prev => {
                    const next = new Map(prev);
                    // We might want to keep it locally but mark as inactive
                    if (next.has(data.sessionId)) {
                        const s = next.get(data.sessionId);
                        next.set(data.sessionId, { ...s, status: 'ended' });
                    }
                    return next;
                });
                break;

            case 'event':
                setSessions(prev => {
                    const next = new Map(prev);
                    const session = next.get(data.sessionId);
                    if (session) {
                        const newEvents = [...session.events, {
                            source: data.source,
                            data: data.event,
                            timestamp: Date.now()
                        }].slice(-100); // Keep last 100 events

                        // Check for specific events to update state
                        let newVadHistory = session.vadHistory;
                        let newAudioChunks = session.audioChunks || [];

                        if (data.event.type === 'audio' && data.event.audio_event?.audio_base_64) {
                            // We have audio data!
                            // Create a simple object { id: unique, data: base64 }
                            newAudioChunks = [...newAudioChunks, {
                                id: Date.now() + Math.random(),
                                data: data.event.audio_event.audio_base_64
                            }].slice(-20); // Keep last 20 chunks to avoid memory leak, frontend player should consume them
                        }

                        next.set(data.sessionId, {
                            ...session,
                            events: newEvents,
                            vadHistory: newVadHistory,
                            audioChunks: newAudioChunks
                        });


                    }
                    return next;
                });
                break;

            case 'audio_activity':
                setSessions(prev => {
                    const next = new Map(prev);
                    const session = next.get(data.sessionId);
                    if (session) {
                        // Add a fake VAD spike for visualization since we don't stream full audio to admin yet
                        const newVad = [...session.vadHistory, { time: Date.now(), score: 0.8 }].slice(-50);
                        next.set(data.sessionId, { ...session, vadHistory: newVad });
                    }
                    return next;
                });
                break;
        }
    };

    const sendMonitorCommand = useCallback((conversationId) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: 'start_monitoring',
                conversationId
            }));
        }
    }, []);

    // Cleanup
    useEffect(() => {
        return () => disconnect();
    }, [disconnect]);

    return { status, sessions, connect, disconnect, sendMonitorCommand };
}
