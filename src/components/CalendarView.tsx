import { useMemo, useState } from "react";
import { Post } from "../types";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_DOT: Record<string, string> = {
    Concept: "bg-zinc-400",
    Draft: "bg-blue-400",
    "Internal QA": "bg-amber-400",
    "Ready for Client": "bg-indigo-500",
    "Changes Requested": "bg-red-500",
    Approved: "bg-emerald-500",
    Scheduled: "bg-purple-500",
    Posted: "bg-zinc-900",
};

const FORMAT_ICON: Record<string, string> = {
    image: "🖼",
    carousel: "🎠",
    reel: "🎬",
};

interface Props {
    posts: Post[];
    onOpenPost: (post: Post) => void;
}

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

export default function CalendarView({ posts, onOpenPost }: Props) {
    const now = new Date();
    const [viewDate, setViewDate] = useState({ year: now.getFullYear(), month: now.getMonth() });

    const { year, month } = viewDate;
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfWeek(year, month);

    const postsByDate = useMemo(() => {
        const map: Record<string, Post[]> = {};
        posts.forEach(post => {
            if (!post.date) return;
            const key = post.date; // format: YYYY-MM-DD
            if (!map[key]) map[key] = [];
            map[key].push(post);
        });
        return map;
    }, [posts]);

    const prevMonth = () => {
        setViewDate(d => d.month === 0 ? { year: d.year - 1, month: 11 } : { ...d, month: d.month - 1 });
    };
    const nextMonth = () => {
        setViewDate(d => d.month === 11 ? { year: d.year + 1, month: 0 } : { ...d, month: d.month + 1 });
    };

    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad to 6 rows
    while (cells.length % 7 !== 0) cells.push(null);

    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    return (
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <h3 className="text-lg font-black text-zinc-900">{MONTHS[month]} {year}</h3>
                <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-700">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewDate({ year: now.getFullYear(), month: now.getMonth() })}
                        className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors"
                    >Today</button>
                    <button onClick={nextMonth} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-700">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-zinc-50">
                {WEEKDAYS.map(d => (
                    <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">{d}</div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="h-28 border-r border-b border-zinc-100 bg-zinc-50/50" />;
                    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayPosts = postsByDate[dateKey] || [];
                    const isToday = dateKey === todayKey;

                    return (
                        <div key={dateKey} className={`h-28 border-r border-b border-zinc-100 p-1.5 overflow-hidden flex flex-col ${isToday ? "bg-indigo-50/50" : "hover:bg-zinc-50"} transition-colors`}>
                            <div className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? "bg-indigo-600 text-white" : "text-zinc-500"}`}>{day}</div>
                            <div className="space-y-0.5 overflow-hidden flex-1">
                                {dayPosts.slice(0, 3).map(post => (
                                    <button
                                        key={post.id}
                                        onClick={() => onOpenPost(post)}
                                        className="w-full text-left px-1.5 py-0.5 rounded-md hover:opacity-80 transition-opacity flex items-center gap-1 group"
                                        style={{ backgroundColor: `${getStatusColor(post.internalStatus)}20` }}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[post.internalStatus] || "bg-zinc-300"}`} />
                                        <span className="text-[9px] font-semibold text-zinc-700 truncate leading-tight">{FORMAT_ICON[post.format]} {post.title}</span>
                                    </button>
                                ))}
                                {dayPosts.length > 3 && (
                                    <p className="text-[9px] font-bold text-zinc-400 pl-1">+{dayPosts.length - 3} more</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="px-6 py-3 border-t border-zinc-100 flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(STATUS_DOT).map(([status, dot]) => (
                    <span key={status} className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
                        <span className={`w-2 h-2 rounded-full ${dot}`} />{status}
                    </span>
                ))}
            </div>
        </div>
    );
}

function getStatusColor(status: string) {
    const map: Record<string, string> = {
        Concept: "#a1a1aa",
        Draft: "#3b82f6",
        "Internal QA": "#f59e0b",
        "Ready for Client": "#6366f1",
        "Changes Requested": "#ef4444",
        Approved: "#10b981",
        Scheduled: "#8b5cf6",
        Posted: "#18181b",
    };
    return map[status] || "#6366f1";
}
