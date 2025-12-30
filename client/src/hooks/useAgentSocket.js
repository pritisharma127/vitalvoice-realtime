import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioRecorder, AudioPlayer } from '../lib/audio';

export function useAgentSocket(agentId) {
    const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected, error
    const [transcripts, setTranscripts] = useState([]);
    const [latestVad, setLatestVad] = useState(0);
    const [events, setEvents] = useState([]);
    const [isRecording, setIsRecording] = useState(false);

    const socketRef = useRef(null);
    const recorderRef = useRef(null);
    const playerRef = useRef(null);

    // Initialize audio player
    useEffect(() => {
        playerRef.current = new AudioPlayer();
        return () => {
            if (playerRef.current) playerRef.current.reset();
        };
    }, []);

    const connect = useCallback(() => {
        if (!agentId) return;
        if (socketRef.current) {
            socketRef.current.close();
        }

        setStatus('connecting');
        // Assuming proxy is on localhost:3000
        const wsUrl = `ws://localhost:3000/ws-proxy?agent_id=${agentId}`;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log('[AgentSocket] Connected to Proxy');
            setStatus('connected');
            // Initiation metadata is now handled by the server proxy to ensure it's sent first.
        };

        ws.onmessage = async (event) => {
            try {
                let rawData = event.data;
                if (rawData instanceof Blob) {
                    rawData = await rawData.text();
                }

                const data = JSON.parse(rawData);

                // Add to raw event log (keep last 50)
                setEvents((prev) => [data, ...prev].slice(0, 50));

                handleEvent(data);
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        };

        ws.onclose = (event) => {
            console.log(`[AgentSocket] Disconnected from Proxy. Code: ${event.code}, Reason: ${event.reason}`);
            setStatus('disconnected');
        };

        ws.onerror = (err) => {
            console.error('[AgentSocket] WebSocket Error:', err);
            setStatus('error');
        };

    }, [agentId]);

    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }
        if (recorderRef.current) {
            recorderRef.current.stop();
            recorderRef.current = null;
        }
        if (playerRef.current) {
            playerRef.current.reset();
        }
        setIsRecording(false);
        setStatus('disconnected');
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            if (recorderRef.current) {
                recorderRef.current.stop();
            }
            setIsRecording(false);
        } else {
            if (!recorderRef.current) {
                recorderRef.current = new AudioRecorder((base64Data) => {
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                        // Diagnostic: log every chunk during this debug phase
                        console.log('[AgentSocket] Sending audio chunk to proxy...');

                        socketRef.current.send(JSON.stringify({
                            user_audio_chunk: base64Data
                        }));
                    }
                });
            }
            await recorderRef.current.start();
            setIsRecording(true);
        }
    }, [isRecording]);

    const handleEvent = (data) => {
        // Robust text extraction helper
        const extractText = (obj) => {
            if (!obj) return null;
            // Common ElevenLabs property paths
            return obj.user_transcription_event?.user_transcript ||
                obj.agent_response_event?.agent_response ||
                obj.transcript ||
                obj.text ||
                obj.message ||
                (typeof obj.event === 'object' ? extractText(obj.event) : null);
        };

        switch (data.type) {
            case 'user_transcript':
                const userText = data.user_transcription_event?.user_transcript || extractText(data);
                if (userText) {
                    addTranscript('user', userText, false);
                }
                break;

            case 'agent_response':
                const agentText = data.agent_response_event?.agent_response || extractText(data);
                if (agentText) {
                    addTranscript('agent', agentText, false);
                }
                break;

            case 'agent_response_correction':
                const correctedText = data.agent_response_correction_event?.corrected_agent_response || extractText(data);
                if (correctedText) {
                    addTranscript('agent', correctedText, false);
                }
                break;

            case 'audio':
                if (data.audio_event?.audio_base_64 && playerRef.current) {
                    playerRef.current.play(data.audio_event.audio_base_64);
                }
                break;

            case 'vad_score':
                const score = data.vad_score_event?.vad_score || data.score || data.vad;
                if (typeof score === 'number') {
                    setLatestVad(score);
                }
                break;

            case 'ping':
                const eventId = data.ping_event?.event_id || data.event_id;
                console.log(`[AgentSocket] Received Ping (event_id: ${eventId}). Sending Pong...`);
                if (eventId && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                    const pong = {
                        type: 'pong',
                        event_id: eventId
                    };
                    socketRef.current.send(JSON.stringify(pong));
                }
                break;

            default:
                if (data.type !== 'audio' && data.type !== 'vad_score') {
                    console.log('[AgentSocket] Unhandled event type:', data.type, data);
                }
        }
    };

    const addTranscript = (role, text, isTentative) => {
        setTranscripts(prev => {
            // Simple append for now. 
            // Ideally we'd group user/agent messages or update tentative ones.
            const last = prev[prev.length - 1];
            if (last && last.role === role && last.isTentative && !isTentative) {
                // Replace tentative with final
                return [...prev.slice(0, -1), { role, text, isTentative, timestamp: Date.now() }];
            }
            return [...prev, { role, text, isTentative, timestamp: Date.now() }];
        });
    };

    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    return {
        status,
        connect,
        disconnect,
        transcripts,
        latestVad,
        events,
        isRecording,
        toggleRecording
    };
}
