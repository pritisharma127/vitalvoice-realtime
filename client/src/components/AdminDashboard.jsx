import React, { useEffect } from 'react';
import { useAdminSocket } from '../hooks/useAdminSocket';
import { Activity, Server, Users, Terminal, Sun, Moon } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { analyzeSentiment, extractEntities, analyzeIntent } from '../lib/analysis';
import logoLight from '../assets/logo-light.png';
import logoDark from '../assets/logo-dark.png';

function SentimentBadge({ sentiment }) {
    const colors = {
        positive: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        negative: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
        neutral: "text-muted-foreground bg-muted/30 border-border"
    };
    return (
        <span className={cn("text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-widest font-black", colors[sentiment])}>
            {sentiment}
        </span>
    );
}

import { ErrorBoundary } from './ErrorBoundary';
import { MapPin, Truck, Hospital, Navigation2 } from 'lucide-react';

function LogisticsBadge({ distance, duration }) {
    if (!distance) return null;
    return (
        <div className="flex items-center gap-4 p-2.5 bg-primary/5 border border-primary/10 rounded-xl animate-in fade-in slide-in-from-top-1">
            <div className="flex flex-col">
                <span className="text-[10px] text-primary/60 font-black uppercase tracking-widest">Distance</span>
                <span className="text-xs font-black text-foreground">{distance}</span>
            </div>
            <div className="w-px h-8 bg-primary/20" />
            <div className="flex flex-col">
                <span className="text-[10px] text-primary/60 font-black uppercase tracking-widest">ETA</span>
                <span className="text-xs font-black text-foreground">{duration}</span>
            </div>
            <div className="ml-auto p-1.5 bg-primary/10 rounded-full">
                <Truck className="w-4 h-4 text-primary animate-pulse" />
            </div>
        </div>
    );
}
function useGoogleMaps(apiKey) {
    const [loaded, setLoaded] = React.useState(false);
    React.useEffect(() => {
        if (!apiKey) {
            console.warn('[AdminDashboard] Google Maps API Key missing in mapConfig');
            return;
        }
        if (window.google) {
            console.log('[AdminDashboard] Google Maps already exists in window');
            setLoaded(true);
            return;
        }

        console.log('[AdminDashboard] Injecting Google Maps script...');
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.onload = () => {
            console.log('[AdminDashboard] Google Maps script loaded successfully');
            setLoaded(true);
        };
        script.onerror = (e) => {
            console.error('[AdminDashboard] Google Maps script load error:', e);
        };
        document.head.appendChild(script);
    }, [apiKey]);
    return loaded;
}

function DonorMap({ isLoaded, origin, destination }) {
    const mapRef = React.useRef(null);
    const googleMapRef = React.useRef(null);

    React.useEffect(() => {
        console.log(`[DonorMap] Effect triggered. isLoaded=${isLoaded}, hasRef=${!!mapRef.current}, destination="${destination}"`);

        if (!isLoaded || !mapRef.current || !destination) return;

        console.log(`[DonorMap] Initializing Map and Route... Origin: "${origin}", Dest: "${destination}"`);

        try {
            const directionsService = new window.google.maps.DirectionsService();
            const directionsRenderer = new window.google.maps.DirectionsRenderer();

            const map = new window.google.maps.Map(mapRef.current, {
                zoom: 12,
                styles: [
                    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                ],
                backgroundColor: 'transparent',
                disableDefaultUI: true,
            });

            googleMapRef.current = map;
            directionsRenderer.setMap(map);

            directionsService.route(
                {
                    origin: origin,
                    destination: destination,
                    travelMode: window.google.maps.TravelMode.DRIVING
                },
                (result, status) => {
                    console.log(`[DonorMap] Route Result Status: ${status}`);
                    if (status === 'OK') {
                        directionsRenderer.setDirections(result);
                    } else {
                        console.warn('[DonorMap] Routing failed, falling back to markers:', status);
                        // Fallback: Just show markers if routing is denied
                        const geocoder = new window.google.maps.Geocoder();

                        // Origin Marker (Hospital)
                        geocoder.geocode({ address: origin }, (results, status) => {
                            if (status === 'OK') {
                                new window.google.maps.Marker({
                                    position: results[0].geometry.location,
                                    map: map,
                                    title: "Hospital",
                                    icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
                                });
                                map.setCenter(results[0].geometry.location);
                            }
                        });

                        // Destination Marker (Donor)
                        geocoder.geocode({ address: destination }, (results, status) => {
                            if (status === 'OK') {
                                new window.google.maps.Marker({
                                    position: results[0].geometry.location,
                                    map: map,
                                    title: "Donor",
                                    icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                                });
                                // Adjust bounds to show both if possible
                                if (map.getCenter()) {
                                    const bounds = new window.google.maps.LatLngBounds();
                                    bounds.extend(map.getCenter());
                                    bounds.extend(results[0].geometry.location);
                                    map.fitBounds(bounds);
                                }
                            }
                        });
                    }
                }
            );
        } catch (err) {
            console.error('[DonorMap] Map Render Error:', err);
        }
    }, [isLoaded, origin, destination]);

    return (
        <div className="w-full h-64 bg-zinc-950 rounded-lg overflow-hidden border border-white/5 relative mb-4" style={{ minHeight: '256px' }}>
            {!destination && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-mono z-10">
                    <Navigation2 className="w-4 h-4 mr-2 animate-pulse" />
                    SEARCHING FOR DONOR LOCATION...
                </div>
            )}
            <div ref={mapRef} className="w-full h-full opacity-60 grayscale hover:grayscale-0 transition-all duration-700" style={{ height: '100%', width: '100%' }} />
        </div>
    );
}

function StatusBanner({ intent }) {
    if (intent === 'Donation Confirmed') {
        return (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-30">
                <div className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/50 flex items-center gap-2 border-2 border-white/20 animate-bounce">
                    <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                    CONFIRMED DONOR
                </div>
            </div>
        );
    }
    if (intent === 'Donation Rejected') {
        return (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-30">
                <div className="bg-rose-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/50 flex items-center gap-2 border-2 border-white/20">
                    DISQUALIFIED
                </div>
            </div>
        );
    }
    return null;
}

function SessionCard({ session, mapConfig, isMapsLoaded }) {
    const [travelData, setTravelData] = React.useState(null);
    const [lastLoc, setLastLoc] = React.useState(null);
    const [simLoc, setSimLoc] = React.useState('');

    // Help extract text regardless of field name (aligned with official ElevenLabs schema)
    const getText = (data) => {
        return data.user_transcription_event?.user_transcript ||
            data.agent_response_event?.agent_response ||
            data.agent_response_correction_event?.corrected_agent_response ||
            data.transcript ||
            data.text ||
            '';
    };

    const isUserType = (type) => ['user_transcript', 'user_transcription', 'transcript'].includes(type);
    const isAgentType = (type) => ['agent_response', 'agent_transcript', 'agent_response_correction'].includes(type);

    // Show last 50 events in transcript
    const recentEvents = session.events
        .filter(e => isUserType(e.data.type) || isAgentType(e.data.type))
        .slice(-50);

    const [isMuted, setIsMuted] = React.useState(true);

    // Aggregate Insights
    const fullText = recentEvents.map(e => {
        return isUserType(e.data.type) ? getText(e.data) : '';
    }).join(' ');

    const intent = analyzeIntent(fullText);
    const entities = React.useMemo(() => {
        // Collect all entities from all messages
        const all = [];
        recentEvents.forEach(e => {
            const text = getText(e.data);
            if (text && typeof text === 'string') {
                const found = extractEntities(text);
                all.push(...found);
            }
        });
        // Deduplicate by value
        const unique = new Map();
        all.forEach(x => unique.set(x.value, x.type));
        return Array.from(unique.entries());
    }, [recentEvents]);

    const handleSimulate = () => {
        if (!simLoc) return;
        console.log(`[Admin] Simulating location: "${simLoc}"`);
        setLastLoc(simLoc);
        fetch(`http://localhost:3000/api/distance?destination=${encodeURIComponent(simLoc)}`)
            .then(res => res.json())
            .then(data => {
                console.log(`[Admin] Simulated distance result:`, data);
                if (!data.error) setTravelData(data);
            })
            .catch(e => console.error('[Admin] Sim fetch error:', e));
    };

    // Logistics Effect
    React.useEffect(() => {
        // Find zipcodes first, fallback to locations
        const zipEnts = entities.filter(([val, type]) => type === 'zipcode');
        const locEnts = entities.filter(([val, type]) => type === 'location');
        const bestEnts = zipEnts.length > 0 ? zipEnts : locEnts;

        if (bestEnts.length > 0) {
            const newLoc = bestEnts[bestEnts.length - 1][0];
            if (newLoc !== lastLoc) {
                console.log(`[Admin] Auto-location extracted: "${newLoc}"`);
                setLastLoc(newLoc);
                fetch(`http://localhost:3000/api/distance?destination=${encodeURIComponent(newLoc)}`)
                    .then(res => res.json())
                    .then(data => {
                        console.log(`[Admin] Auto distance result:`, data);
                        if (!data.error) setTravelData(data);
                    })
                    .catch(e => console.error('[Admin] Auto fetch error:', e));
            }
        }
    }, [entities, lastLoc]);

    const scrollRef = React.useRef(null);
    React.useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [recentEvents]);

    return (
        <div className={cn(
            "rounded-xl glass-card overflow-hidden flex flex-col transition-all h-[600px]",
            session.status === 'active' ? "border-primary/20 shadow-lg shadow-primary/5" : "border-border opacity-60 grayscale"
        )}>
            {!isMuted && session.status === 'active' && (
                <SessionAudioPlayer chunks={session.audioChunks || []} />
            )}

            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between shrink-0">
                <div className="flex flex-col">
                    <span className="text-xs font-mono text-zinc-500">SESSION ID</span>
                    <span className="text-sm font-mono font-bold text-zinc-300">{session.sessionId}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isMuted ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-indigo-500 text-white hover:bg-indigo-600"
                        )}
                        title={isMuted ? "Unmute Audio" : "Mute Audio"}
                    >
                        {isMuted ? <span className="text-xs font-bold">MUTED</span> : <span className="text-xs font-bold">LIVE</span>}
                    </button>
                    <div className={cn(
                        "px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider",
                        session.status === 'active' ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                    )}>
                        {session.status}
                    </div>
                    {intent === 'Scheduling' && (
                        <div className="px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider bg-orange-500/20 text-orange-400 animate-pulse border border-orange-500/30">
                            READY FOR DONATION
                        </div>
                    )}
                </div>
            </div>

            {/* VAD Visualization */}
            <div className="h-12 shrink-0 w-full bg-zinc-900/50 relative border-b border-white/5">
                {session.vadHistory && session.vadHistory.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={session.vadHistory}>
                            <Area type="monotone" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-700 font-mono">NO VAD DATA</div>
                )}
            </div>

            {/* Content Split View */}
            <div className="flex-1 min-h-0 bg-zinc-950/30 flex divide-x divide-white/5 text-left">

                {/* Left: Transcript (60%) */}
                <div className="flex-[1.5] flex flex-col overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/5 bg-zinc-900/20 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                        Live Transcript
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollRef}>
                        {recentEvents.map((event, i) => {
                            const type = event?.data?.type;
                            if (!type) return null;

                            const isUser = isUserType(type);
                            const text = getText(event.data);

                            if (!text) return null;
                            const sentiment = analyzeSentiment(text);

                            return (
                                <div key={i} className={cn("flex flex-col gap-1 text-xs", isUser ? "items-end" : "items-start")}>
                                    <span className={cn("uppercase text-[9px] font-bold opacity-50 flex items-center gap-2", isUser ? "text-indigo-400 flex-row-reverse" : "text-zinc-400")}>
                                        {isUser ? "User" : "Agent"}
                                        <SentimentBadge sentiment={sentiment} />
                                    </span>
                                    <div className={cn(
                                        "px-3 py-2 rounded-lg max-w-[95%]",
                                        isUser ? "bg-indigo-500/10 text-indigo-200" : "bg-zinc-800 text-zinc-300"
                                    )}>
                                        {text}
                                    </div>
                                </div>
                            );
                        })}
                        {recentEvents.length === 0 && (
                            <div className="text-center text-zinc-700 text-xs italic mt-8">Waiting for conversation...</div>
                        )}
                    </div>
                </div>

                {/* Right: Insights (40%) */}
                <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900/10 relative">
                    <StatusBanner intent={intent} />
                    <div className="px-3 py-2 border-b border-white/5 bg-zinc-900/20 text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center justify-between">
                        Real-time Logistics
                        {travelData && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-4">

                        {/* Simulation / Test Section */}
                        <div className="space-y-2 border-b border-white/5 pb-4">
                            <h4 className="text-[10px] font-bold text-zinc-600 uppercase">Interactive Map Tester</h4>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={simLoc}
                                    onChange={(e) => setSimLoc(e.target.value)}
                                    placeholder="Enter Zip or Address..."
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSimulate()}
                                />
                                <button
                                    onClick={handleSimulate}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors shrink-0"
                                >
                                    TEST
                                </button>
                            </div>
                        </div>

                        {/* Map & Logistics */}
                        <div className="space-y-3">
                            <DonorMap
                                isLoaded={isMapsLoaded}
                                origin={session.hospitalLocation || mapConfig?.hospitalLocation}
                                destination={travelData?.destination}
                            />
                            {travelData && (
                                <LogisticsBadge
                                    distance={travelData.distance}
                                    duration={travelData.duration}
                                />
                            )}
                        </div>

                        {/* Donor Profile Section */}
                        <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/5 space-y-3">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-1">Donor Profile</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {entities.find(e => e[1] === 'phone') && (
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-zinc-600 uppercase font-bold">Phone</span>
                                        <span className="text-xs font-mono text-emerald-400 font-bold">{entities.find(e => e[1] === 'phone')[0]}</span>
                                    </div>
                                )}
                                {entities.find(e => e[1] === 'blood_group') && (
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-zinc-600 uppercase font-bold">Blood Group</span>
                                        <span className="text-xs font-mono text-rose-500 font-black">{entities.find(e => e[1] === 'blood_group')[0]}</span>
                                    </div>
                                )}
                                {entities.find(e => e[1] === 'availability') && (
                                    <div className="flex flex-col col-span-2">
                                        <span className="text-[9px] text-zinc-600 uppercase font-bold">Status</span>
                                        <span className={cn(
                                            "text-xs font-bold uppercase",
                                            entities.find(e => e[1] === 'availability')[0] === 'READY TO DONATE' ? "text-emerald-400" : "text-rose-400"
                                        )}>
                                            {entities.find(e => e[1] === 'availability')[0]}
                                        </span>
                                    </div>
                                )}
                                {entities.find(e => e[1] === 'zipcode') && (
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-zinc-600 uppercase font-bold">Zipcode</span>
                                        <span className="text-xs font-mono text-indigo-400 font-bold">{entities.find(e => e[1] === 'zipcode')[0]}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Medical Disqualification Logic */}
                        {entities.some(e => e[1] === 'medical') && (
                            <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 space-y-2 animate-in fade-in zoom-in duration-500">
                                <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                    Medical Alert
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {entities.filter(e => e[1] === 'medical').map(([val], i) => (
                                        <span key={i} className="bg-rose-500/30 text-rose-100 text-[9px] px-1.5 py-0.5 rounded border border-rose-500/40 font-bold uppercase">
                                            {val}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[8px] text-rose-400/80 font-mono leading-tight uppercase">Reason: Automatic Disqualification Risk Detected.</p>
                            </div>
                        )}

                        {/* Other Entities */}
                        <div className="space-y-1">
                            <h4 className="text-[10px] font-bold text-zinc-600 uppercase">Other Metadata</h4>
                            <div className="grid grid-cols-1 gap-1.5">
                                {entities
                                    .filter(e => !['phone', 'blood_group', 'medical', 'availability', 'zipcode'].includes(e[1]))
                                    .map(([value, type], i) => (
                                        <div key={i} className={cn(
                                            "flex flex-col p-2 bg-zinc-900/50 rounded border border-zinc-800/50",
                                            type === 'location' ? "border-indigo-500/30 bg-indigo-500/5" : ""
                                        )}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-zinc-300 text-[10px] font-medium truncate uppercase tracking-tighter" title={value}>{value}</span>
                                                {type === 'location' && <MapPin className="w-2.5 h-2.5 text-indigo-400" />}
                                            </div>
                                            <span className="text-[8px] text-zinc-600 uppercase">{type}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer / Agent ID */}
            <div className="p-2 bg-zinc-950 border-t border-white/5 text-[10px] font-mono text-zinc-600 truncate shrink-0 flex items-center justify-between">
                <span>Agent: {session.agentId}</span>
            </div>
        </div>
    );
}

export default function AdminDashboard({ theme, toggleTheme }) {
    const { status, sessions, connect, disconnect, sendMonitorCommand } = useAdminSocket();
    const [mapConfig, setMapConfig] = React.useState(null);

    React.useEffect(() => {
        connect();
        fetch('http://localhost:3000/api/map-config')
            .then(res => res.json())
            .then(setMapConfig)
            .catch(console.error);
        return () => disconnect();
    }, [connect, disconnect]);

    const isMapsLoaded = useGoogleMaps(mapConfig?.apiKey);

    const activeSessionsCount = Array.from(sessions.values()).filter(s => s.status === 'active').length;
    const [agentInput, setAgentInput] = React.useState('');
    const [monitorInput, setMonitorInput] = React.useState('');

    const handleLaunchAgent = () => {
        if (!agentInput) return;
        const url = `${window.location.origin}${window.location.pathname}?agent_id=${agentInput}`;
        window.open(url, '_blank');
    };

    const handleMonitor = () => {
        if (!monitorInput) return;
        sendMonitorCommand(monitorInput);
        setMonitorInput('');
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans p-6 transition-colors duration-300 relative">
            <div className="bg-premium-overlay" />

            <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8 pb-12 border-b border-border bg-background transition-colors duration-300">
                <div className="flex items-center gap-8">
                    <img
                        src={theme === 'dark' ? logoDark : logoLight}
                        alt="VitalVoice"
                        className="h-28 w-auto object-contain"
                    />
                    <div className="h-16 w-px bg-border hidden md:block" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
                        <p className="text-sm text-muted-foreground uppercase tracking-widest font-black opacity-70">Real-Time Monitor</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                    {/* New Agent Quick Connect */}
                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            onClick={toggleTheme}
                            className="p-3.5 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-all duration-300 btn-hover border border-border/50 shadow-sm"
                            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>

                        <div className="bg-muted p-2 pl-4 rounded-xl border border-border flex items-center gap-3">
                            <Terminal className="w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Enter Agent ID..."
                                value={agentInput}
                                onChange={(e) => setAgentInput(e.target.value)}
                                className="bg-transparent border-none outline-none text-sm font-mono text-foreground w-48 placeholder:text-foreground/40"
                                onKeyDown={(e) => e.key === 'Enter' && handleLaunchAgent()}
                            />
                            <button
                                onClick={handleLaunchAgent}
                                disabled={!agentInput}
                                className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:bg-muted text-primary-foreground text-xs font-black px-4 py-2 rounded-lg transition-all uppercase tracking-widest shadow-xl shadow-primary/30"
                            >
                                Launch Agent
                            </button>
                        </div>

                        {/* Monitor Conversation Tool */}
                        <div className="bg-muted p-2 pl-4 rounded-xl border border-border flex items-center gap-3">
                            <Activity className="w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Conversation ID..."
                                value={monitorInput}
                                onChange={(e) => setMonitorInput(e.target.value)}
                                className="bg-transparent border-none outline-none text-sm font-mono text-foreground w-48 placeholder:text-foreground/40"
                                onKeyDown={(e) => e.key === 'Enter' && handleMonitor()}
                            />
                            <button
                                onClick={handleMonitor}
                                disabled={!monitorInput}
                                className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 disabled:bg-muted text-secondary-foreground text-xs font-black px-4 py-2 rounded-lg transition-all uppercase tracking-widest shadow-sm"
                            >
                                Monitor
                            </button>
                        </div>
                    </div>

                    <div className="w-px h-10 bg-border hidden md:block" />

                    <div className="flex items-center gap-6">
                        <div className="bg-muted px-5 py-2.5 rounded-xl border border-border flex items-center gap-3">
                            <div className={cn("w-2.5 h-2.5 rounded-full", status === 'connected' ? "bg-blue-500 animate-pulse-soft" : "bg-red-500")} />
                            <span className="text-xs font-black text-foreground uppercase tracking-widest">{status}</span>
                        </div>
                        <div className="bg-muted px-6 py-2.5 rounded-xl border border-border flex items-center">
                            <span className="text-3xl font-mono font-black text-foreground leading-none">{activeSessionsCount}</span>
                            <span className="text-[10px] text-muted-foreground ml-3 uppercase font-black tracking-tighter leading-none">Active<br />Nodes</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from(sessions.values()).map(session => (
                    <ErrorBoundary key={session.sessionId}>
                        <SessionCard
                            session={session}
                            mapConfig={mapConfig}
                            isMapsLoaded={isMapsLoaded}
                        />
                    </ErrorBoundary>
                ))}

                {sessions.size === 0 && (
                    <div className="col-span-full h-96 flex flex-col items-center justify-center border-4 border-dashed border-foreground/30 rounded-[3rem] bg-foreground/[0.02] text-foreground/50 space-y-8 animate-pulse-soft">
                        <div className="p-8 rounded-full bg-foreground/5 border-2 border-foreground/10">
                            <Activity className="w-24 h-24 opacity-30" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-black uppercase tracking-[0.3em] opacity-90">No Active Sessions</h3>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-3">Waiting for new conversation..</p>
                        </div>
                        <button
                            onClick={() => connect()}
                            className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                        >
                            Force Reconnect Relay
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}



// Simple Audio Player Component that plays chunks via Web Audio API
function SessionAudioPlayer({ chunks }) {
    const audioCtx = React.useRef(null);
    const nextTime = React.useRef(0);
    const seenChunks = React.useRef(new Set()); // Track chunks we've already scheduled

    React.useEffect(() => {
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        chunks.forEach(chunk => {
            if (seenChunks.current.has(chunk.id)) return;
            seenChunks.current.add(chunk.id);

            // Decode and play
            try {
                const binaryString = window.atob(chunk.data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

                // Decode Int16 PCM (assuming 16kHz from ElevenLabs defaults)
                // Actually ElevenLabs WebSocket usually sends raw PCM in base64. 
                // We need to verify format. Assuming pcm_16000 for now as per previous context.

                const int16Array = new Int16Array(bytes.buffer);
                const float32Array = new Float32Array(int16Array.length);
                for (let i = 0; i < int16Array.length; i++) {
                    float32Array[i] = int16Array[i] / 32768.0;
                }

                const buffer = audioCtx.current.createBuffer(1, float32Array.length, 16000);
                buffer.getChannelData(0).set(float32Array);

                const source = audioCtx.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.current.destination);

                // Schedule
                const now = audioCtx.current.currentTime;
                // If nextTime is in the past, reset it to now (to avoid massive catch-up speed)
                // But add a small buffer for smooth playback
                if (nextTime.current < now) nextTime.current = now + 0.05;

                source.start(nextTime.current);
                nextTime.current += buffer.duration;

            } catch (e) {
                console.error('Error decoding chunk', e);
            }
        });

    }, [chunks]);

    return null;
}
