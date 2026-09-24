import { useState, useEffect } from "react";
import {
    BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
    XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import { TrendingUp, Download, RefreshCcw, BarChart2, PieChart as PieIcon, CalendarClock, CircleAlert } from "lucide-react";
import { buildAnalyticsQuery, type AnalyticsRange, type OperationalAnalytics } from "../analyticsUtils";

const STATUS_COLORS: Record<string, string> = {
    Concept: "#a1a1aa",
    Draft: "#3b82f6",
    "Internal QA": "#f59e0b",
    "Ready for Client": "#6366f1",
    "Changes Requested": "#ef4444",
    Approved: "#10b981",
    "Ready to Schedule": "#8b5cf6",
    Scheduled: "#8b5cf6",
    Posted: "#18181b",
};

const PILLAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#f97316", "#14b8a6"];

interface AnalyticsData {
    totalPosts: number;
    approvalRate: number;
    statusPipeline: { status: string; count: number }[];
    pillarMix: { name: string; count: number }[];
    formatDistribution: { name: string; count: number }[];
    weeklyApproval: { week: string; count: number }[];
    clientStatus: { approved: number; needsReview: number; changesRequested: number };
    operational?: OperationalAnalytics;
}

interface Props {
    tenantId: string;
    adminToken: string;
    brandName: string;
}

const RANGES = [
    { label: "All Time", from: "", to: "" },
    { label: "Last 90d", from: () => new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0], to: () => new Date().toISOString().split("T")[0] },
    { label: "Last 30d", from: () => new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0], to: () => new Date().toISOString().split("T")[0] },
];

const EMPTY_OPERATIONAL: OperationalAnalytics = {
    readyToSchedule: 0,
    missingScheduleTime: 0,
    blocked: 0,
    overdueFeedback: 0,
};

function rangeFor(index: number): AnalyticsRange {
    const range = RANGES[index];
    return {
        from: typeof range.from === "function" ? range.from() : range.from,
        to: typeof range.to === "function" ? range.to() : range.to,
    };
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
        return (
            <div className="bg-white border border-zinc-200 rounded-xl shadow-xl px-3 py-2 text-xs">
                <p className="font-bold text-zinc-700 mb-1">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">{p.value} posts</p>
                ))}
            </div>
        );
    }
    return null;
};

export default function AnalyticsView({ tenantId, adminToken, brandName }: Props) {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [rangeIdx, setRangeIdx] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        const qs = buildAnalyticsQuery(tenantId, rangeFor(rangeIdx));
        fetch(`/api/analytics?${qs}`, { headers: { Authorization: `Bearer ${adminToken}` } })
            .then(r => {
                if (!r.ok) throw new Error(`Analytics request failed (${r.status})`);
                return r.json();
            })
            .then((next: AnalyticsData) => {
                if (!Array.isArray(next.statusPipeline) || !Array.isArray(next.pillarMix) || !Array.isArray(next.formatDistribution)) {
                    throw new Error("Analytics returned an incomplete response.");
                }
                setData(next);
                setError(null);
            })
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Analytics could not be loaded."))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [tenantId, rangeIdx]);

    const downloadCSV = async () => {
        setExportError(null);
        const range = rangeFor(rangeIdx);
        const qs = buildAnalyticsQuery(tenantId, range);
        try {
            const response = await fetch(`/api/export/posts?${qs}`, { headers: { Authorization: `Bearer ${adminToken}` } });
            if (!response.ok) throw new Error(`Export request failed (${response.status})`);

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${tenantId}-posts${range.from && range.to ? `-${range.from}-to-${range.to}` : "-all-time"}.csv`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (reason) {
            setExportError(reason instanceof Error ? `Export failed: ${reason.message}` : "Export failed. Please try again.");
        }
    };

    if (loading && !data) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-zinc-100 rounded-2xl" />)}</div>
                <div className="grid grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-56 bg-zinc-100 rounded-2xl" />)}</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-16 text-zinc-400 bg-white rounded-3xl border border-zinc-100" role="alert">
                <CircleAlert className="w-7 h-7 mx-auto text-red-400" aria-hidden="true" />
                <p className="font-medium">Analytics unavailable</p>
                <p className="text-sm mt-1">{error || "Could not load this workspace’s performance data."}</p>
                <button type="button" onClick={load} className="mt-5 min-h-10 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-zinc-800">
                    Retry analytics
                </button>
            </div>
        );
    }

    const approvalPipeline = [
        { label: "Total", value: data.totalPosts, color: "#6366f1" },
        { label: "Client Ready", value: data.statusPipeline.find(s => s.status === "Ready for Client")?.count || 0, color: "#8b5cf6" },
        { label: "Approved", value: data.clientStatus.approved, color: "#10b981" },
        { label: "Scheduled", value: data.statusPipeline.find(s => s.status === "Scheduled")?.count || 0, color: "#f59e0b" },
    ];
    const operational = data.operational ?? EMPTY_OPERATIONAL;
    const pressureCards = [
        { label: "Blocked", value: operational.blocked, tone: operational.blocked ? "bg-red-50 text-red-800 border-red-100" : "bg-white text-zinc-700 border-zinc-100" },
        { label: "Feedback overdue", value: operational.overdueFeedback, tone: operational.overdueFeedback ? "bg-amber-50 text-amber-800 border-amber-100" : "bg-white text-zinc-700 border-zinc-100" },
        { label: "Ready to schedule", value: operational.readyToSchedule, tone: operational.readyToSchedule ? "bg-indigo-50 text-indigo-800 border-indigo-100" : "bg-white text-zinc-700 border-zinc-100" },
        { label: "Missing schedule time", value: operational.missingScheduleTime, tone: operational.missingScheduleTime ? "bg-red-50 text-red-800 border-red-100" : "bg-white text-zinc-700 border-zinc-100" },
    ];

    return (
        <div className="space-y-6">
            {/* Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black text-zinc-900">Analytics</h2>
                    <p className="text-sm text-zinc-400 mt-0.5">{brandName} · Content performance overview</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
                        {RANGES.map((r, i) => (
                            <button key={r.label} onClick={() => setRangeIdx(i)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${rangeIdx === i ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={load} title="Refresh" className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors">
                        <RefreshCcw className={`w-4 h-4 text-zinc-500 ${loading ? "animate-spin" : ""}`} />
                    </button>
                    <button onClick={downloadCSV} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                </div>
            </div>
            {exportError && <p role="alert" className="-mt-3 text-xs font-semibold text-red-600">{exportError}</p>}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {approvalPipeline.map(kpi => (
                    <div key={kpi.label} className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
                        <div className="text-3xl font-black" style={{ color: kpi.color }}>{kpi.value}</div>
                        <div className="text-xs font-semibold text-zinc-400 mt-1 uppercase tracking-wider">{kpi.label}</div>
                    </div>
                ))}
            </div>

            <section className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 sm:p-5" aria-labelledby="operational-pressure-title">
                <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-5 w-5 text-indigo-600" aria-hidden="true" />
                    <div>
                        <h3 id="operational-pressure-title" className="text-sm font-black text-zinc-900">Operational pressure</h3>
                        <p className="mt-0.5 text-xs text-zinc-500">Work that needs an agency decision or follow-through now.</p>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {pressureCards.map(card => (
                        <div key={card.label} className={`rounded-xl border px-3 py-3 ${card.tone}`}>
                            <p className="text-2xl font-black">{card.value}</p>
                            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider opacity-70">{card.label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Approval Rate Ring + Client Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center">
                    <div className="relative w-32 h-32">
                        <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#f4f4f5" strokeWidth="3" />
                            <circle
                                cx="18" cy="18" r="15.9155" fill="none"
                                stroke="#10b981" strokeWidth="3"
                                strokeDasharray={`${data.approvalRate} ${100 - data.approvalRate}`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-zinc-900">{data.approvalRate}%</span>
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Approved</span>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 w-full text-center text-[10px] font-bold uppercase tracking-wider">
                        <div><div className="text-emerald-500 text-lg font-black">{data.clientStatus.approved}</div><div className="text-zinc-400">Approved</div></div>
                        <div><div className="text-indigo-500 text-lg font-black">{data.clientStatus.needsReview}</div><div className="text-zinc-400">Review</div></div>
                        <div><div className="text-red-500 text-lg font-black">{data.clientStatus.changesRequested}</div><div className="text-zinc-400">Changes</div></div>
                    </div>
                </div>

                {/* Pillar Mix Pie */}
                <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5"><PieIcon className="w-3.5 h-3.5" /> Content Pillar Mix</h3>
                    {data.pillarMix.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                                <Pie data={data.pillarMix} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="count" paddingAngle={3}>
                                    {data.pillarMix.map((_, i) => <Cell key={i} fill={PILLAR_COLORS[i % PILLAR_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="h-40 flex items-center justify-center text-zinc-300 text-sm">No data</div>}
                    <div className="flex flex-wrap gap-2 mt-2">
                        {data.pillarMix.map((p, i) => (
                            <span key={p.name} className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PILLAR_COLORS[i % PILLAR_COLORS.length] }} />
                                {p.name}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Format Distribution */}
                <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Format Distribution</h3>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={data.formatDistribution} barSize={28}>
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 700 }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                {data.formatDistribution.map((_, i) => <Cell key={i} fill={["#6366f1", "#8b5cf6", "#ec4899"][i] || "#6366f1"} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Status Pipeline + Weekly Approval */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Status Pipeline</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.statusPipeline} layout="vertical" barSize={14}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="status" width={120} tick={{ fontSize: 10, fill: "#71717a", fontWeight: 600 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                                {data.statusPipeline.map((entry) => (
                                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#6366f1"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Approvals Over Time</h3>
                    {data.weeklyApproval.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={data.weeklyApproval}>
                                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                                <YAxis hide />
                                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 11 }} />
                                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-zinc-300 text-sm">No approval data in this range</div>
                    )}
                </div>
            </div>
        </div>
    );
}
