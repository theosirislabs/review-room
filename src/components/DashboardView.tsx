import { motion, AnimatePresence } from "motion/react";
import { Trash2, Grid, Settings, Shield, Search, RefreshCcw, TrendingUp, AlertCircle, CheckCircle2, Clock, RotateCcw, ChevronRight, Lock, Plus, LogOut, Sun, Moon, Bot, Megaphone, Share2 } from "lucide-react";
import { useToast } from "./Toast";
import { useState, useEffect } from "react";
import useSWR from "swr";
import TenantManagerModal from "./TenantManagerModal";
import ConfirmDialog from "./ConfirmDialog";
import ActivityFeed from "./ActivityFeed";
import UserManagementModal from "./UserManagementModal";
import McpKeysModal from "./McpKeysModal";
import UpdatesModal from "./UpdatesModal";
import ShareClientLinkModal from "./ShareClientLinkModal";
import { ActivityEvent } from "../types";
import { Button } from "./ui/Button";
import { useTheme } from "../theme";
import OsirisLogo from "./OsirisLogo";

interface Tenant {
    id: string;
    name: string;
    logoUrl: string;
    bio?: string;
    lastActive?: string;
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
    const { theme, toggleTheme } = useTheme();
    const [showManager, setShowManager] = useState(false);
    const [managerMode, setManagerMode] = useState<"list" | "new">("list");
    const [showUserModal, setShowUserModal] = useState(false);
    const [showMcpModal, setShowMcpModal] = useState(false);
    const [showUpdatesModal, setShowUpdatesModal] = useState(false);
    const [unreadUpdates, setUnreadUpdates] = useState(0);
    const [showActivity, setShowActivity] = useState(true);
    const [search, setSearch] = useState("");
    const [tenantShown, setTenantShown] = useState(12);
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; name: string }>({
        open: false, id: "", name: ""
    });
    const [shareTenant, setShareTenant] = useState<Tenant | null>(null);

    const openManager = (mode: "list" | "new") => {
        setManagerMode(mode);
        setShowManager(true);
    };

    const fetcher = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } }).then(r => r.ok ? r.json() : null);

    const { data: searchResults } = useSWR(
        adminToken && search.length >= 2 ? `/api/search?q=${encodeURIComponent(search)}` : null,
        fetcher
    );

    const { data: stats, mutate: mutateStats } = useSWR<GlobalStats>(adminToken ? "/api/stats" : null, fetcher);

    useEffect(() => {
        if (!adminToken) return;
        fetch("/api/updates/unread-count", { headers: { Authorization: `Bearer ${adminToken}` } })
            .then((r) => (r.ok ? r.json() : { count: 0 }))
            .then((d) => {
                const n = Number(d.count) || 0;
                setUnreadUpdates(n);
                if (n > 0 && sessionStorage.getItem("rr_updates_prompted") !== "1") {
                    sessionStorage.setItem("rr_updates_prompted", "1");
                    setShowUpdatesModal(true);
                }
            })
            .catch(() => {});
    }, [adminToken]);

    const copyAgencyLink = async (e: React.MouseEvent, tenant: Tenant) => {
        e.stopPropagation();
        e.preventDefault();
        const res = await fetch(`/api/tenants/${tenant.id}/invite`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            credentials: "include",
        });
        if (!res.ok) { toastError("Could not load agency access link"); return; }
        const data = await res.json();
        if (!data.agencyUrl) { toastError("Agency access link missing"); return; }
        try {
            await navigator.clipboard.writeText(data.agencyUrl);
            success("Agency link copied");
        } catch {
            toastError("Could not copy the agency access link");
        }
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
    const [oidcEnabled, setOidcEnabled] = useState(false);

    useEffect(() => {
        fetch("/api/auth/oidc/status")
            .then((r) => r.json())
            .then((d: { enabled?: boolean }) => setOidcEnabled(!!d.enabled))
            .catch(() => setOidcEnabled(false));
    }, []);

    if (!adminToken) {
        return (
             <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 relative overflow-hidden">
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.12),transparent_42%)] pointer-events-none" />
                 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-md z-10">
                    <div className="flex flex-col items-center mb-10">
                        <div className="mb-6">
                            <OsirisLogo size={80} />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tighter mb-2">OSIRIS COMMAND</h1>
                        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/50 border border-zinc-800 rounded-full">
                            <Lock className="w-3 h-3 text-blue-400" />
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
                         className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 p-8 rounded-2xl shadow-[0_24px_70px_-30px_rgba(0,0,0,0.7)] relative overflow-hidden sm:p-10"
                    >
                        <div className="absolute top-0 inset-x-0 h-1 bg-blue-500 opacity-70" />
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-2 ml-1">Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                     className="w-full bg-zinc-950/50 border border-zinc-700 text-white rounded-lg px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-600 text-base"
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
                                     className="w-full bg-zinc-950/50 border border-zinc-700 text-white rounded-lg px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-600 text-base tracking-widest"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <button
                                disabled={loginLoading}
                                 className="w-full group relative flex items-center justify-center gap-3 bg-white text-black font-semibold rounded-lg py-3.5 overflow-hidden transition-colors hover:bg-zinc-100 active:scale-[0.98] shadow-sm"
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
                            {oidcEnabled && (
                                <a
                                    href="/api/auth/oidc/login"
                                     className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 transition-colors"
                                >
                                    <Shield className="w-4 h-4" />
                                    Sign in with Authentik
                                </a>
                            )}
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={toggleTheme}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                                </button>
                            </div>
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
    const visibleTenants = filteredTenants.slice(0, tenantShown);

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
        <div className="rr-agency min-h-screen bg-zinc-950 text-white font-sans selection:bg-blue-500/30 flex">
            <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-zinc-800/80 bg-zinc-950 py-4 lg:flex" aria-label="Agency navigation">
                <div className="mb-6 rounded-xl p-2 text-blue-400"><OsirisLogo size={28} /></div>
                <nav className="flex flex-1 flex-col items-center gap-2">
                    <button onClick={() => { setShowActivity(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white" aria-label="Command center" title="Command center"><Grid className="h-5 w-5" /></button>
                    <button onClick={() => { setManagerMode("list"); setShowManager(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100" aria-label="Manage workspaces" title="Manage workspaces"><Settings className="h-5 w-5" /></button>
                    {isSuperAdmin && <button onClick={() => setShowUserModal(true)} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100" aria-label="User management" title="User management"><Shield className="h-5 w-5" /></button>}
                    {isSuperAdmin && <button onClick={() => setShowMcpModal(true)} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100" aria-label="MCP keys" title="MCP keys"><Bot className="h-5 w-5" /></button>}
                </nav>
                <button onClick={toggleTheme} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100" aria-label="Toggle theme" title="Toggle theme">{theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
                <div className="mt-3 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[10px] font-bold text-zinc-200">{(currentUser?.username || "YK").slice(0, 2).toUpperCase()}</div>
            </aside>
            {/* Main content */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* Global Stats Bar (always visible when logged in) */}
                <div className="border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur">
                    <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-4 px-5 py-2.5">
                        {stats ? (
                            <>
                                {[
                                    { label: "Total Posts", value: stats.totalPosts, icon: Grid, color: "text-zinc-300" },
                                    { label: "Approved", value: stats.totalApproved, icon: CheckCircle2, color: "text-emerald-400" },
                                    { label: "Needs Review", value: stats.totalNeedsReview, icon: Clock, color: "text-blue-400" },
                                    { label: "Blocked", value: stats.totalBlocked, icon: AlertCircle, color: "text-red-400" },
                                     { label: "Scheduled", value: stats.totalScheduled, icon: TrendingUp, color: "text-blue-400" },
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
                <div className="mx-auto w-full max-w-[1800px] px-5 pt-5 pb-6">
                    <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
                        <div className="flex items-center gap-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Osiris Agency</p>
                                <h1 className="text-xl font-bold tracking-tight text-zinc-100">Command Center</h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleTheme}
                                 className="rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300 lg:hidden"
                                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                            >
                                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                            </button>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search clients..."
                                    className="bg-zinc-900 border border-zinc-800 text-white text-sm pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-600 w-48"
                                />
                                {/* Search Results Dropdown */}
                                {search.length >= 2 && searchResults && Array.isArray(searchResults) && searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/60 overflow-y-auto max-h-80 z-[100] min-w-[320px]">
                                        {searchResults.slice(0, 10).map((r: any, i: number) => (
                                            <button
                                                key={r.postId ?? i}
                                                onClick={() => {
                                                    const match = tenants.find((t) => t.id === r.tenantId);
                                                    onSelectTenant(
                                                        match || { id: r.tenantId, name: r.clientName || r.tenantId, logoUrl: "", settings: {} } as Tenant,
                                                        "internal",
                                                        match?.settings?.internalToken || ""
                                                    );
                                                    setSearch("");
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800 last:border-b-0"
                                            >
                                                {r.thumbnailUrl ? (
                                                    <img src={r.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                                                        <Search className="w-4 h-4 text-zinc-600" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate">{r.postTitle || r.title || 'Untitled'}</p>
                                                    <p className="text-xs text-zinc-500 truncate">{r.clientName || r.tenantId}</p>
                                                </div>
                                                {r.status && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-zinc-700 text-zinc-300 shrink-0">
                                                        {r.status}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setShowUpdatesModal(true)}
                                 className="relative rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300 lg:hidden"
                                title="What's new"
                            >
                                <Megaphone className="w-4 h-4" />
                                {unreadUpdates > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-[9px] font-black text-white flex items-center justify-center">
                                        {unreadUpdates > 9 ? "9+" : unreadUpdates}
                                    </span>
                                )}
                            </button>
                            {isSuperAdmin && (
                                 <Button variant="secondary" onClick={() => setShowUserModal(true)} icon={<Shield className="w-4 h-4" />} className="lg:hidden">
                                     <span className="hidden lg:inline">Users</span>
                                 </Button>
                            )}
                            {isSuperAdmin && (
                                 <Button variant="secondary" onClick={() => setShowMcpModal(true)} icon={<Bot className="w-4 h-4" />} className="lg:hidden">
                                     <span className="hidden lg:inline">MCP</span>
                                 </Button>
                            )}
                            <Button
                                variant={showActivity ? "primary" : "secondary"}
                                onClick={() => setShowActivity(v => !v)}
                                icon={<TrendingUp className="w-4 h-4" />}
                                 className="flex lg:hidden"
                            >
                                Activity
                            </Button>
                            {isSuperAdmin && (
                                <>
                                    <Button variant="primary" onClick={() => openManager("new")} icon={<Plus className="w-4 h-4" />} className="whitespace-nowrap">
                                        <span className="hidden xl:inline">New Workspace</span>
                                        <span className="xl:hidden">New</span>
                                    </Button>
                                     <Button variant="secondary" onClick={() => openManager("list")} icon={<Settings className="w-4 h-4" />} className="lg:hidden">
                                         <span className="hidden lg:inline">Manage</span>
                                     </Button>
                                </>
                            )}
                        </div>
                    </header>

                    {/* Client Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {visibleTenants.map(tenant => {
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
                                     className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-lg"
                                >
                                    {/* Top gradient on hover */}
                                     <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />

                                    {/* Top section */}
                                     <div className="flex items-start justify-between p-4">
                                        <div className="flex items-center gap-3">
                                            {tenant.logoUrl ? (
                                                 <img
                                                     src={tenant.logoUrl}
                                                     alt={`${tenant.name} logo`}
                                                     className="h-10 w-10 rounded-lg border border-zinc-700 object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                                                />
                                            ) : (
                                                 <OsirisLogo size={40} className="shrink-0 rounded-lg border border-zinc-700" />
                                            )}
                                            <div>
                                                <h2 className="text-base font-black text-white group-hover:text-blue-300 transition-colors">{tenant.name}</h2>
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
                                         <div className="grid grid-cols-3 gap-1.5 px-4 pb-3">
                                            {[
                                                { label: "Posts", value: ts.total, color: "text-zinc-300" },
                                                { label: "Review", value: ts.needsReview, color: "text-blue-400" },
                                                { label: "Blocked", value: ts.blocked, color: ts.blocked > 0 ? "text-red-400" : "text-zinc-600" },
                                            ].map(s => (
                                                 <div key={s.label} className="rounded-lg bg-zinc-950/70 px-2 py-2 text-center">
                                                    <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                                                    <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mt-0.5">{s.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                     <div className="mt-auto border-t border-zinc-800/80 px-4 py-3">
                                        <div className="flex items-center gap-1 mb-2.5">
                                            <div className="flex-1 h-px bg-zinc-800/50" />
                                            <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-700">Access Links</span>
                                            <div className="flex-1 h-px bg-zinc-800/50" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                             <Button
                                                 variant="outline"
                                                 onClick={(e) => copyAgencyLink(e, tenant)}
                                                 icon={<Grid className="w-3.5 h-3.5" />}
                                                 className="w-full text-xs py-2 hover:border-blue-500/40 hover:text-blue-300"
                                             >
                                                 Agency link
                                             </Button>
                                             <Button
                                                 variant="outline"
                                                 onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShareTenant(tenant); }}
                                                 icon={<Share2 className="w-3.5 h-3.5" />}
                                                 className="w-full text-xs py-2 hover:border-emerald-500/40 hover:text-emerald-300"
                                             >
                                                 Share client
                                             </Button>
                                        </div>

                                        {/* Token rotation & delete — hover reveal (super-admin only) */}
                                         <div className="mt-2 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
                                                className="flex-[2] bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 shadow-none"
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
                    {filteredTenants.length > tenantShown && (
                        <button
                            type="button"
                            onClick={() => setTenantShown((n) => n + 12)}
                            className="mt-4 w-full py-2.5 text-xs font-black uppercase tracking-widest text-blue-400 hover:bg-blue-950/40 rounded-xl border border-blue-900/60"
                        >
                            Show more ({filteredTenants.length - tenantShown})
                        </button>
                    )}

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
                         className="hidden w-[280px] shrink-0 overflow-hidden border-l border-zinc-800/60 bg-zinc-900/30 xl:flex xl:flex-col"
                        style={{ width: 280 }}
                    >
                        <ActivityFeed adminToken={adminToken} liveEvents={liveEvents} />
                    </motion.aside>
                )}
            </AnimatePresence>

             <ShareClientLinkModal
                 isOpen={!!shareTenant}
                 onClose={() => setShareTenant(null)}
                 tenant={shareTenant ? { id: shareTenant.id, name: shareTenant.name } : null}
                 adminToken={adminToken}
                 currentUser={currentUser}
             />

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

            <McpKeysModal
                isOpen={showMcpModal}
                onClose={() => setShowMcpModal(false)}
                adminToken={adminToken}
            />

            <UpdatesModal
                isOpen={showUpdatesModal}
                onClose={() => setShowUpdatesModal(false)}
                adminToken={adminToken}
                isSuperAdmin={isSuperAdmin}
                onUnreadChange={setUnreadUpdates}
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
