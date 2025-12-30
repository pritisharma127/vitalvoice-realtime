import React, { useState, useEffect, useRef } from 'react';
import { useAgentSocket } from '../hooks/useAgentSocket';
import { Activity, Server, Mic, MessageSquare, Terminal, Settings, Sun, Moon } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { analyzeSentiment, extractEntities } from '../lib/analysis';
import logoLight from '../assets/logo-light.png';
import logoDark from '../assets/logo-dark.png';

export default function Dashboard({ theme, toggleTheme }) {
    const [agentId, setAgentId] = useState('');
    const { status, connect, disconnect, transcripts, latestVad, events, isRecording, toggleRecording } = useAgentSocket(agentId);
    const scrollRef = useRef(null);
    const [vadHistory, setVadHistory] = useState([]);

    // Fetch config and set default Agent ID
    useEffect(() => {
        // 1. Check URL query params first
        const params = new URLSearchParams(window.location.search);
        const urlAgentId = params.get('agent_id');

        if (urlAgentId) {
            setAgentId(urlAgentId);
            return; // URL takes precedence
        }

        // 2. Fallback to server config if no URL param
        fetch('http://localhost:3000/api/map-config')
            .then(res => res.json())
            .then(data => {
                if (data.agentId) {
                    setAgentId(data.agentId);
                }
            })
            .catch(err => console.error('[Dashboard] Config fetch error:', err));
    }, []);

    // Keep history of VAD scores
    useEffect(() => {
        if (status === 'connected') {
            setVadHistory(prev => {
                const updated = [...prev, { time: Date.now(), score: latestVad }];
                return updated.slice(-50); // Keep last 50 points
            });
        }
    }, [latestVad, status]);

    // Auto-scroll transcripts
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcripts]);

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative">
            <div className="bg-premium-overlay" />

            {/* Header */}
            <header className="border-b border-border bg-background sticky top-0 z-50 transition-colors duration-300">
                <div className="container mx-auto px-4 h-32 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img
                            src={theme === 'dark' ? logoDark : logoLight}
                            alt="VitalVoice"
                            className="h-28 w-auto object-contain"
                        />
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-all duration-300 btn-hover"
                            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <div className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
                            status === 'connected' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                status === 'connecting' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                                    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        )}>
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                status === 'connected' ? "bg-emerald-400 animate-pulse" :
                                    status === 'connecting' ? "bg-yellow-400 animate-bounce" :
                                        "bg-zinc-400"
                            )} />
                            {status.toUpperCase()}
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-4rem)]">

                {/* Left Column - Configuration & Metrics (3 Cols) */}
                <div className="lg:col-span-3 space-y-6 flex flex-col">
                    {/* Connection Card */}
                    <div className="p-6 rounded-2xl glass-card space-y-6">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                            <Settings className="w-4 h-4" />
                            Configuration
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs text-foreground/60 uppercase tracking-widest font-bold">Node Agent ID</label>
                            <input
                                type="text"
                                value={agentId}
                                onChange={(e) => setAgentId(e.target.value)}
                                placeholder="Enter Agent ID"
                                className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-foreground/20"
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={connect}
                                disabled={status === 'connected' || !agentId}
                                className="action-btn w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed btn-hover shadow-lg shadow-primary/30"
                            >
                                Connect to Relay
                            </button>
                            <button
                                onClick={disconnect}
                                disabled={status === 'disconnected'}
                                className="action-btn w-full bg-secondary text-secondary-foreground py-3 rounded-xl font-bold hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed btn-hover"
                            >
                                Terminate Connection
                            </button>
                        </div>
                    </div>

                    {/* VAD Metric */}
                    <div className="p-6 rounded-2xl glass-card flex-1 min-h-[240px] flex flex-col relative overflow-hidden group">
                        <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground z-10 w-full uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                                <Mic className="w-4 h-4" />
                                Audio Level (VAD)
                            </div>
                            <button
                                onClick={toggleRecording}
                                disabled={status !== 'connected'}
                                className={cn(
                                    "p-3 rounded-full transition-all duration-300 btn-hover border shadow-sm",
                                    isRecording
                                        ? "bg-primary text-primary-foreground border-primary shadow-[0_0_20px_rgba(30,64,175,0.4)]"
                                        : "bg-muted text-muted-foreground border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                                title={isRecording ? "Mute Mic" : "Unmute Mic"}
                            >
                                <Mic className={cn("w-5 h-5", isRecording && "fill-current")} />
                            </button>
                        </div>

                        <div className="flex-1 w-full relative z-10 flex flex-col items-center justify-center p-2 h-32">
                            <div className="text-sm font-mono font-bold text-foreground mb-4">{latestVad.toFixed(3)}</div>
                            <div className="w-full flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={vadHistory}>
                                        <defs>
                                            <linearGradient id="colorVad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorVad)" isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Background Activity Chart Effect */}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent z-0 pointer-events-none" />
                    </div>
                </div>

                {/* Center Column - Transcript (6 Cols) */}
                <div className="lg:col-span-6 flex flex-col h-full rounded-2xl glass-card overflow-hidden relative border border-border">
                    <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
                            <MessageSquare className="w-4 h-4" />
                            Live Interaction Transcript
                        </div>
                    </div>

                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
                    >
                        {transcripts.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-foreground/50 border-3 border-dashed border-foreground/30 rounded-[3rem] bg-foreground/[0.02] m-4 space-y-8 animate-pulse-soft">
                                <div className="p-8 rounded-full bg-foreground/5 border-2 border-foreground/10">
                                    <MessageSquare className="w-20 h-20 opacity-30" />
                                </div>
                                <div className="text-center px-8">
                                    <p className="text-3xl font-black uppercase tracking-[0.4em] opacity-90">Standing By</p>
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-4">Initialize target relay to start live briefing</p>
                                </div>
                            </div>
                        )}
                        {transcripts.map((msg, i) => (
                            <div key={i} className={cn(
                                "flex flex-col gap-1 max-w-[85%]",
                                msg.role === 'user' ? "self-end items-end" : "self-start items-start"
                            )}>
                                <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground/60 px-1 flex items-center gap-3">
                                    {msg.role}
                                    {/* Sentiment Badge */}
                                    {msg.role === 'user' && (
                                        <SentimentBadge sentiment={analyzeSentiment(msg.text)} />
                                    )}
                                </span>
                                <div className={cn(
                                    "px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm font-medium",
                                    msg.role === 'user'
                                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                                        : "bg-background text-foreground border border-border rounded-tl-sm ring-1 ring-black/5"
                                )}>
                                    <HighlightedText text={msg.text} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column - Event Log (3 Cols) */}
                <div className="lg:col-span-3 flex flex-col h-full rounded-2xl glass-card overflow-hidden font-mono text-[10px]">
                    <div className="p-4 border-b border-border flex items-center justify-between bg-muted/50">
                        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground font-sans uppercase tracking-widest">
                            <Terminal className="w-4 h-4" />
                            Event Stream
                        </div>
                        <span className="text-foreground/40 font-bold tracking-tighter">{events.length} EVT</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-background/20">
                        {events.map((event, i) => (
                            <div key={i} className="group p-3 rounded-xl hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border transition-all duration-200">
                                <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                                    <span className="text-primary font-black uppercase tracking-tighter">{event.type}</span>
                                    <span className="opacity-40 font-bold">{new Date().toLocaleTimeString().split(' ')[0]}</span>
                                </div>
                                <pre className="text-foreground/60 whitespace-pre-wrap break-all opacity-90 group-hover:opacity-100 transition-opacity leading-tight">
                                    {JSON.stringify(omitLargeData(event), null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                </div>

            </main>

            <style>{`
                .action-btn { @apply px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95; }
            `}</style>
        </div>
    );
}

// Helper to avoid flooding logs with Base64 audio
function omitLargeData(event) {
    const clone = { ...event };
    if (clone.audio_event?.audio_base_64) {
        clone.audio_event.audio_base_64 = '<BASE64_AUDIO_TRUNCATED>';
    }
    if (clone.user_audio_chunk) {
        clone.user_audio_chunk = '<BASE64_AUDIO_TRUNCATED>';
    }
    return clone;
}

function SentimentBadge({ sentiment }) {
    if (sentiment === 'neutral') return null;
    return (
        <span className={cn(
            "text-[8px] px-2 py-0.5 rounded-full uppercase border font-black tracking-widest",
            sentiment === 'positive'
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
        )}>
            {sentiment}
        </span>
    );
}

function HighlightedText({ text }) {
    const entities = extractEntities(text);
    if (!entities.length) return text;

    // Simple strategy: Split by entities and wrap them. 
    // Note: Overlapping entities not handled (assumption: extraction returns valid disjoints or we take first).
    // For simplicity, we just simple regex replace for visualization in this prototype

    // Better react approach:
    const parts = [];
    let lastIndex = 0;

    // Sort entities by index just in case
    entities.sort((a, b) => a.index - b.index);

    entities.forEach((entity, idx) => {
        if (entity.index > lastIndex) {
            parts.push(text.substring(lastIndex, entity.index));
        }
        parts.push(
            <span key={idx} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 font-bold" title={entity.type}>
                {entity.value}
            </span>
        );
        lastIndex = entity.index + entity.value.length;
    });

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
}
