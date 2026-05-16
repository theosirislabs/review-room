import { motion, AnimatePresence } from "motion/react";
import { Copy, Trash2, Grid, Settings, Shield, Search, RefreshCcw, TrendingUp, AlertCircle, CheckCircle2, Clock, RotateCcw, ChevronRight, Lock, Plus, LogOut } from "lucide-react";
import { useToast } from "./Toast";
import { useState, useEffect } from "react";
import useSWR from "swr";
import TenantManagerModal from "./TenantManagerModal";
import ConfirmDialog from "./ConfirmDialog";
import ActivityFeed from "./ActivityFeed";
import UserManagementModal from "./UserManagementModal";
import { ActivityEvent } from "../types";
import { Button } from "./ui/Button";

interface Tenant {
    id: string;
    name: string;
    logoUrl: string;
    bio?: string;
    settings: {
        internalToken?: string;
        clientToken?: string;
        theme?: string;
    };
}

interface GlobalStats {
    totalPosts: number;
    totalApproved: number;
    totalBlocked: number;
    totalNeedsReview: number;
    totalScheduled: number;
    perTenant: {
        tenantId: string;
        name: string;
        total: number;
        approved: number;
        blocked: number;
        needsReview: number;
        scheduled: number;
        changesRequested: number;
    }[];
}

type AgencyRole = "super-admin" | "graphic-designer" | "marketing-team" | "reviewer";

export default function DashboardView({
    tenants,
    adminToken,
    setAdminToken,
    currentUser,
    setCurrentUser,
    onUpsertTenant,
    onDeleteTenant,
    onSelectTenant,
    liveEvents = [],
}: {
    tenants: Tenant[];
    adminToken: string;
    setAdminToken: (t: string) => void;
    currentUser: { id: string; username: string; role: string } | null;
    setCurrentUser: (u: { id: string; username: string; role: string } | null) => void;
    onUpsertTenant: (t: any) => void;
    onDeleteTenant: (id: string) => void;
    onSelectTenant: (t: Tenant, type: "internal" | "client", token: string) => void;
    liveEvents?: ActivityEvent[];
}) {
    const isSuperAdmin = currentUser?.role === "super-admin";
    const { success, error: toastError } = useToast();
    const [showManager, setShowManager] = useState(false);
    const [managerMode, setManagerMode] = useState<"list" | "new">("list");
    const [showUserModal, setShowUserModal] = useState(false);
    const [showActivity, setShowActivity] = useState(true);
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; name: string }>({
        open: false, id: "", name: ""
    });

    const openManager = (mode: "list" | "new") => {
        setManagerMode(mode);
        setShowManager(true);
    };

    const fetcher = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } }).then(r => r.ok ? r.json() : null);

    const { data: stats, mutate: mutateStats } = useSWR<GlobalStats>(adminToken ? "/api/stats" : null, fetcher);

    const copyLink = (e: React.MouseEvent, type: "internal" | "client", tenant: Tenant) => {
        e.stopPropagation();
        e.preventDefault();
        const token = type === "internal" ? tenant.settings.internalToken : tenant.settings.clientToken;
        const basePath = type === "internal" ? `/agency/${tenant.id}` : `/client/${tenant.id}`;
        const url = `${window.location.origin}${basePath}?token=${token}`;
        navigator.clipboard.writeText(url);
        success(`${type === "internal" ? "Agency" : "Client"} link copied`);
    };

    const rotateToken = async (e: React.MouseEvent, tenant: Tenant, tokenType: "client" | "internal" | "both") => {
        e.stopPropagation();
        if (!confirm(`Rotate ${tokenType} token for ${tenant.name}? Old links will stop working.`)) return;
        const res = await fetch(`/api/tenants/${tenant.id}/rotate-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ tokenType }),
        });
        if (res.ok) { success("Token rotated — old links are now invalid"); mutateStats(); }
        else toastError("Failed to rotate token");
    };

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);

    if (!adminToken) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30 relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-md z-10">
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-[2rem] flex items-center justify-center text-white font-black shadow-2xl relative group overflow-hidden mb-6">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 group-hover:scale-110 transition-transform duration-500" />
                            <span className="text-4xl relative z-10">O</span>
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tighter mb-2">OSIRIS COMMAND</h1>
                        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/50 border border-zinc-800 rounded-full">
                            <Lock className="w-3 h-3 text-indigo-400" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Secure Administrative Portal</span>
                        </div>
                    </div>

                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (loginLoading) return;
                            setLoginLoading(true);
                            try {
                                const res = await fetch("/api/auth/login", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ username, password })
                                });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok) {
                                    setAdminToken(data.token);
                                    setCurrentUser(data.user || null);
                                    localStorage.setItem("osiris_admin_token", data.token);
                                    if (data.user) localStorage.setItem("osiris_user", JSON.stringify(data.user));
                                    success("System Link Established");
                                } else {
                                    toastError(data.error || "Access Denied: Invalid Credentials");
                                }
                            } catch (e) {
                                toastError("Communications Failure: Terminal Offline");
                            } finally {
                                setLoginLoading(false);
                            }
                        }}
                        className="bg-zinc-900/40 backdrop-blur-2xl border border-white/5 p-10 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] relative overflow-hidden"
                    >
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50" />
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-2 ml-1">Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="w-full bg-black/40 border border-zinc-800 text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all placeholder:text-zinc-700 text-lg"
                                    placeholder="Enter username"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-2 ml-1">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-black/40 border border-zinc-800 text-white rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all placeholder:text-zinc-700 text-lg tracking-widest"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <button
                                disabled={loginLoading}
                                className="w-full group relative flex items-center justify-center gap-3 bg-white text-black font-black rounded-2xl py-4 overflow-hidden transition-all hover:bg-zinc-100 active:scale-[0.98] shadow-2xl shadow-white/5"
                            >
                                {loginLoading ? (
                                    <RefreshCcw className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <span>SIGN IN</span>
                                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                    
                    <p className="mt-8 text-center text-zinc-600 text-xs font-medium uppercase tracking-widest">
                        Osiris Labs &copy; 2026 · v2.4.0
                    </p>
                </motion.div>
            </div>
        );
    }

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase())
    );

    const getTenantStats = (id: string) => stats?.perTenant.find(p => p.tenantId === id);

    const getStatusInfo = (lastActive?: string) => {
        if (!lastActive) return { label: "Never", color: "text-zinc-700", isLive: false };
        const diff = Date.now() - new Date(lastActive).getTime();
        if (diff < 5 * 60 * 1000) return { label: "Live", color: "text-emerald-400", isLive: true };
        
        // Format relative time
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return { label: `${mins}m ago`, color: "text-zinc-500", isLive: false };
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return { label: `${hrs}h ago`, color: "text-zinc-500", isLive: false };
        return { label: new Date(lastActive).toLocaleDateString(), color: "text-zinc-600", isLive: false };
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-indigo-500/30 flex">
            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Global Stats Bar (always visible when logged in) */}
                <div className="border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur">
                    <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center gap-6">
                        {stats ? (
                            <>
                                {[
                                    { label: "Total Posts", value: stats.totalPosts, icon: Grid, color: "text-zinc-300" },
                                    { label: "Approved", value: stats.totalApproved, icon: CheckCircle2, color: "text-emerald-400" },
                                    { label: "Needs Review", value: stats.totalNeedsReview, icon: Clock, color: "text-indigo-400" },
                                    { label: "Blocked", value: stats.totalBlocked, icon: AlertCircle, color: "text-red-400" },
                                    { label: "Scheduled", value: stats.totalScheduled, icon: TrendingUp, color: "text-purple-400" },
                                ].map(s => {
                                    const Icon = s.icon;
                                    return (
                                        <div key={s.label} className="flex items-center gap-2">
                                            <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                                            <span className={`text-lg font-black ${s.color}`}>{s.value}</span>
                                            <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">{s.label}</span>
                                        </div>
                                    );
                                })}
                                <button onClick={() => mutateStats()} className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer" title="Refresh stats">
                                    <RefreshCcw className="w-3.5 h-3.5" />
                                </button>
                            </>
                        ) : null}
                        <button
                            onClick={async () => {
                                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                                setAdminToken("");
                                setCurrentUser(null);
                                localStorage.removeItem("osiris_admin_token");
                                localStorage.removeItem("osiris_user");
                            }}
                            className="ml-auto flex items-center gap-2 px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-sm font-bold transition-colors cursor-pointer rounded-lg hover:bg-zinc-800/50"
                        >
                            <LogOut className="w-3.5 h-3.5" /> Logout
                        </button>
                    </div>
                </div>

                {/* Header */}
                <div className="max-w-7xl mx-auto w-full px-6 pt-8 pb-6">
                    <header className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/20">O</div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tight text-white">Osiris Command Center</h1>
                                <p className="text-zinc-500 text-sm font-medium">Global Agency Dashboard · {tenants.length} client workspace{tenants.length !== 1 ? "s" : ""}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search clients..."
                                    className="bg-zinc-900 border border-zinc-800 text-white text-sm pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-zinc-600 w-48"
                                />
                            </div>
                            {isSuperAdmin && (
                                <Button variant="secondary" onClick={() => setShowUserModal(true)} icon={<Shield className="w-4 h-4" />}>
                                    <span className="hidden lg:inline">Users</span>
                                </Button>
                            )}
                            <Button
                                variant={showActivity ? "primary" : "secondary"}
                                onClick={() => setShowActivity(v => !v)}
                                icon={<TrendingUp className="w-4 h-4" />}
                                className="hidden xl:flex"
                            >
                                Activity
                            </Button>
                            {isSuperAdmin && (
                                <>
                                    <Button variant="primary" onClick={() => openManager("new")} icon={<Plus className="w-4 h-4" />} className="whitespace-nowrap">
                                        <span className="hidden xl:inline">New Workspace</span>
                                        <span className="xl:hidden">New</span>
                                    </Button>
                                    <Button variant="secondary" onClick={() => openManager("list")} icon={<Settings className="w-4 h-4" />}>
                                        <span className="hidden lg:inline">Manage</span>
                                    </Button>
                                </>
                            )}
                        </div>
                    </header>

                    {/* Client Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
                        {filteredTenants.map(tenant => {
                            const ts = getTenantStats(tenant.id);
                            const approvalRate = ts && ts.total > 0 ? Math.round((ts.approved / ts.total) * 100) : 0;
                            const circumference = 2 * Math.PI * 22;
                            const dashArr = ts ? `${(approvalRate / 100) * circumference} ${circumference}` : `0 ${circumference}`;

                            return (
                                <motion.div
                                    key={tenant.id}
                                    onClick={() => onSelectTenant(tenant, "internal", tenant.settings.internalToken || "")}
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="cursor-pointer group relative bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden hover:border-indigo-500/40 transition-all hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col"
                                >
                                    {/* Top gradient on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />

                                    {/* Top section */}
                                    <div className="p-5 flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={tenant.logoUrl || `https://ui-avatars.com/api/?name=${tenant.id}&background=6366f1&color=fff`}
                                                alt={tenant.name}
                                                className="w-12 h-12 rounded-xl object-cover shadow-lg border border-zinc-800"
                                                onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${tenant.id}&background=6366f1&color=fff`; }}
                                            />
                                            <div>
                                                <h2 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors">{tenant.name}</h2>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-tight">{tenant.id}</p>
                                                    <span className="text-zinc-800 text-[10px]">/</span>
                                                    <div className="flex items-center gap-1.5">
                                                        {getStatusInfo(tenant.lastActive).isLive && (
                                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                        )}
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${getStatusInfo(tenant.lastActive).color}`}>
                                                            {getStatusInfo(tenant.lastActive).label}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Approval Ring */}
                                        {ts && ts.total > 0 && (
                                            <div className="relative w-12 h-12 shrink-0">
                                                <svg viewBox="0 0 50 50" className="w-12 h-12 -rotate-90">
                                                    <circle cx="25" cy="25" r="22" fill="none" stroke="#27272a" strokeWidth="4" />
                                                    <circle cx="25" cy="25" r="22" fill="none" stroke="#10b981" strokeWidth="4"
                                                        strokeDasharray={dashArr} strokeLinecap="round" className="transition-all duration-700" />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[10px] font-black text-white">{approvalRate}%</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats row */}
                                    {ts && (
                                        <div className="px-5 pb-4 grid grid-cols-3 gap-2">
                                            {[
                                                { label: "Posts", value: ts.total, color: "text-zinc-300" },
                                                { label: "Review", value: ts.needsReview, color: "text-indigo-400" },
                                                { label: "Blocked", value: ts.blocked, color: ts.blocked > 0 ? "text-red-400" : "text-zinc-600" },
                                            ].map(s => (
                                                <div key={s.label} className="bg-zinc-950/60 rounded-xl px-2 py-2 text-center">
                                                    <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                                                    <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mt-0.5">{s.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="px-5 pb-5 mt-auto">
                                        <div className="flex items-center gap-1 mb-2.5">
                                            <div className="flex-1 h-px bg-zinc-800/50" />
                                            <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-700">Access Links</span>
                                            <div className="flex-1 h-px bg-zinc-800/50" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={(e) => copyLink(e, "internal", tenant)}
                                                icon={<Grid className="w-3.5 h-3.5" />}
                                                className="w-full text-xs py-2 hover:border-indigo-500/40 hover:text-indigo-300"
                                            >
                                                Agency
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={(e) => copyLink(e, "client", tenant)}
                                                icon={<Copy className="w-3.5 h-3.5" />}
                                                className="w-full text-xs py-2 hover:border-emerald-500/40 hover:text-emerald-300"
                                            >
                                                Client
                                            </Button>
                                        </div>

                                        {/* Token rotation & delete — hover reveal (super-admin only) */}
                                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isSuperAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => rotateToken(e, tenant, "client")}
                                                    icon={<RotateCcw className="w-3 h-3" />}
                                                    className="flex-1 hover:bg-amber-950/40 hover:text-amber-400 text-zinc-600 border border-zinc-800/50"
                                                >
                                                    Rotate
                                                </Button>
                                            )}
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={(e) => { e.stopPropagation(); onSelectTenant(tenant, "internal", tenant.settings.internalToken || ""); }}
                                                className="flex-[2] bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 shadow-none"
                                            >
                                                Open <ChevronRight className="w-3 h-3 ml-1" />
                                            </Button>
                                            {isSuperAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ open: true, id: tenant.id, name: tenant.name }); }}
                                                    icon={<Trash2 className="w-3.5 h-3.5" />}
                                                    className="px-2 hover:bg-red-950/40 hover:text-red-400 text-zinc-600 border border-zinc-800/50"
                                                >
                                                    {""}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {filteredTenants.length === 0 && (
                        <div className="text-center py-20 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">
                            <Grid className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="font-medium text-lg text-zinc-500">{search ? "No clients match your search" : "No workspaces found"}</p>
                            <p className="text-sm mt-1">{search ? "Try a different search term" : "Create one to get started."}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Activity Feed Sidebar */}
            <AnimatePresence>
                {showActivity && (
                    <motion.aside
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 280, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="hidden xl:flex flex-col border-l border-zinc-800/60 bg-zinc-900/30 shrink-0 overflow-hidden"
                        style={{ width: 280 }}
                    >
                        <ActivityFeed adminToken={adminToken} liveEvents={liveEvents} />
                    </motion.aside>
                )}
            </AnimatePresence>

            <TenantManagerModal
                isOpen={showManager}
                onClose={() => setShowManager(false)}
                tenants={tenants}
                onUpsert={onUpsertTenant}
                onDelete={onDeleteTenant}
                startMode={managerMode}
            />

            <UserManagementModal
                isOpen={showUserModal}
                onClose={() => setShowUserModal(false)}
                adminToken={adminToken}
            />

            <ConfirmDialog
                isOpen={confirmDelete.open}
                title={`Delete ${confirmDelete.name}?`}
                message="This will permanently delete this client and all associated posts. This action cannot be undone."
                confirmLabel="Delete Workspace"
                destructive
                onConfirm={() => {
                    onDeleteTenant(confirmDelete.id);
                    setConfirmDelete({ open: false, id: "", name: "" });
                    success("Workspace deleted");
                }}
                onCancel={() => setConfirmDelete({ open: false, id: "", name: "" })}
            />
        </div>
    );
}
