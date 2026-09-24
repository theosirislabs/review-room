import { StrictMode, Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { Post, TeamMember, ActivityEvent } from "./types";
import { ToastProvider, useToast } from "./components/Toast";
import { motion } from "motion/react";
import { EyeOff, Loader2, Lock, Layout, RefreshCcw } from "lucide-react";
import { io, Socket } from "socket.io-client";
import ErrorBoundary from "./components/ErrorBoundary";
import { isPostVisibleToClient } from "./utils";
import { removeQueryParam } from "./routeState";
import { reviewerNameFromHash } from "./reviewerProfile";

// A client review link must not download the agency dashboard, analytics, and
// modal tree before the reviewer can see their posts.
const ClientView = lazy(() => import("./components/ClientView"));
const InternalView = lazy(() => import("./components/InternalView"));
const DashboardView = lazy(() => import("./components/DashboardView"));

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
/* ── No Access Token View ──────────────────────────── */
function NoAccessTokenView({ tenantId }: { tenantId: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-amber-100 border border-amber-200 rounded-[2rem] flex items-center justify-center text-amber-600 mb-8 mx-auto">
          <Lock className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-black text-zinc-900 tracking-tighter mb-3">
          Access Required
        </h1>
        <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
          This is a client review portal. You need a secure invite link
          to access <strong className="text-zinc-800">{tenantId}</strong>&apos;s content.
        </p>
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 text-left mb-8 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            How to get access
          </p>
          <p className="text-sm text-zinc-600">
            Your agency should have sent you a link that looks like:
          </p>
          <code className="block text-xs bg-zinc-100 text-zinc-700 px-3 py-2 rounded-xl font-mono break-all">
            https://review-room.theosirislabs.com/client/{tenantId}?token=...
          </code>
          <p className="text-sm text-zinc-600">
            If you lost your link, contact your agency to request a new one.
          </p>
        </div>
        <button onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white font-bold py-4 rounded-2xl hover:bg-zinc-800 transition-all active:scale-[0.98]">
          <RefreshCcw className="w-4 h-4" /> TRY AGAIN
        </button>
      </motion.div>
    </div>
  );
}

function GridSkeleton({ client }: { client?: boolean }) {
  if (client) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="h-14 bg-white border-b border-zinc-200 w-full" />
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="skeleton w-16 h-16 rounded-full" />
            <div className="space-y-2 flex-1">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-64 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[4/5] w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }
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
              <div className="skeleton h-36 w-full rounded-lg" />
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
  const isShareSetPath = isReviewSharePath && location.pathname.startsWith("/review/set/");
  const reviewShareToken = isReviewSharePath && !isShareSetPath ? (location.pathname.split("/")[2] || "") : "";
  const shareSetToken = isShareSetPath ? (location.pathname.split("/")[3] || "") : "";
  const derivedTenant = isClientPath || isAgencyPath ? location.pathname.split("/")[2] : null;
  const viewMode = isReviewSharePath ? "client" : isClientPath ? "client" : "internal";

  const routeScope = `${derivedTenant || ""}:${viewMode}:${reviewShareToken}:${shareSetToken}`;
  const routeScopeRef = useRef(routeScope);
  routeScopeRef.current = routeScope;
  const searchParams = new URLSearchParams(location.search);
  const urlToken = searchParams.get("token");
  const reviewerName = useMemo(() => reviewerNameFromHash(location.hash), [location.hash]);
  const pendingTokenRef = useRef<{ scope: string; value: string } | null>(null);

  useEffect(() => {
    if (derivedTenant && urlToken && !isReviewSharePath) {
      pendingTokenRef.current = { scope: routeScope, value: urlToken };
      const nextSearch = removeQueryParam(location.search, "token");
       navigate(`${location.pathname}${nextSearch}${location.hash}`, { replace: true });
    }
  }, [derivedTenant, urlToken, navigate, location.pathname, location.search, location.hash, isReviewSharePath, routeScope]);

  const pendingToken = pendingTokenRef.current?.scope === routeScope ? pendingTokenRef.current.value : "";
  const token = urlToken || pendingToken || (derivedTenant ? (localStorage.getItem(`osiris_${derivedTenant}_${viewMode}`) || "") : "");
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
  const [loadedScope, setLoadedScope] = useState("");
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

  // Authentik SSO callback: cookie session → localStorage token
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const err = params.get("error");
    if (err) {
      toastError(decodeURIComponent(err.replace(/\+/g, " ")));
      navigate(location.pathname || "/", { replace: true });
      return;
    }
    if (params.get("sso") !== "1") return;
    fetch("/api/auth/session", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("No session"))))
      .then((data: { token?: string; user?: { id: string; username: string; role: string } }) => {
        if (!data?.token) throw new Error("No session");
        setAdminToken(data.token);
        localStorage.setItem("osiris_admin_token", data.token);
        if (data.user) {
          setCurrentUser(data.user);
          localStorage.setItem("osiris_user", JSON.stringify(data.user));
        }
        success("Signed in with Authentik");
        navigate("/", { replace: true });
      })
      .catch(() => {
        toastError("Could not complete Authentik sign-in");
        navigate("/", { replace: true });
      });
  }, [location.search, location.pathname, navigate, success, toastError]);

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

  useEffect(() => {
    setLoaded(false);
    setLoadedScope("");
    setAuthError(null);
    if (pendingTokenRef.current && pendingTokenRef.current.scope !== routeScope) {
      pendingTokenRef.current = null;
    }
  }, [routeScope]);

  const isClientPreview = isAgencyPath && searchParams.get("preview") === "client" && (!!adminToken || !!token);
  const renderClientSurface = viewMode === "client" || isClientPreview;

  /* ── Socket setup ── */
  useEffect(() => {
    const sock = io({
      transports: ["websocket", "polling"],
      auth: adminToken ? { token: adminToken } : undefined,
     });
     setSocket(sock);
     const isCurrentScope = () => routeScopeRef.current === routeScope;

     sock.on("connect", () => {
       if (!isCurrentScope()) return;
       setConnected(true);
      if (shareSetToken) {
        sock.emit("join-share-set", { token: shareSetToken });
      } else if (reviewShareToken) {
        sock.emit("join-post-share", { shareToken: reviewShareToken });
      } else if (tenantId) {
        const joinToken = token || (viewMode === "internal" ? adminToken : "");
        sock.emit("join-tenant", { tenantId, mode: viewMode, token: joinToken });
      }
    });

     sock.on("error", (msg: string) => {
       if (!isCurrentScope()) return;
       if (/unauthorized|invalid or missing|workspace not found|expired|revoked|secure/i.test(msg)) {
         setAuthError(msg);
       } else {
         toastError(msg);
       }
     });

     sock.on("disconnect", () => {
       if (isCurrentScope()) setConnected(false);
     });
     sock.on("initial-data", (data: { posts: Post[]; tenant: Tenant }) => {
       if (routeScopeRef.current !== routeScope) return;
       const pendingToken = pendingTokenRef.current?.scope === routeScope ? pendingTokenRef.current.value : "";
       if (pendingToken && derivedTenant) {
         localStorage.setItem(`osiris_${derivedTenant}_${viewMode}`, pendingToken);
         pendingTokenRef.current = null;
       }
       setPosts(data.posts);
       setTenant(data.tenant);
       setLoadedScope(routeScope);
       setLoaded(true);
     });

     sock.on("post-created", (post: Post) => {
       if (!isCurrentScope()) return;
       setPosts((c: Post[]) => [...c, post]);
     });
     sock.on("post-updated", (post: Post) => {
       if (!isCurrentScope()) return;
       setPosts((c: Post[]) => {
        const hideFromMainClientBoard = viewMode === "client" && !isReviewSharePath;
        const archived = !!(post as any).archivedAt;
        const idx = c.findIndex((p: Post) => p.id === post.id);
        if (archived) {
          return idx >= 0 ? c.filter((p: Post) => p.id !== post.id) : c;
        }
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
          return [...c, post];
        }
        if (viewMode !== "client") {
          return [...c, post];
        }
        return c;
       });
      });
      sock.on("client-post-removed", (postId: string) => {
       if (!isCurrentScope() || viewMode !== "client" || isReviewSharePath) return;
      setPosts((c: Post[]) => c.filter((p: Post) => p.id !== postId));
    });
     sock.on("post-deleted", (id: string) => {
       if (!isCurrentScope()) return;
       setPosts((c: Post[]) => c.filter((p) => p.id !== id));
     });
     sock.on("activity", (ev: ActivityEvent) => {
       if (!isCurrentScope()) return;
       setLiveEvents(prev => [...prev.slice(-49), ev]);
     });
     sock.on("team-updated", () => {
       if (!isCurrentScope()) return;
       mutateTeam();
     });

     sock.on("tenant-updated", (t: Tenant) => {
       if (!isCurrentScope()) return;
       mutateTenants();
       if (t.id === tenantId || t.id === tenant?.id) setTenant(t);
     });
     sock.on("tenant-deleted", (id: string) => {
       if (!isCurrentScope()) return;
       mutateTenants();
      if (id === tenantId || id === tenant?.id) window.location.href = "/";
    });

    return () => { sock.disconnect(); };
   }, [routeScope, token, isReviewSharePath, adminToken]);

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

  const handlePreviewClient = useCallback((id?: string) => {
    const targetId = id || workspaceTenantId || tenantId;
    if (!targetId) return;
    navigate(`/agency/${targetId}?preview=client`);
  }, [navigate, tenantId, workspaceTenantId]);

  const previewNoop = useCallback(() => undefined, []);

  /* ── Post handlers ── */
  const handleUpdatePost = useCallback(
    (p: Post) => {
      const tid = workspaceTenantId;
      if (!tid) return;
      emit("update-post", { tenantId: tid, post: p }, (updated: Post | null) => {
        if (!updated) return;
        setPosts((prev: Post[]) => {
          if ((updated as any).archivedAt) return prev.filter((x: Post) => x.id !== updated.id);
          const idx = prev.findIndex((x: Post) => x.id === updated.id);
          if (idx >= 0) return prev.map((x: Post) => (x.id === updated.id ? updated : x));
          return [...prev, updated];
        });
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
  const handleCopyShareLink = async () => {
    const tid = tenantId || tenant?.id;
    if (!tid) return;
    if (adminToken) {
      try {
        const res = await fetch(`/api/tenants/${tid}/invite`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.clientUrl) {
            await navigator.clipboard.writeText(data.clientUrl);
            success("Client-only secure link copied to clipboard");
            return;
          }
        }
      } catch { /* fall through */ }
    }
    const tkn = tenant?.settings?.clientToken || "";
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

  // If client path with no token and no admin session, show guidance
  const missingClientToken = isClientPath && !reviewShareToken && !token && !adminToken;
  if (missingClientToken) {
    return <NoAccessTokenView tenantId={tenantId || derivedTenant || ''} />;
  }

  if (!tenantId && !reviewShareToken && !shareSetToken) {
    return (
      <Suspense fallback={<GridSkeleton />}>
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
      </Suspense>
    );
  }

  if (!loaded || loadedScope !== routeScope)
    return (
      <>
        <GridSkeleton client={renderClientSurface} />
        <div className="fixed bottom-4 left-4 z-[200] flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 text-white rounded-full text-[10px] font-bold">
          <Loader2 className="w-3 h-3 animate-spin" /> LOAD
        </div>
      </>
    );

  return (
    <div className="relative min-h-screen bg-zinc-900 overflow-hidden">
      <Suspense fallback={<GridSkeleton client={renderClientSurface} />}>
        {viewMode === "internal" && !isClientPreview ? (
            <motion.div
              key="internal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 overflow-auto"
            >
              <InternalView
                posts={posts}
                tenantId={tenantId ?? ""}
                brandName={tenant?.name || tenantId || ""}
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
                onPreviewClient={() => handlePreviewClient()}
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
              {isClientPreview ? (
                <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-full bg-zinc-900/95 pl-4 pr-2 py-2 text-white shadow-2xl border border-zinc-700/50">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Client preview</span>
                  <button
                    onClick={() => navigate(`/agency/${workspaceTenantId || tenantId}`)}
                    className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-zinc-900 transition-colors hover:bg-zinc-100"
                  >
                    <EyeOff className="w-4 h-4" /> Exit preview
                  </button>
                </div>
              ) : !isClientLink ? (
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
              ) : null}
              <ClientView
                posts={posts}
                tenantId={workspaceTenantId || tenantId || ""}
                brandName={tenant?.name || workspaceTenantId || tenantId || "Review"}
                 logoUrl={tenant?.logoUrl}
                 bio={tenant?.bio}
                 reviewerName={reviewerName}
                 singlePostShareMode={!!reviewShareToken}
                shareSetMode={!!shareSetToken}
                postShareLinkEligible={!isClientPreview && postShareLinkEligible}
                adminToken={isClientPreview ? "" : adminToken}
                previewMode={isClientPreview}
                onUpdatePost={isClientPreview ? previewNoop : handleUpdatePost}
                onAddComment={isClientPreview ? previewNoop : handleAddComment}
                onDeleteComment={isClientPreview ? previewNoop : handleDeleteComment}
              />
            </motion.div>
          )}
      </Suspense>

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
