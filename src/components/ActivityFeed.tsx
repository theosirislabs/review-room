import { useEffect, useState } from "react";
import { ActivityEvent } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Zap, CheckCircle2, MessageSquare, AlertCircle, Trash2, Plus, Upload } from "lucide-react";

const ACTION_ICONS: Record<string, any> = {
    "status-changed": CheckCircle2,
    "comment-added": MessageSquare,
    "post-created": Plus,
    "post-deleted": Trash2,
    "bulk-upload": Upload,
    "ready-for-client": Zap,
};

const ACTION_COLORS: Record<string, string> = {
    "status-changed": "text-indigo-400 bg-indigo-950",
    "comment-added": "text-blue-400 bg-blue-950",
    "post-created": "text-emerald-400 bg-emerald-950",
    "post-deleted": "text-red-400 bg-red-950",
    "bulk-upload": "text-amber-400 bg-amber-950",
    "ready-for-client": "text-purple-400 bg-purple-950",
};

function timeAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
}

interface Props {
    adminToken: string;
    liveEvents?: ActivityEvent[];
}

export default function ActivityFeed({ adminToken, liveEvents = [] }: Props) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/audit?limit=30", { headers: { Authorization: `Bearer ${adminToken}` } })
            .then(r => r.json())
            .then((rows: ActivityEvent[]) => { setEvents(rows); setLoading(false); })
            .catch(() => setLoading(false));
    }, [adminToken]);

    // Merge live events in real time
    useEffect(() => {
        if (liveEvents.length === 0) return;
        const latest = liveEvents[liveEvents.length - 1];
        setEvents(prev => [latest, ...prev].slice(0, 50));
    }, [liveEvents]);

    if (loading) return (
        <div className="space-y-3 p-4">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-xl bg-zinc-800 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-zinc-800 rounded w-3/4" />
                        <div className="h-2 bg-zinc-800 rounded w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Live Activity</span>
                {liveEvents.length > 0 && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <AnimatePresence initial={false}>
                    {events.length === 0 && (
                        <div className="text-center py-10 text-zinc-600 text-xs font-medium">
                            No activity yet.<br />Actions will appear here in real time.
                        </div>
                    )}
                    {events.map((ev, i) => {
                        const Icon = ACTION_ICONS[ev.action] || AlertCircle;
                        const colorClass = ACTION_COLORS[ev.action] || "text-zinc-400 bg-zinc-800";
                        return (
                            <motion.div
                                key={`${ev.id || ev.timestamp}-${i}`}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex gap-3 items-start"
                            >
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-white leading-tight truncate">{ev.subject}</p>
                                    {ev.detail && <p className="text-[10px] text-zinc-500 truncate mt-0.5">{ev.detail}</p>}
                                    <div className="flex items-center gap-2 mt-1">
                                        {ev.tenantId && (
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded">{ev.tenantId}</span>
                                        )}
                                        <span className="text-[9px] text-zinc-600">{timeAgo(ev.timestamp)}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
