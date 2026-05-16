import { StrictMode, useState, useEffect, useCallback, useMemo } from "react";
import useSWR from "swr";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { Post, TeamMember, ActivityEvent } from "./types";
import ClientView from "./components/ClientView";
import InternalView from "./components/InternalView";
import { ToastProvider, useToast } from "./components/Toast";
import { motion, AnimatePresence } from "motion/react";
import DashboardView from "./components/DashboardView";
import { EyeOff, Loader2, Lock, Layout, RefreshCcw } from "lucide-react";
import { io, Socket } from "socket.io-client";
import ErrorBoundary from "./components/ErrorBoundary";
import { isPostVisibleToClient } from "./utils";

/* ── Types ─────────────────────────────────────────────────── */
interface Tenant {
  id: string;
  name: string;
  logoUrl: string;
  bio?: string;
  lastActive?: string;
  settings: any;
}

/* ── Skeleton ──────────────────────────────────────────────── */
function GridSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="h-14 bg-white border-b border-zinc-200 w-full" />
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex gap-4 mb-8">
          {[120, 80, 100, 60].map((w, i) => (
            <div key={i} className="skeleton h-6 rounded-lg" style={{ width: w }} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-white border border-zinc-200 p-2">
              <div className="skeleton aspect-[4/5] w-full rounded-lg" />
              <div className="p-3 space-y-2">
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── App Content ───────────────────────────────────────────── */
function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  // Route extraction
  const isClientPath = location.pathname.startsWith("/client/");
  const isAgencyPath = location.pathname.startsWith("/agency/");
  const isReviewSharePath = location.pathname.startsWith("/review/");
  const reviewShareToken = isReviewSharePath ? (location.pathname.split("/")[2] || "") : "";
  const derivedTenant = isClientPath || isAgencyPath ? location.pathname.split("/")[2] : null;
  const viewMode = isReviewSharePath ? "client" : isClientPath ? "client" : "internal";

  const searchParams = new URLSearchParams(location.search);
  const urlToken = searchParams.get("token");

  // Consume token
  useEffect(() => {
    if (derivedTenant && urlToken && !isReviewSharePath) {
      localStorage.setItem(`osiris_${derivedTenant}_${viewMode}`, urlToken);
      navigate(location.pathname, { replace: true });
    }
  }, [derivedTenant, viewMode, urlToken, navigate, location.pathname, isReviewSharePath]);

  const token = urlToken || (derivedTenant ? (localStorage.getItem(`osiris_${derivedTenant}_${viewMode}`) || "") : "");
  const tenantId = derivedTenant;

  const [posts, setPosts] = useState<Post[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [adminToken, setAdminToken] = useState<string>(localStorage.getItem("osiris_admin_token") || "");
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string } | null>(() => {
    try {
      const u = localStorage.getItem("osiris_user");
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  });
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);

  const isClientLink = isClientPath || isReviewSharePath;
  const { success, error: toastError } = useToast();

  const workspaceTenantId = useMemo(() => derivedTenant ?? tenant?.id ?? null, [derivedTenant, tenant?.id]);

  const postShareLinkEligible = useMemo(() => {
    if (typeof window === "undefined") return !!adminToken;
    const tid = workspaceTenantId || tenantId;
    if (!tid) return !!adminToken;
    return !!(adminToken || localStorage.getItem(`osiris_${tid}_internal`));
  }, [adminToken, workspaceTenantId, tenantId]);

  useEffect(() => { setLoaded(false); }, [tenantId, reviewShareToken]);

  // Validate session and fetch user when we have a token
  useEffect(() => {
    if (!adminToken) {
      setCurrentUser(null);
      return;
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => {
        if (!res.ok) {
          setAdminToken("");
          setCurrentUser(null);
          localStorage.removeItem("osiris_admin_token");
          localStorage.removeItem("osiris_user");
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
          localStorage.setItem("osiris_user", JSON.stringify(data.user));
        }
      })
      .catch(() => {
        setAdminToken("");
        setCurrentUser(null);
        localStorage.removeItem("osiris_admin_token");
        localStorage.removeItem("osiris_user");
      });
  }, [adminToken]);

  /* ── Fetch tenants + team on mount ── */
  const fetcher = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } }).then(res => { if (!res.ok) throw new Error("Unauthorized"); return res.json(); });

  const { data: tenants = [], mutate: mutateTenants } = useSWR<Tenant[]>(adminToken ? "/api/tenants" : null, fetcher, {
    onError: () => {
      setAdminToken("");
      setCurrentUser(null);
      localStorage.removeItem("osiris_admin_token");
      localStorage.removeItem("osiris_user");
    }
  });

  const { data: teamMembers = [], mutate: mutateTeam } = useSWR<TeamMember[]>(adminToken ? "/api/users" : null, fetcher);

  const [authError, setAuthError] = useState<string | null>(null);

  /* ── Socket setup ── */
  useEffect(() => {
    const sock = io({ transports: ["websocket", "polling"] });
    setSocket(sock);

    sock.on("connect", () => {
      setConnected(true);
      if (reviewShareToken) {
        sock.emit("join-post-share", { shareToken: reviewShareToken });
      } else if (tenantId) {
        sock.emit("join-tenant", { tenantId, mode: viewMode, token: token });
      }
    });

    sock.on("error", (msg: string) => {
      setAuthError(msg);
    });

    sock.on("disconnect", () => setConnected(false));
    sock.on("initial-data", (data: { posts: Post[]; tenant: Tenant }) => {
      setPosts(data.posts);
      setTenant(data.tenant);
      setLoaded(true);
    });

    sock.on("post-created", (post: Post) => setPosts((c: Post[]) => [...c, post]));
    sock.on("post-updated", (post: Post) =>
      setPosts((c: Post[]) => {
        const hideFromMainClientBoard = viewMode === "client" && !isReviewSharePath;
        const idx = c.findIndex((p: Post) => p.id === post.id);
        if (idx >= 0) {
          if (hideFromMainClientBoard && !isPostVisibleToClient(post.clientStatus)) {
            return c.filter((p: Post) => p.id !== post.id);
          }
          return c.map((p: Post) => (p.id === post.id ? post : p));
        }
        if (hideFromMainClientBoard && isPostVisibleToClient(post.clientStatus)) {
          return [...c, post];
        }
        if (isReviewSharePath) {
          return [post];
        }
        return c;
      })
    );
    sock.on("client-post-removed", (postId: string) => {
      if (viewMode !== "client" || isReviewSharePath) return;
      setPosts((c: Post[]) => c.filter((p: Post) => p.id !== postId));
    });
    sock.on("post-deleted", (id: string) =>
      setPosts((c: Post[]) => c.filter((p: Post) => p.id !== id))
    );
    sock.on("activity", (ev: ActivityEvent) =>
      setLiveEvents(prev => [...prev.slice(-49), ev])
    );
    sock.on("team-updated", () => {
      mutateTeam();
    });

    sock.on("tenant-updated", (t: Tenant) => {
      mutateTenants();
      if (t.id === tenantId || t.id === tenant?.id) setTenant(t);
    });
    sock.on("tenant-deleted", (id: string) => {
      mutateTenants();
      if (id === tenantId || id === tenant?.id) window.location.href = "/";
    });

    return () => { sock.disconnect(); };
  }, [tenantId, viewMode, token, reviewShareToken, isReviewSharePath, tenant?.id]);

  const emit = useCallback(
    (event: string, data: any, cb?: (res: any) => void) => socket?.emit(event, data, cb),
    [socket]
  );

  /* ── Tenant navigation ── */
  const handleSwitchTenant = (id: string, newMode: "internal" | "client" = "internal", newToken?: string) => {
    if (!id) {
      navigate("/");
      return;
    }
    if (newToken) {
      localStorage.setItem(`osiris_${id}_${newMode}`, newToken);
    }
    const path = newMode === "client" ? `/client/${id}` : `/agency/${id}`;
    navigate(path);
  };

  /* ── Post handlers ── */
  const handleUpdatePost = useCallback(
    (p: Post) => {
      const tid = workspaceTenantId;
      if (!tid) return;
      emit("update-post", { tenantId: tid, post: p }, (updated: Post | null) => {
        if (updated) {
          setPosts((prev: Post[]) => prev.map((x: Post) => (x.id === updated.id ? updated : x)));
        }
      });
    },
    [emit, workspaceTenantId]
  );

  const handleUpsertTenant = useCallback((t: Tenant) => {
    emit("upsert-tenant", { tenant: t, adminToken }, (res: { success: boolean, error?: string }) => {
      if (res.success) {
        success("Brand settings saved");
      } else {
        toastError(res.error || "Failed to save settings");
      }
    });
  }, [emit, adminToken, success, toastError]);
  const handleDeleteTenant = useCallback(
    (id: string) => {
      fetch(`/api/tenants/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } }).then(() =>
        success("Client deleted")
      );
    },
    [success, adminToken]
  );

  const handleCreatePost = useCallback(
    (p: any) => {
      if (!workspaceTenantId) return;
      emit("create-post", { tenantId: workspaceTenantId, post: p });
    },
    [emit, workspaceTenantId]
  );
  const handleCreatePostsBulk = useCallback(
    (pts: any[]) => {
      if (!workspaceTenantId) return;
      emit("create-posts-bulk", { tenantId: workspaceTenantId, posts: pts });
    },
    [emit, workspaceTenantId]
  );
  const handleDeletePost = useCallback(
    (id: string) => {
      if (!workspaceTenantId) return;
      emit("delete-post", { tenantId: workspaceTenantId, postId: id });
    },
    [emit, workspaceTenantId]
  );
  const handleAddComment = useCallback(
    (postId: string, c: any) => {
      if (!workspaceTenantId) return;
      emit("add-comment", { tenantId: workspaceTenantId, postId, comment: c });
    },
    [emit, workspaceTenantId]
  );
  const handleDeleteComment = useCallback(
    (postId: string, cid: string) => {
      if (!workspaceTenantId) return;
      emit("delete-comment", { tenantId: workspaceTenantId, postId, commentId: cid });
    },
    [emit, workspaceTenantId]
  );

  // onAddTask receives (postId, task) so the full task object (with text + completed) goes to server
  const handleAddTask = useCallback(
    (postId: string, task: any) => {
      if (!workspaceTenantId) return;
      emit("add-task", { tenantId: workspaceTenantId, postId, task });
    },
    [emit, workspaceTenantId]
  );
  const handleDeleteTask = useCallback(
    (postId: string, tid: string) => {
      if (!workspaceTenantId) return;
      emit("delete-task", { tenantId: workspaceTenantId, postId, taskId: tid });
    },
    [emit, workspaceTenantId]
  );
  // onToggleTask receives (postId, taskId, done) — all three args
  const handleToggleTask = useCallback(
    (postId: string, tid: string, done: boolean) => {
      if (!workspaceTenantId) return;
      emit("toggle-task", { tenantId: workspaceTenantId, postId, taskId: tid, completed: done });
    },
    [emit, workspaceTenantId]
  );

  /* ── Share link helper ── */
  const handleCopyShareLink = () => {
    const tkn = tenant?.settings?.clientToken || "";
    const tid = tenantId || tenant?.id;
    if (!tid) return;
    const url = `${window.location.origin}/client/${tid}?token=${tkn}`;
    navigator.clipboard.writeText(url);
    success("Client-only secure link copied to clipboard");
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 selection:bg-indigo-500/30">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center justify-center text-red-500 mb-8 mx-auto shadow-2xl shadow-red-500/5">
            <Lock className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-3 uppercase">Secure Protocol Terminated</h1>
          <p className="text-zinc-500 text-sm mb-10 leading-relaxed">
            The link you followed is invalid, expired, or you do not have sufficient clearance to access this sector.
            <br />
            <span className="text-red-400/80 font-mono text-xs mt-2 block italic">{authError}</span>
          </p>
          
          <div className="flex flex-col gap-3">
            {adminToken && (
              <button
                onClick={() => { setAuthError(null); navigate("/"); }}
                className="w-full flex items-center justify-center gap-2 bg-white text-black font-black py-4 rounded-2xl hover:bg-zinc-100 transition-all active:scale-[0.98] shadow-xl"
              >
                <Layout className="w-5 h-5" /> RETURN TO COMMAND CENTER
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-zinc-400 font-bold py-4 rounded-2xl hover:bg-zinc-800 transition-all active:scale-[0.98] border border-zinc-800"
            >
              <RefreshCcw className="w-4 h-4" /> RETRY AUTHENTICATION
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!tenantId && !reviewShareToken) {
    return (
      <DashboardView
        tenants={tenants}
        adminToken={adminToken}
        setAdminToken={setAdminToken}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        onUpsertTenant={handleUpsertTenant}
        onDeleteTenant={handleDeleteTenant}
        onSelectTenant={(t, type, tkn) => handleSwitchTenant(t.id, type, tkn)}
        liveEvents={liveEvents}
      />
    );
  }

  if (!loaded)
    return (
      <>
        <GridSkeleton />
        <div className="fixed bottom-4 left-4 z-[200] flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 text-white rounded-full text-[10px] font-bold">
          <Loader2 className="w-3 h-3 animate-spin" /> LOAD
        </div>
      </>
    );

  return (
    <div className="relative min-h-screen bg-zinc-900 overflow-hidden">
      <AnimatePresence mode="wait">
        {viewMode === "internal" ? (
          <motion.div
            key="internal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 overflow-auto"
          >
            <InternalView
              posts={posts}
              tenantId={tenantId}
              brandName={tenant?.name || tenantId}
              tenants={tenants}
              adminToken={adminToken}
              currentUser={currentUser}
              teamMembers={teamMembers}
              onSwitchTenant={handleSwitchTenant}
              onUpdatePost={handleUpdatePost}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onToggleTask={handleToggleTask}
              onCreatePost={handleCreatePost}
              onCreatePostsBulk={handleCreatePostsBulk}
              onDeletePost={handleDeletePost}
              onUpsertTenant={handleUpsertTenant}
              onDeleteTenant={handleDeleteTenant}
              onCopyShareLink={handleCopyShareLink}
              emit={emit}
            />
          </motion.div>
        ) : (
          <motion.div
            key="client"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 overflow-auto"
          >
            {/* Client view floating controls — only visible in internal preview mode */}
            {!isClientLink && (
              <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
                <button
                  onClick={handleCopyShareLink}
                  className="bg-white text-zinc-900 px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 hover:bg-zinc-50 border border-zinc-200 font-bold text-sm"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => navigate(`/agency/${workspaceTenantId || tenantId}`)}
                  className="bg-zinc-900/95 text-white pl-3 pr-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 hover:bg-zinc-800 border border-zinc-700/50 font-bold text-sm"
                >
                  <EyeOff className="w-4 h-4" /> Exit
                </button>
              </div>
            )}
            <ClientView
              posts={posts}
              tenantId={workspaceTenantId || tenantId || ""}
              brandName={tenant?.name || workspaceTenantId || tenantId || "Review"}
              logoUrl={tenant?.logoUrl}
              bio={tenant?.bio}
              singlePostShareMode={isReviewSharePath}
              postShareLinkEligible={postShareLinkEligible}
              adminToken={adminToken}
              onUpdatePost={handleUpdatePost}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync indicator */}
      <div
        className={`fixed bottom-4 left-4 z-[200] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all ${connected
          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
          : "bg-red-500/10 text-red-500 border border-red-500/20"
          }`}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
        />
        {connected ? "Sync" : "Offline"}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </ToastProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
