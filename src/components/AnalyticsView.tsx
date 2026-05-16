import { useState, useEffect } from "react";
import {
    BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
    XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import { TrendingUp, Download, RefreshCcw, BarChart2, PieChart as PieIcon } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
    Concept: "#a1a1aa",
    Draft: "#3b82f6",
    "Internal QA": "#f59e0b",
    "Ready for Client": "#6366f1",
    "Changes Requested": "#ef4444",
    Approved: "#10b981",
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

    const load = () => {
        setLoading(true);
        const r = RANGES[rangeIdx];
        const from = typeof r.from === "function" ? r.from() : r.from;
        const to = typeof r.to === "function" ? r.to() : r.to;
        const qs = `tenantId=${tenantId}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
        fetch(`/api/analytics?${qs}`, { headers: { Authorization: `Bearer ${adminToken}` } })
            .then(r => r.json())
            .then(setData)
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [tenantId, rangeIdx]);

    const downloadCSV = () => {
        const a = document.createElement("a");
        a.href = `/api/export/posts?tenantId=${tenantId}`;
        a.setAttribute("Authorization", `Bearer ${adminToken}`);
        // Use fetch to get with auth header
        fetch(`/api/export/posts?tenantId=${tenantId}`, { headers: { Authorization: `Bearer ${adminToken}` } })
            .then(r => r.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                a.href = url;
                a.download = `${tenantId}-posts.csv`;
                a.click();
                URL.revokeObjectURL(url);
            });
    };

    if (loading && !data) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-zinc-100 rounded-2xl" />)}</div>
                <div className="grid grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-56 bg-zinc-100 rounded-2xl" />)}</div>
            </div>
        );
    }

    if (!data) return null;

    const approvalPipeline = [
        { label: "Total", value: data.totalPosts, color: "#6366f1" },
        { label: "Client Ready", value: data.statusPipeline.find(s => s.status === "Ready for Client")?.count || 0, color: "#8b5cf6" },
        { label: "Approved", value: data.clientStatus.approved, color: "#10b981" },
        { label: "Scheduled", value: data.statusPipeline.find(s => s.status === "Scheduled")?.count || 0, color: "#f59e0b" },
    ];

    return (
        <div className="space-y-6">
            {/* Header Bar */}
            <div className="flex items-center justify-between">
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

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {approvalPipeline.map(kpi => (
                    <div key={kpi.label} className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
                        <div className="text-3xl font-black" style={{ color: kpi.color }}>{kpi.value}</div>
                        <div className="text-xs font-semibold text-zinc-400 mt-1 uppercase tracking-wider">{kpi.label}</div>
                    </div>
                ))}
            </div>

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
