import React, { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { Badge } from "./ui/Badge";
import { Post, InternalStatus, ClientStatus, TeamMember } from "../types";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Grid3X3, 
  ChevronLeft, ChevronRight, X, Plus, Edit3, Trash2,
  CheckCircle2, CheckSquare, MessageSquare, Tag,
  Link, Layout, Lock, Copy, Settings, Share2,
  AlertCircle, Play, Send, Zap, Image as ImageIcon, Camera, Loader2,
  Calendar, BarChart2, Flag, GitBranch, Clock, ChevronDown, Sun, Moon, Archive, RotateCcw, RectangleVertical, Megaphone, Eye
} from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import TenantManagerModal from "./TenantManagerModal";
import UpdatesModal from "./UpdatesModal";
import CalendarView from "./CalendarView";
import { useToast } from "./Toast";
import { fallbackSvg, parseDateSafe, shouldRenderAsVideo, tileAspectClass, dateOnly, isOverdue } from "../utils";
import { staffUploadHeaders } from "../mediaUpload";
import { createAndCopyClientPostShare } from "../clientPostShare";
import { createShareSetLink } from "../shareSet";
import { readReviewerPreference, normalizeReviewerName } from "../reviewerProfile";
import ShareClientLinkModal from "./ShareClientLinkModal";
import { useTheme } from "../theme";
import { schedulingPatchForPost } from "../agencyCalendar";
import { normalizeGlobalOverviewStats, type GlobalOverviewCard, type GlobalStatsTenant } from "../globalStats";
import OsirisLogo from "./OsirisLogo";

const AnalyticsView = lazy(() => import("./AnalyticsView"));
const PostFormModal = lazy(() => import("./PostFormModal"));
const BatchUploadModal = lazy(() => import("./BatchUploadModal"));
const CampaignManagerModal = lazy(() => import("./CampaignManagerModal"));

interface Props {
  posts: Post[];
  tenantId: string;
  brandName: string;
  tenants: any[];
  adminToken?: string;
  currentUser?: { id: string; username: string; role: string } | null;
  teamMembers?: TeamMember[];
  onSwitchTenant: (id: string, mode?: "internal" | "client", token?: string) => void;
  onUpdatePost: (post: Post) => void;
  onAddComment: (postId: string, comment: any) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onAddTask: (postId: string, task: any) => void;
  onDeleteTask: (postId: string, taskId: string) => void;
  onToggleTask: (postId: string, taskId: string, done: boolean) => void;
  onCreatePost: (post: Omit<Post, "id" | "clientComments" | "internalTasks">) => void;
  onCreatePostsBulk: (posts: any[]) => void;
  onDeletePost: (id: string) => void;
  onUpsertTenant: (tenant: any) => void;
  onDeleteTenant: (id: string) => void;
  onCopyShareLink: () => void;
  onPreviewClient: () => void;
  emit?: (event: string, data: any, callback?: (result: any) => void) => void;
}


/** Normalise a hashtag token so it always has exactly one leading # */
const normaliseTag = (t: string) => t.startsWith("#") ? t : `#${t}`;

const WORKFLOW_COLUMNS: { id: string; label: string; statuses: InternalStatus[] }[] = [
  { id: "drafts", label: "Drafts", statuses: ["Concept", "Draft"] },
  { id: "internal", label: "Internal Review", statuses: ["Internal QA"] },
   { id: "client", label: "With Client", statuses: ["Ready for Client"] },
   { id: "changes", label: "Changes Requested", statuses: ["Changes Requested"] },
   { id: "live", label: "Approved & Publishing", statuses: ["Approved", "Ready to Schedule", "Scheduled", "Posted"] },
];

function dropStatusForColumn(colId: string): { internalStatus: InternalStatus; clientStatus?: ClientStatus } {
  if (colId === "drafts") return { internalStatus: "Draft", clientStatus: "Not Ready for Client" };
  if (colId === "internal") return { internalStatus: "Internal QA", clientStatus: "Not Ready for Client" };
  if (colId === "client") return { internalStatus: "Ready for Client", clientStatus: "Needs Your Review" };
  if (colId === "changes") return { internalStatus: "Changes Requested", clientStatus: "Changes Requested" };
  return { internalStatus: "Approved", clientStatus: "Approved" };
}

function statusVariant(status: string): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "Changes Requested") return "danger";
  if (status === "Approved" || status === "Posted") return "success";
  if (status === "Internal QA") return "warning";
  if (status === "Ready for Client" || status === "Ready to Schedule" || status === "Scheduled") return "info";
  return "neutral";
}

const canCreateEdit = (role: string) => ["super-admin", "graphic-designer"].includes(role);
const canSchedulePost = (role: string) => ["super-admin", "marketing-team"].includes(role);
const canReview = (role: string) => ["super-admin", "reviewer"].includes(role);

const ALL_STATUSES: InternalStatus[] = ["Concept", "Draft", "Internal QA", "Ready for Client", "Changes Requested", "Approved", "Ready to Schedule", "Scheduled", "Posted"];
const getAllowedStatuses = (role: string): InternalStatus[] => {
  if (role === "super-admin") return ALL_STATUSES;
  const allowed: InternalStatus[] = [];
  if (canCreateEdit(role)) allowed.push("Concept", "Draft", "Changes Requested");
  if (canReview(role)) allowed.push("Internal QA", "Ready for Client", "Approved");
  if (canSchedulePost(role)) allowed.push("Ready to Schedule", "Scheduled", "Posted");
  return [...new Set(allowed)];
};

/** Client-facing status when internal status moves to/from key workflow stages. */
function clientStatusForInternalChange(next: InternalStatus): ClientStatus | undefined {
  if (next === "Ready for Client") return "Needs Your Review";
  if (next === "Concept" || next === "Draft" || next === "Internal QA") return "Not Ready for Client";
  return undefined;
}

export default function InternalView({
  posts, tenantId: _tenantId, brandName, tenants, adminToken = "", currentUser, teamMembers = [],
  onSwitchTenant: _onSwitchTenant, onUpdatePost, onAddComment, onDeleteComment, onAddTask, onDeleteTask, onToggleTask,
  onCreatePost, onCreatePostsBulk, onDeletePost, onUpsertTenant, onDeleteTenant, onCopyShareLink: _onCopyShareLink, onPreviewClient, emit
}: Props) {
  // Logged-in staff with a missing role must not inherit designer write access.
  // Internal magic-link sessions (no agency login) keep the historic designer default.
  const role = currentUser?.role || (adminToken ? "user" : "graphic-designer");
  const isSuperAdmin = role === "super-admin";
  const { theme, toggleTheme } = useTheme();
   const canCreate = canCreateEdit(role);
   const canSchedule = canSchedulePost(role);
   const canReviewContent = canReview(role);
   const canMovePosts = canCreate || canReviewContent || canSchedule;
  // ── Selections & UI state ─────────────────────────────────────
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"workflow" | "blocked" | "archived">("workflow");
  const [viewMode, setViewMode] = useState<"grid" | "calendar" | "analytics">("grid");
  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [archivedPosts, setArchivedPosts] = useState<Post[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [unreadUpdates, setUnreadUpdates] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [calendarDraftDate, setCalendarDraftDate] = useState<string | undefined>();
  const [workspacePillars, setWorkspacePillars] = useState<string[]>([]);
  const [workspaceCampaigns, setWorkspaceCampaigns] = useState<{ code: string; name: string }[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [clientSwitcherOpen, setClientSwitcherOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
   const [colShown, setColShown] = useState<Record<string, number>>({});
   const [listShown, setListShown] = useState(24);
   const detailDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setColShown({});
    setListShown(24);
  }, [activeTab, search, campaignFilter]);

  useEffect(() => {
    if (!adminToken || !currentUser) return;
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
  }, [adminToken, currentUser]);

  // ── Global Stats ──────────────────────────────────────────────
  const [globalStats, setGlobalStats] = useState<GlobalOverviewCard[]>([]);
  const [showGlobalOverview, setShowGlobalOverview] = useState(false);

  useEffect(() => {
    if (showGlobalOverview && adminToken) {
      fetch("/api/stats", {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
        .then(res => res.ok ? res.json() : { perTenant: [] })
        .then(data => setGlobalStats(normalizeGlobalOverviewStats(Array.isArray(data?.perTenant) ? data.perTenant as GlobalStatsTenant[] : [])))
        .catch(console.error);
    }
  }, [showGlobalOverview, adminToken]);

  const refreshWorkspaceCatalog = useCallback(() => {
    if (!_tenantId || !adminToken) return;
    const headers = { Authorization: `Bearer ${adminToken}` };
    fetch(`/api/pillars?tenantId=${encodeURIComponent(_tenantId)}`, { headers, credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => setWorkspacePillars(Array.isArray(rows) ? rows.map((x) => x.name).filter(Boolean) : []))
      .catch(() => { /* keep fallback pillars */ });
    fetch(`/api/campaigns?tenantId=${encodeURIComponent(_tenantId)}`, { headers, credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => setWorkspaceCampaigns(Array.isArray(rows) ? rows.map((x) => ({ code: x.code, name: x.name })).filter((x) => x.code) : []))
      .catch(() => { /* keep free-text campaign */ });
  }, [_tenantId, adminToken]);

  useEffect(() => {
    refreshWorkspaceCatalog();
  }, [refreshWorkspaceCatalog]);

  // ── Fetch archived posts when activeTab === "archived" ────────
  useEffect(() => {
    if (activeTab === "archived" && adminToken) {
      fetch(`/api/tenants/${_tenantId}/archived-posts`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setArchivedPosts(data || []))
        .catch(() => setArchivedPosts([]));
    }
  }, [activeTab, _tenantId, adminToken]);

  // ── ConfirmDialog state ───────────────────────────────────────
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive?: boolean;
    confirmLabel?: string;
  }>({ open: false, title: "", message: "", onConfirm: () => { } });

  const openConfirm = (opts: Omit<typeof confirm, "open">) =>
    setConfirm({ ...opts, open: true });
  const closeConfirm = () => setConfirm((c) => ({ ...c, open: false }));

  const { success, error: toastError } = useToast();

  const updatePostWithScheduling = (
    post: Post,
    changes: Partial<Pick<Post, "date" | "time" | "internalStatus">>,
    extra: Partial<Post> = {},
  ) => {
    try {
      onUpdatePost({ ...post, ...schedulingPatchForPost(post, changes), ...extra });
      return true;
    } catch (reason) {
      toastError(reason instanceof Error ? reason.message : "Use a valid publish date and time before scheduling this post.");
      return false;
    }
  };

  const handleSchedulePost = (post: Post, date: string) => {
    if (updatePostWithScheduling(post, { date, internalStatus: "Scheduled" })) {
      success(`Scheduled "${post.title}" for ${date}.`);
    }
  };

  // ── Active post derived by ID (never by fragile array index) ─
  const activePost = useMemo(
    () => (activePostId ? posts.find((p) => p.id === activePostId) ?? archivedPosts.find((p) => p.id === activePostId) ?? null : null),
    [activePostId, posts, archivedPosts]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") setActivePostId(null);
      if (!activePost) return;
      if (e.key === "j" || e.key === "ArrowRight") { e.preventDefault(); handleNext(); }
      if (e.key === "k" || e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
      if (e.key === "e") {
        if (!canCreate) return;
        setEditingPost(activePost); 
        setShowFormModal(true); 
        setActivePostId(null); 
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePost, activePostId, canCreate]);

   useEffect(() => {
     if (!activePost) return;
     const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
     const previousOverflow = document.body.style.overflow;
     document.body.style.overflow = "hidden";
     detailDialogRef.current?.focus();

     const trapFocus = (event: KeyboardEvent) => {
       if (event.key !== "Tab") return;
       const dialog = detailDialogRef.current;
       if (!dialog) return;
       const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
         "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
       ));
       if (focusable.length === 0) {
         event.preventDefault();
         dialog.focus();
         return;
       }
       const first = focusable[0];
       const last = focusable[focusable.length - 1];
       const current = document.activeElement;
       if (event.shiftKey && (current === first || !dialog.contains(current))) {
         event.preventDefault();
         last.focus();
       } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
         event.preventDefault();
         first.focus();
       }
     };

     document.addEventListener("keydown", trapFocus);
     return () => {
       document.removeEventListener("keydown", trapFocus);
       document.body.style.overflow = previousOverflow;
       previousActiveElement?.focus();
     };
   }, [activePost?.id]);

   // Post-order for prev/next navigation follows the CURRENT filtered list
  const filteredPosts = useMemo(() => {
    let list = posts;
    if (activeTab === "blocked") list = list.filter((p) => p.isBlocked);

    if (campaignFilter) list = list.filter(p => p.campaignCode === campaignFilter);

    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.campaignCode?.toLowerCase().includes(query) ||
          p.contentPillar?.toLowerCase().includes(query) ||
          p.caption?.toLowerCase().includes(query) ||
          p.assignee?.toLowerCase().includes(query)
      );
    }
    return [...list].sort((a, b) => {
      const ao = a.sortOrder ?? 999999;
      const bo = b.sortOrder ?? 999999;
      if (ao !== bo) return ao - bo;
      return parseDateSafe(b.date, b.time) - parseDateSafe(a.date, a.time);
    });
  }, [posts, activeTab, search, campaignFilter]);

  // Unique campaigns for filter
  const uniqueCampaigns = useMemo(() => {
    const codes = [...new Set(posts.map(p => p.campaignCode).filter(Boolean))];
    return codes;
  }, [posts]);

  const activePostFilteredIdx = activePost ? filteredPosts.findIndex((p) => p.id === activePost.id) : -1;

  const copyActivePostClientShare = useCallback(async () => {
    if (!activePost) return;
    const reviewer = readReviewerPreference(currentUser?.id, _tenantId).name;
    if (!reviewer) {
      setShowShareModal(true);
      toastError("Add a reviewer's name before sharing a client link.");
      return;
    }
    const r = await createAndCopyClientPostShare({
      tenantId: _tenantId,
      postId: activePost.id,
      adminToken: adminToken || undefined,
      reviewerName: reviewer,
    });
    if (r.ok) success("Single-post client link copied.");
    else toastError(r.error);
  }, [activePost, _tenantId, adminToken, currentUser?.id, success, toastError]);

  // ── Selection helpers ─────────────────────────────────────────
  const toggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  const handleDuplicate = (post: Post) => {
    const { id, clientComments, internalTasks, ...rest } = post;
    onCreatePost({ ...rest, title: `${post.title} (Copy)`, internalStatus: "Draft" });
    success("Post duplicated");
  };

  const handleBulkDelete = () => {
    openConfirm({
      title: "Delete selected posts",
      message: `Permanently delete ${selectedIds.size} post${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`,
      confirmLabel: `Delete ${selectedIds.size}`,
      destructive: true,
      onConfirm: () => {
        selectedIds.forEach((id) => onDeletePost(id));
        clearSelection();
        success(`${selectedIds.size} posts deleted`);
      },
    });
  };

  const handleBulkArchive = () => {
    selectedIds.forEach((id) => {
      const post = posts.find((p) => p.id === id);
      if (post) {
        onUpdatePost({ ...post, archivedAt: new Date().toISOString() });
      }
    });
    clearSelection();
    success(`${selectedIds.size} posts archived`);
  };

  const handleBulkStatusChange = (status: InternalStatus) => {
    let changed = 0;
    selectedIds.forEach((id) => {
      const post = posts.find((p) => p.id === id);
      if (post) {
        const cs = clientStatusForInternalChange(status);
        if (updatePostWithScheduling(post, { internalStatus: status }, cs !== undefined ? { clientStatus: cs } : {})) changed += 1;
      }
    });
    clearSelection();
    if (changed > 0) success(`Updated ${changed} post${changed === 1 ? "" : "s"} to "${status}"`);
  };

  const handlePushToReview = () => {
    openConfirm({
       title: "Send for client review",
       message: `Send ${selectedIds.size} post${selectedIds.size > 1 ? "s" : ""} for client review? This will set the status to "Ready for Client".`,
       confirmLabel: "Send for review",
      onConfirm: () => {
        selectedIds.forEach((id) => {
          const post = posts.find((p) => p.id === id);
          if (post) {
            onUpdatePost({ 
              ...post, 
              internalStatus: "Ready for Client",
              clientStatus: "Needs Your Review"
            });
          }
        });
        clearSelection();
         success(`${selectedIds.size} posts sent for review`);
      },
    });
  };

  const handleShareSelected = async () => {
    const ids = Array.from(selectedIds);
    const reviewer = normalizeReviewerName(readReviewerPreference(currentUser?.id, _tenantId).name);
    if (!reviewer) {
      setShowShareModal(true);
      toastError("Add a reviewer's name before sharing selected posts.");
      return;
    }
    const r = await createShareSetLink({ tenantId: _tenantId, postIds: ids, adminToken, reviewerName: reviewer });
    if (r.ok) {
      success(`Share link for ${ids.length} posts copied to clipboard`);
      clearSelection();
    } else {
      toastError(r.error);
    }
  };

  // ── Video frame capture ─────────────────────────────────────
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || !activePost) return;

    setIsCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Draw the current frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not generate blob");

      const file = new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include", headers: staffUploadHeaders() });
      const { url } = await res.json();

      onUpdatePost({ ...activePost, thumbnailUrl: url });
      success("Exact frame set as post cover");
    } catch (err) {
      console.error("Frame capture error:", err);
      toastError("Failed to capture frame");
    } finally {
      setIsCapturing(false);
    }
  };

  // ── Reset image index when active post changes ────────────────
  React.useEffect(() => { setActiveImageIdx(0); }, [activePostId]);

  const openPost = (post: Post) => setActivePostId(post.id);

   const handleColumnDrop = (colId: string, targetPostId?: string) => {
     if (!canMovePosts) return;
     const id = draggingIdRef.current;
    if (!id) return;
    const post = posts.find((p) => p.id === id);
    draggingIdRef.current = null;
    setDraggingId(null);
    if (!post) return;
    const col = WORKFLOW_COLUMNS.find((c) => c.id === colId)
      || (colId === "blocked" ? { id: "blocked", label: "Blocked", statuses: ALL_STATUSES } : undefined);
    if (!col) return;
    const alreadyIn = col.statuses.includes(post.internalStatus);
    if (targetPostId === id && alreadyIn) return;
    const drop = dropStatusForColumn(colId);
    const colPosts = filteredPosts.filter((p) => col.statuses.includes(p.internalStatus) && p.id !== id);
    const idx = targetPostId ? colPosts.findIndex((p) => p.id === targetPostId) : -1;
    const insertAt = idx >= 0 ? idx : colPosts.length;
    const nextList = [...colPosts];
    const moved = alreadyIn ? post : { ...post, internalStatus: drop.internalStatus, ...(drop.clientStatus ? { clientStatus: drop.clientStatus } : {}) };
    nextList.splice(insertAt, 0, moved);
    nextList.forEach((p, i) => {
      const statusPatch = p.id === moved.id && !alreadyIn
        ? { internalStatus: drop.internalStatus, ...(drop.clientStatus ? { clientStatus: drop.clientStatus } : {}) }
        : {};
      onUpdatePost({ ...p, ...statusPatch, sortOrder: i + 1 });
    });
  };

  const handlePrev = () => {
    if (activePostFilteredIdx > 0)
      setActivePostId(filteredPosts[activePostFilteredIdx - 1].id);
  };
  const handleNext = () => {
    if (activePostFilteredIdx < filteredPosts.length - 1)
      setActivePostId(filteredPosts[activePostFilteredIdx + 1].id);
  };

  // ── "Apply to Batch" — copies caption+hashtags to all selected posts ─
  const handleApplyToBatch = () => {
    if (!activePost) return;
    const targets = selectedIds.size > 0
      ? posts.filter((p) => selectedIds.has(p.id) && p.id !== activePost.id)
      : posts.filter((p) => p.id !== activePost.id);

    if (targets.length === 0) {
      toastError("Select posts first to apply caption to them, or deselect all to apply to every post.");
      return;
    }
    targets.forEach((p) =>
      onUpdatePost({ ...p, caption: activePost.caption, hashtags: activePost.hashtags })
    );
    success(`Caption applied to ${targets.length} post${targets.length > 1 ? "s" : ""}`);
  };

  // ── Individual post delete ────────────────────────────────────
  const handleDeletePost = (post: Post) => {
    openConfirm({
      title: "Delete post",
      message: `Delete "${post.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => {
        onDeletePost(post.id);
        setActivePostId(null);
        success("Post deleted");
      },
    });
  };

  // ── Stats ─────────────────────────────────────────────────────
   const stats = {
     total: posts.length,
     needsReview: posts.filter((p) => p.clientStatus === "Needs Your Review").length,
     blocked: posts.filter((p) => p.isBlocked).length,
   };

   // ── Comment submit ────────────────────────────────────────────
   const submitComment = (isInternal: boolean) => {
     if (!activePost || !newCommentText.trim()) return;
     onAddComment(activePost.id, {
       author: currentUser?.username || "Agency",
       text: newCommentText.trim(),
       isInternalOnly: isInternal,
       timestamp: new Date().toISOString(),
     });
     setNewCommentText("");
   };

   const currentTenant = tenants.find((tenant) => tenant.id === _tenantId) || null;

   return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 sm:mb-10">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-zinc-400 text-sm font-medium mb-1">
            <OsirisLogo size={18} className="shrink-0" />
            <button
              onClick={() => _onSwitchTenant("")}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Osiris Agency
            </button>
            <ChevronRight className="w-4 h-4 text-zinc-500" />
            {/* Client switcher — switch between clients without going back */}
            <div className="relative">
              <button
                onClick={() => setClientSwitcherOpen((o) => !o)}
                className="flex items-center gap-1.5 text-white font-bold hover:text-indigo-300 transition-colors group"
              >
                <span>{brandName || _tenantId}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${clientSwitcherOpen ? "rotate-180" : ""}`} />
              </button>
              {clientSwitcherOpen && (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setClientSwitcherOpen(false)} aria-hidden="true" />
                  <div className="absolute left-0 top-full mt-1 z-[95] min-w-[220px] max-h-[320px] overflow-y-auto bg-white rounded-xl border border-zinc-200 shadow-xl py-1">
                    {tenants.map((t) => {
                      let settings: Record<string, any> = {};
                      try {
                        settings = typeof t.settings === "string" ? (JSON.parse(t.settings || "{}") || {}) : (t.settings || {});
                      } catch { /* ignore */ }
                      const internalToken = settings?.internalToken || "";
                      const isCurrent = t.id === _tenantId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            _onSwitchTenant(t.id, "internal", internalToken);
                            setClientSwitcherOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isCurrent ? "bg-indigo-50 text-indigo-700" : "hover:bg-zinc-50 text-zinc-700"}`}
                        >
                          {t.logoUrl ? (
                            <img src={t.logoUrl} alt={`${t.name} logo`} className="w-7 h-7 rounded-lg object-cover border border-zinc-200" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">{t.name?.charAt(0) || "?"}</div>
                          )}
                          <span className="font-semibold text-sm truncate flex-1">{t.name || t.id}</span>
                          {isCurrent && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                        </button>
                      );
                    })}
                    <div className="border-t border-zinc-100 mt-1 pt-1">
                      <button
                        onClick={() => { _onSwitchTenant(""); setClientSwitcherOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 text-zinc-500 transition-colors"
                      >
                        <Layout className="w-7 h-7 text-zinc-400" />
                        <span className="font-medium text-sm">All clients (Dashboard)</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Review Room</h1>
          <p className="text-xs text-zinc-500 font-medium pt-0.5">Press <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono">J</kbd>/<kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono">K</kbd> to navigate{canCreate ? <> · <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono">E</kbd> edit</> : null} · <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono">Esc</kbd> close</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Toggle */}
          <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl shrink-0">
            {(["grid", "calendar", "analytics"] as const).map(v => {
              const icons = { grid: Grid3X3, calendar: Calendar, analytics: BarChart2 };
              const Icon = icons[v];
              return (
                 <button key={v} onClick={() => { setViewMode(v); setShowGlobalOverview(false); }} title={v.charAt(0).toUpperCase() + v.slice(1)} aria-label={`${v.charAt(0).toUpperCase() + v.slice(1)} view`} aria-pressed={viewMode === v && !showGlobalOverview}
                   className={`p-2 rounded-lg transition-all ${viewMode === v && !showGlobalOverview ? "bg-white shadow-sm text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}>
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
            <button
              onClick={() => setShowGlobalOverview(!showGlobalOverview)}
               className={`p-2 rounded-lg transition-all ${showGlobalOverview ? "bg-white shadow-sm text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
               title="Global Overview"
               aria-label="Global Overview"
               aria-pressed={showGlobalOverview}
            >
              <Layout className="w-4 h-4" />
            </button>
          </div>
          <div className="relative group flex-1 sm:flex-none sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Search posts, campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
            />
          </div>
          <button
             onClick={onPreviewClient}
             className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
             title="Preview the client-facing profile"
             aria-label="Preview client view"
          >
            <Eye className="w-4 h-4" /> <span className="hidden sm:inline">Preview client view</span>
          </button>
           <button onClick={() => setShowShareModal(true)} className="flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95" aria-label="Share client review links">
             <Link className="w-4 h-4" /> <span className="hidden sm:inline">Share links</span>
           </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-3 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {adminToken && currentUser && (
            <button
              onClick={() => setShowUpdatesModal(true)}
              className="relative flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-3 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
              title="What's new"
            >
              <Megaphone className="w-4 h-4" />
              {unreadUpdates > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">{unreadUpdates}</span>
              )}
            </button>
          )}
          {currentUser?.username && (
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2.5 py-2 rounded-xl bg-white border border-zinc-200 max-w-[180px] truncate" title={currentUser.username}>
              {currentUser.username.split("@")[0]}
            </span>
          )}
          <button onClick={() => setShowCampaignModal(true)} className="flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-3 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95" title="Campaigns">
            <Flag className="w-4 h-4" /> <span className="hidden sm:inline">Campaigns</span>
          </button>
          {isSuperAdmin && (
            <button onClick={() => setShowTenantModal(true)} className="flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-3 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95" title="Client Settings">
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Global Overview Content */}
      {showGlobalOverview && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
            <Layout className="w-5 h-5 text-indigo-500" /> Agency Global Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {globalStats.map((s: any) => (
              <div key={s.id} onClick={() => { _onSwitchTenant(s.id); setShowGlobalOverview(false); }}
                className="group bg-white border border-zinc-200 p-5 rounded-2xl hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/5 transition-all cursor-pointer relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-4 h-4 text-indigo-500" />
                </div>
                <h3 className="font-bold text-zinc-900 mb-4">{s.name}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-50 p-2 rounded-lg">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total</p>
                    <p className="text-lg font-black text-zinc-900">{s.totalPosts}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${s.blocked > 0 ? "bg-red-50" : "bg-zinc-50"}`}>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Blocked</p>
                    <p className={`text-lg font-black ${s.blocked > 0 ? "text-red-600" : "text-zinc-900"}`}>{s.blocked}</p>
                  </div>
                  <div className="bg-indigo-50 p-2 rounded-lg">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Needs Review</p>
                    <p className="text-lg font-black text-indigo-700">{s.needsReview}</p>
                  </div>
                  <div className="bg-emerald-50 p-2 rounded-lg">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Approved</p>
                    <p className="text-lg font-black text-emerald-700">{s.approved}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && !showGlobalOverview && (
        <div className="mb-8">
          <CalendarView
            posts={filteredPosts}
            onOpenPost={(post) => setActivePostId(post.id)}
            onCreatePostForDate={(date) => {
              setEditingPost(null);
              setCalendarDraftDate(date);
              setShowFormModal(true);
            }}
            onSchedulePost={handleSchedulePost}
            canCreate={canCreate}
            canSchedule={canSchedule}
          />
        </div>
      )}

      {/* Analytics View */}
      {viewMode === "analytics" && !showGlobalOverview && (
        <div className="mb-8">
          <Suspense fallback={<div role="status" className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">Loading analytics…</div>}>
            <AnalyticsView tenantId={_tenantId} adminToken={adminToken} brandName={brandName} />
          </Suspense>
        </div>
      )}

      {/* Tabs & Stats */}
      {viewMode === "grid" && (<div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-2xl">
            {[
              { id: "workflow", label: "Workflow" },
              { id: "blocked", label: "Blocked" },
              { id: "archived", label: "Archived" },
            ].map((tab) => (
              <button
                key={tab.id}
                 onClick={() => setActiveTab(tab.id as any)}
                 aria-pressed={activeTab === tab.id}
                 className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === tab.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Campaign filter */}
          {uniqueCampaigns.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Campaign:</span>
              <button onClick={() => setCampaignFilter("")} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${!campaignFilter ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-500 hover:text-zinc-800"}`}>All</button>
              {uniqueCampaigns.map(code => (
                <button key={code} onClick={() => setCampaignFilter(campaignFilter === code ? "" : code)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${campaignFilter === code ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-500 hover:text-zinc-800"}`}>
                  {code}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeTab !== "archived" ? (<>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 mb-4 sm:mb-5 px-1" id="stats-bar">
          {[
             { label: "Total Posts", value: stats.total, color: "text-zinc-900" },
             { label: "Needs review", value: stats.needsReview, color: "text-indigo-600" },
             { label: "Blocked Assets", value: stats.blocked, color: "text-red-600" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 sm:gap-2">
              <span className={`text-lg sm:text-xl font-bold ${s.color}`}>{s.value}</span>
              <span className="text-[11px] sm:text-xs text-zinc-400 font-medium">{s.label}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {canCreate && (
              <>
                <button
                  onClick={() => setShowBatchModal(true)}
                  className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap h-9"
                >
                  <Zap className="w-3.5 h-3.5" /> Bulk Upload
                </button>
                <button
                  onClick={() => { setEditingPost(null); setCalendarDraftDate(undefined); setShowFormModal(true); }}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-indigo-100 h-9"
                >
                  <Plus className="w-4 h-4" /> New Post
                </button>
              </>
            )}
          </div>
        </div>

        {filteredPosts.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 bg-white rounded-3xl border border-zinc-100 shadow-sm">
            <Grid3X3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-base font-medium">{activeTab === "blocked" ? "Nothing blocked" : "No posts found"}</p>
            <p className="text-sm mt-1">{search ? `No results for "${search}"` : "This view is empty"}</p>
          </div>
        ) : (
        <div className="flex gap-3 overflow-x-auto pb-6 items-start snap-x snap-mandatory">
          {(activeTab === "blocked"
            ? [{ id: "blocked", label: "Blocked", statuses: ALL_STATUSES }]
            : WORKFLOW_COLUMNS
          ).map((col) => {
            const colPosts = filteredPosts.filter((p) => col.statuses.includes(p.internalStatus));
            const cap = colShown[col.id] ?? 12;
            const visible = colPosts.slice(0, cap);
            return (
            <div
              key={col.id}
              className={`${activeTab === "blocked" ? "w-full max-w-xl" : "w-[240px] sm:w-[260px]"} shrink-0 bg-zinc-50/90 rounded-2xl border border-zinc-100 p-2 min-h-[36vh] snap-start`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleColumnDrop(col.id); }}
            >
              <div className="flex items-center justify-between px-2 py-2 mb-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{col.label}</h3>
                <span className="text-[10px] font-bold text-zinc-400">{colPosts.length}</span>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5">
          {visible.map((post) => (
            <div
              key={post.id}
               draggable={canMovePosts}
               onDragStart={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest("button,input,textarea,select,a")) {
                  e.preventDefault();
                  return;
                }
                e.stopPropagation();
                draggingIdRef.current = post.id;
                setDraggingId(post.id);
              }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleColumnDrop(col.id, post.id); }}
              onDragEnd={() => {
                setDraggingId(null);
                setTimeout(() => { draggingIdRef.current = null; }, 80);
              }}
              onClick={() => openPost(post)}
              className={`bg-white rounded-xl border-2 overflow-hidden shadow-sm transition-all cursor-pointer group flex flex-col relative ${selectedIds.has(post.id) ? "border-indigo-500 ring-4 ring-indigo-50" : "border-zinc-200 hover:shadow-md hover:border-zinc-300"} ${draggingId === post.id ? "opacity-60" : ""}`}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => toggleSelect(post.id, e)}
                className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedIds.has(post.id)
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white/80 backdrop-blur border-zinc-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shadow-sm"
                  }`}
                aria-label={`Select ${post.title}`}
              >
                {selectedIds.has(post.id) && <CheckSquare className="w-4 h-4" />}
              </button>

              {/* Thumbnail */}
              <div className={`relative ${tileAspectClass(post.format)} bg-zinc-100 overflow-hidden shrink-0`}>
                {(post.thumbnailUrl || (post.mediaUrls && post.mediaUrls[0])) ? (
                  post.thumbnailUrl ? (
                    <img src={post.thumbnailUrl} alt={post.title} onError={(e) => { e.currentTarget.src = fallbackSvg; }} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : shouldRenderAsVideo(post.mediaUrls[0], post.format) ? (
                    <video 
                      src={post.mediaUrls[0]} 
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      onError={(e) => { (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); e.currentTarget.classList.add("hidden"); }} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      muted loop playsInline 
                    />
                  ) : (
                    <img src={post.mediaUrls[0]} alt={post.title} onError={(e) => { e.currentTarget.src = fallbackSvg; }} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-10 h-10 text-zinc-300" />
                  </div>
                )}

                {/* Subtle Cover Indicator */}
                {post.thumbnailUrl && (
                  <div className="absolute top-3 right-10 z-20 bg-emerald-500 text-white p-1 rounded-md shadow-lg border border-white/20" title="Custom Cover Active">
                    <ImageIcon className="w-3.5 h-3.5" />
                  </div>
                )}
                {/* Format badge — top right */}
                <div className="absolute top-2 right-2 flex flex-col gap-2 scale-90 group-hover:scale-100 transition-transform origin-top-right">
                  <div className="bg-black/50 backdrop-blur-md text-white p-1.5 rounded-lg">
                    {post.format === "carousel" && <Copy className="w-3.5 h-3.5" />}
                    {post.format === "reel" && <Play className="w-3.5 h-3.5 fill-current" />}
                    {post.format === "image" && <ImageIcon className="w-3.5 h-3.5" />}
                    {post.format === "story" && <RectangleVertical className="w-3.5 h-3.5" />}
                  </div>
                  {post.mediaUrls.length > 1 && (
                    <div className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">{post.mediaUrls.length}</div>
                  )}
                </div>

                {/* Carousel next-slide cycle */}
                {post.mediaUrls.length > 1 && (
                  <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <div className="flex items-center gap-1.5 p-1 bg-black/40 backdrop-blur-md rounded-lg">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentThumb = post.thumbnailUrl || post.mediaUrls[0];
                          const currentIdx = post.mediaUrls.indexOf(currentThumb);
                          const nextIdx = (currentIdx + 1) % post.mediaUrls.length;
                          onUpdatePost({ ...post, thumbnailUrl: post.mediaUrls[nextIdx] });
                        }}
                        className="flex-1 py-1 bg-white hover:bg-zinc-100 text-[9px] font-black uppercase tracking-widest text-zinc-900 rounded shadow-sm transition-colors"
                      >
                        Next Slide
                      </button>
                    </div>
                  </div>
                )}

                {post.isBlocked && (
                  <div className="absolute inset-0 bg-red-900/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="bg-white px-3 py-1.5 rounded-full text-red-700 text-xs font-bold uppercase tracking-wider shadow-lg flex items-center space-x-1.5 border border-red-100">
                      <AlertCircle className="w-3.5 h-3.5" /><span>Blocked</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick duplicate button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDuplicate(post); }}
                className="absolute bottom-3 left-3 z-10 w-8 h-8 rounded-lg bg-white/95 backdrop-blur shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
                title="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>

              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-sm text-zinc-900 line-clamp-2 mb-2 leading-tight">{post.title}</h3>
                <div className="mt-auto pt-2 border-t border-zinc-50 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant={statusVariant(post.internalStatus)} className="shrink-0">
                      {post.internalStatus}
                    </Badge>
                    {post.campaignCode && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0 max-w-[90px] truncate" title={post.campaignCode}>
                        <Tag className="w-2.5 h-2.5" />{post.campaignCode}
                      </span>
                    )}
                    {(post.revisionCount ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0" title={`${post.revisionCount} revision${(post.revisionCount ?? 0) > 1 ? "s" : ""}`}>
                        <GitBranch className="w-2.5 h-2.5" />v{(post.revisionCount ?? 0) + 1}
                      </span>
                    )}
                    {post.dueDate && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 flex items-center gap-1 ${isOverdue(post.dueDate) && !["Approved", "Posted", "Scheduled"].includes(post.internalStatus) ? "border-red-300 text-red-600 bg-red-50" : "border-zinc-200 text-zinc-500 bg-zinc-50"}`}>
                        <Clock className="w-3 h-3" />{dateOnly(post.dueDate)}
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={post.date || ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updatePostWithScheduling(post, { date: e.target.value })}
                    className="text-[10px] sm:text-[11px] font-bold text-zinc-400 bg-transparent border-none p-0 w-[105px] cursor-pointer hover:text-indigo-600 focus:text-indigo-600 focus:ring-0 text-right opacity-70 hover:opacity-100 transition-all shrink-0"
                    title="Edit Date"
                  />
                </div>
              </div>
            </div>
          ))}
          {colPosts.length > visible.length && (
            <button
              type="button"
              onClick={() => setColShown((s) => ({ ...s, [col.id]: (s[col.id] ?? 12) + 12 }))}
              className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 rounded-lg"
            >
              Show more ({colPosts.length - visible.length})
            </button>
          )}
              </div>
            </div>
            );
          })}
        </div>
        )}
        </> ) : (
          /* Archived Posts Grid */
          <div>
            <div className="flex items-center gap-2 mb-4 px-1">
              <Archive className="w-5 h-5 text-zinc-400" />
              <span className="text-sm font-bold text-zinc-500">Archived Posts ({archivedPosts.length})</span>
            </div>
            {archivedPosts.length === 0 ? (
              <div className="text-center py-20 text-zinc-400 bg-white rounded-3xl border border-zinc-100 shadow-sm">
                <Archive className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-base font-medium">No archived posts</p>
                <p className="text-sm mt-1">Archived posts will appear here.</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {archivedPosts.slice(0, listShown).map((post) => (
                  <div
                    key={post.id}
                    onClick={() => { setActiveTab("workflow"); setActivePostId(post.id); }}
                    className="bg-white rounded-xl border-2 border-zinc-200 overflow-hidden shadow-sm flex flex-col relative opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {/* Thumbnail */}
                    <div className={`relative ${tileAspectClass(post.format)} bg-zinc-100 overflow-hidden shrink-0`}>
                      {(post.thumbnailUrl || (post.mediaUrls && post.mediaUrls[0])) ? (
                        <img src={post.thumbnailUrl || post.mediaUrls[0]} alt={post.title} onError={(e) => { e.currentTarget.src = fallbackSvg; }} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-10 h-10 text-zinc-300" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex flex-col gap-2">
                        <div className="bg-black/50 backdrop-blur-md text-white p-1.5 rounded-lg">
                          {post.format === "carousel" && <Copy className="w-3.5 h-3.5" />}
                          {post.format === "reel" && <Play className="w-3.5 h-3.5 fill-current" />}
                          {post.format === "story" && <RectangleVertical className="w-3.5 h-3.5" />}
                          {post.format === "image" && <ImageIcon className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-bold text-sm text-zinc-900 line-clamp-2 mb-2 leading-tight">{post.title}</h3>
                      <div className="mt-auto pt-2 border-t border-zinc-50 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge variant="neutral" className="shrink-0">{post.internalStatus}</Badge>
                          {post.campaignCode && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0 max-w-[90px] truncate" title={post.campaignCode}>
                              <Tag className="w-2.5 h-2.5" />{post.campaignCode}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdatePost({ ...post, archivedAt: null });
                            setArchivedPosts((prev) => prev.filter((p) => p.id !== post.id));
                            setActiveTab("workflow");
                            setActivePostId(post.id);
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 inline mr-1" /> Restore
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {archivedPosts.length > listShown && (
                <button
                  type="button"
                  onClick={() => setListShown((n) => n + 24)}
                  className="mt-4 w-full py-2.5 text-xs font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 rounded-xl border border-indigo-100"
                >
                  Show more ({archivedPosts.length - listShown})
                </button>
              )}
              </>
            )}
          </div>
        )}
      </div>)}

      {/* ── Detail Overlay ─────────────────────────────────────── */}
      <AnimatePresence>
        {activePost && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
            onClick={() => setActivePostId(null)}
          >
             <motion.div
               ref={detailDialogRef}
               role="dialog"
               aria-modal="true"
               aria-labelledby="agency-post-viewer-title"
               tabIndex={-1}
               initial={{ scale: 0.95, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl h-[95vh] md:h-[min(95vh,900px)] overflow-hidden flex flex-col md:flex-row relative min-h-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left: Media */}
              <div className="w-full md:w-[42%] bg-zinc-900 flex flex-col relative overflow-hidden h-[45vh] md:h-full min-h-0">
                {/* Overlay Header */}
                <div className="absolute top-0 inset-x-0 p-4 z-40 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(activePost.internalStatus)}>
                      {activePost.internalStatus}
                    </Badge>
                    {activePost.isBlocked && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-red-500 text-white border-red-500 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Blocked
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                     <button type="button" aria-label="Previous post" onClick={handlePrev} disabled={activePostFilteredIdx <= 0} className="p-2 text-white/60 hover:text-white bg-black/20 hover:bg-black/40 rounded-lg disabled:opacity-30 transition-all">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                     <button type="button" aria-label="Next post" onClick={handleNext} disabled={activePostFilteredIdx >= filteredPosts.length - 1} className="p-2 text-white/60 hover:text-white bg-black/20 hover:bg-black/40 rounded-lg disabled:opacity-30 transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Media Playback Area */}
                <div className="flex-1 flex items-center justify-center p-6 relative group/viewer">
                  {activePost.mediaUrls.length > 0 ? (
                    shouldRenderAsVideo(activePost.mediaUrls[activeImageIdx], activePost.format) ? (
                      <div className="w-full h-full flex items-center justify-center relative">
                        <video
                          ref={videoRef}
                          key={activePost.mediaUrls[activeImageIdx]}
                          src={activePost.mediaUrls[activeImageIdx]}
                          className="max-w-full max-h-full rounded-xl shadow-2xl shadow-black/50"
                          controls autoPlay muted loop playsInline
                          poster={activePost.thumbnailUrl || undefined}
                          crossOrigin="anonymous"
                          onError={(e) => { (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); e.currentTarget.classList.add("hidden"); }}
                        />
                        {/* Video Actions overlay */}
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/viewer:opacity-100 transition-opacity">
                          <button 
                            onClick={handleCaptureFrame}
                            disabled={isCapturing}
                            className="bg-black/60 backdrop-blur-md hover:bg-black text-white p-2.5 rounded-xl shadow-xl border border-white/10 active:scale-95 transition-all flex items-center gap-2 group/btn"
                            title="Capture current frame as Post Cover"
                          >
                            {isCapturing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Camera className="w-4 h-4 text-indigo-400 group-hover/btn:scale-110 transition-transform" />}
                            <span className="text-[10px] font-black uppercase tracking-wider pr-1">Capture Frame</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center relative">
                        <img
                          src={activePost.mediaUrls[activeImageIdx]}
                          alt={activePost.title}
                          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl shadow-black/50"
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.currentTarget.src = fallbackSvg; }}
                        />
                        <div className="absolute top-4 right-4 opacity-0 group-hover/viewer:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              onUpdatePost({ ...activePost, thumbnailUrl: activePost.mediaUrls[activeImageIdx] });
                              success("Cover set to current image");
                            }}
                            className="bg-black/60 backdrop-blur-md hover:bg-black text-white p-2.5 rounded-xl shadow-xl border border-white/10 active:scale-95 transition-all"
                            title="Set current image as Post Cover"
                          >
                            <ImageIcon className="w-4 h-4 text-indigo-400" />
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center text-zinc-700">
                      <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                      <p className="text-sm font-medium">No media assets</p>
                    </div>
                  )}

                  {/* Carousel prev/next within post */}
                  {activePost.mediaUrls.length > 1 && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setActiveImageIdx((i) => Math.max(0, i - 1)); }} disabled={activeImageIdx === 0} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-all z-20">
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setActiveImageIdx((i) => Math.min(activePost.mediaUrls.length - 1, i + 1)); }} disabled={activeImageIdx === activePost.mediaUrls.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-all z-20">
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </>
                  )}
                </div>

                {/* Carousel mini-thumbnails */}
                {activePost.mediaUrls.length > 1 && (
                  <div className="p-4 bg-zinc-950/40 backdrop-blur-md border-t border-white/5 flex gap-2 overflow-x-auto shrink-0 scrollbar-hide">
                    {activePost.mediaUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImageIdx(i)}
                        className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all relative group/mini ${i === activeImageIdx ? "border-indigo-500 scale-105 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"}`}
                      >
                        {shouldRenderAsVideo(url, activePost.format) ? (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[8px] text-white font-bold tracking-tighter">VIDEO</div>
                        ) : (
                          <img src={url} alt="" onError={(e) => { e.currentTarget.src = fallbackSvg; }} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        )}

                        {/* Set as cover from carousel mini */}
                        {activePost.thumbnailUrl !== url && (
                          <div className="absolute inset-0 bg-indigo-600/80 items-center justify-center hidden group-hover/mini:flex transition-all">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdatePost({ ...activePost, thumbnailUrl: url });
                                success("Cover updated");
                              }}
                              className="p-1.5 bg-white text-indigo-600 rounded-full shadow-lg"
                              title="Set as Cover"
                            >
                              <ImageIcon className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {activePost.thumbnailUrl === url && (
                          <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-white shadow-sm" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Info Panels */}
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                <header className="p-6 border-b border-zinc-100 flex items-start justify-between">
                  <div className="flex-1">
                     <h2 id="agency-post-viewer-title" className="text-2xl font-black text-zinc-900 leading-tight mb-2 tracking-tight">{activePost.title}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      <span className="flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-md text-zinc-500">
                        <Tag className="w-3.5 h-3.5" />{activePost.campaignCode || "—"}
                      </span>
                      <span>· {activePost.contentPillar || "—"}</span>
                      {activePost.dueDate && (
                        <span className={`flex items-center gap-1 ${isOverdue(activePost.dueDate) ? "text-red-500" : ""}`}>
                          · Due {dateOnly(activePost.dueDate)}
                        </span>
                      )}
                      <div className="flex items-center gap-1 group cursor-pointer" title="Edit Date">
                        <span>·</span>
                        <input
                          type="date"
                          value={activePost.date || ""}
                          onChange={(e) => updatePostWithScheduling(activePost, { date: e.target.value })}
                          className="bg-transparent border border-transparent hover:border-zinc-300 focus:border-indigo-500 rounded px-1 -ml-0.5 text-xs font-bold text-zinc-400 focus:text-zinc-900 group-hover:text-zinc-600 outline-none transition-all cursor-pointer w-[105px] h-6 inline-flex m-0"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canCreate && (
                      <>
                        <button
                          onClick={() => handleDeletePost(activePost)}
                          className="p-2.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Delete post"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button onClick={() => { setEditingPost(activePost); setShowFormModal(true); setActivePostId(null); }} className="p-2.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit post">
                          <Edit3 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void copyActivePostClientShare()}
                      className="p-2.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Copy client link for this post only (single-post review)"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                     <button type="button" onClick={() => setActivePostId(null)} aria-label="Close post viewer" className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all" title="Close">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {/* Quick Controls */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Assignee</label>
                      <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                          {(activePost.assignee?.[0] ?? "?").toUpperCase()}
                        </div>
                        {teamMembers.length > 0 ? (
                          <select
                            className="bg-transparent text-sm font-bold text-zinc-900 outline-none w-full"
                            value={activePost.assignee}
                            onChange={(e) => onUpdatePost({ ...activePost, assignee: e.target.value })}
                          >
                            <option value="Unassigned">Unassigned</option>
                            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        ) : (
                          <input
                            className="bg-transparent text-sm font-bold text-zinc-900 outline-none w-full"
                            value={activePost.assignee}
                            onChange={(e) => onUpdatePost({ ...activePost, assignee: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Status</label>
                      <select
                        className="w-full p-3 bg-zinc-50 rounded-2xl border border-zinc-100 text-sm font-bold text-zinc-900 outline-none appearance-none"
                        value={activePost.internalStatus}
                        onChange={(e) => {
                          const next = e.target.value as InternalStatus;
                          const cs = clientStatusForInternalChange(next);
                          updatePostWithScheduling(activePost, { internalStatus: next }, cs !== undefined ? { clientStatus: cs } : {});
                        }}
                      >
                        {(() => {
                          const allowed = new Set(getAllowedStatuses(role));
                          if (!allowed.has(activePost.internalStatus)) allowed.add(activePost.internalStatus);
                          return [...allowed].sort((a, b) => ALL_STATUSES.indexOf(a) - ALL_STATUSES.indexOf(b));
                        })().map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3">
                    {canCreate && (
                      <button onClick={() => handleDuplicate(activePost)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 rounded-2xl text-xs font-bold border border-zinc-200 transition-all">
                        <Copy className="w-4 h-4" /> Duplicate
                      </button>
                    )}
                    {canReviewContent && (
                      <button onClick={() => {
                        const incompleteTasks = activePost.internalTasks.filter(t => !t.completed);
                        if (incompleteTasks.length > 0) {
                          if (!window.confirm(`⚠️ There are ${incompleteTasks.length} incomplete production task(s). Send to client anyway?`)) return;
                        }
                        onUpdatePost({ ...activePost, internalStatus: "Ready for Client", clientStatus: "Needs Your Review" });
                      }} className="flex-[2] flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-100 transition-all">
                         <CheckCircle2 className="w-4 h-4" /> Send for client review
                      </button>
                    )}
                    {(canCreate || canReviewContent) && activePost.internalStatus === "Changes Requested" && (
                      <button
                        onClick={() => onUpdatePost({ ...activePost, internalStatus: "Ready for Client", clientStatus: "Needs Your Review" })}
                        className="flex-[2] flex items-center justify-center gap-2 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl text-xs font-bold border border-amber-200 transition-all"
                      >
                         <Send className="w-4 h-4" /> Resubmit for review
                      </button>
                    )}
                  </div>

                  {/* Caption Panel */}
                  <div className="p-5 bg-zinc-50 rounded-3xl border border-zinc-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Captions & Hashtags</h3>
                      <button
                        onClick={handleApplyToBatch}
                        className="text-[10px] font-bold text-indigo-600 hover:underline hover:text-indigo-700 transition-colors"
                        title={selectedIds.size > 0 ? `Apply to ${selectedIds.size} selected posts` : "Apply to all posts"}
                      >
                        {selectedIds.size > 0 ? `Apply to ${selectedIds.size} selected` : "Apply to All Posts"}
                      </button>
                    </div>
                    <p className="text-sm text-zinc-800 leading-relaxed mb-4 whitespace-pre-wrap break-words">{activePost.caption}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activePost.hashtags.map((t) => (
                        <span key={t} className="text-xs font-bold text-indigo-600 bg-indigo-50/50 px-2 py-1 rounded-md">
                          {normaliseTag(t)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Blocked Reason */}
                  {activePost.isBlocked && activePost.blockedReason && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-black uppercase tracking-widest text-red-500">Blocked Reason</span>
                      </div>
                      <p className="text-sm text-red-700 whitespace-pre-wrap break-words">{activePost.blockedReason}</p>
                    </div>
                  )}

                  {/* Internal Notes (read-only here — editable via Edit Post) */}
                  {activePost.internalNotes && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 block mb-1">Internal Notes</span>
                      <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap break-words">{activePost.internalNotes}</p>
                    </div>
                  )}

                  {/* Asset Lineage */}
                  {activePost.assetLineage && (
                    <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Asset Lineage</span>
                      <p className="text-sm text-zinc-600 font-mono leading-relaxed break-all whitespace-pre-wrap">{activePost.assetLineage}</p>
                    </div>
                  )}

                  {/* Production Tasks */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2 px-1">
                      <Layout className="w-3.5 h-3.5" /> Production Tasks
                    </h3>
                    <div className="space-y-2">
                      {activePost.internalTasks.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 p-3 bg-white border border-zinc-100 rounded-2xl hover:border-zinc-200 transition-all group">
                          <button
                            onClick={() => onToggleTask(activePost.id, t.id, !t.completed)}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${t.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-300"}`}
                          >
                            {t.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <span className={`text-sm flex-1 ${t.completed ? "text-zinc-400 line-through" : "text-zinc-700 font-medium"}`}>{t.text}</span>
                          <button
                            onClick={() => onDeleteTask(activePost.id, t.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-300 hover:text-red-500 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {isAddingTask ? (
                        <div className="flex items-center gap-3 p-3 bg-white border-2 border-dashed border-indigo-200 rounded-2xl">
                          <input
                            autoFocus
                            className="flex-1 bg-transparent text-sm font-medium outline-none"
                            placeholder="Task name..."
                            value={newTaskText}
                            onChange={(e) => setNewTaskText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newTaskText.trim()) {
                                onAddTask(activePost.id, { text: newTaskText.trim(), completed: false });
                                setNewTaskText("");
                                setIsAddingTask(false);
                              }
                              if (e.key === "Escape") { setNewTaskText(""); setIsAddingTask(false); }
                            }}
                          />
                          <button onClick={() => { setNewTaskText(""); setIsAddingTask(false); }} className="text-xs font-bold text-zinc-400 hover:text-zinc-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setIsAddingTask(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 rounded-2xl text-xs font-bold border-2 border-dashed border-zinc-200 transition-all group">
                          <Plus className="w-4 h-4 group-hover:scale-125 transition-transform" /> Add Production Step
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Feedback & Discussion */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2 px-1">
                      <MessageSquare className="w-3.5 h-3.5" /> Feedback & Discussion
                    </h3>
                    <div className="space-y-3 bg-zinc-50 rounded-[32px] p-5 border border-zinc-100">
                      <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2">
                        {activePost.clientComments.length === 0 && (
                          <div className="text-center py-6">
                            <MessageSquare className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">No feedback yet</p>
                          </div>
                        )}
                        {activePost.clientComments.map((c) => (
                          <div key={c.id} className={`flex gap-3 group ${c.isInternalOnly ? "opacity-75" : ""}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${c.isInternalOnly ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                              {c.author[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-bold text-zinc-900">{c.author}</span>
                                <span className="text-[10px] font-bold text-zinc-400">{new Date(c.timestamp).toLocaleDateString()}</span>
                                {c.isInternalOnly && <Lock className="w-2.5 h-2.5 text-amber-500" />}
                              </div>
                              <p className="text-sm text-zinc-600 leading-relaxed bg-white border border-zinc-100 rounded-2xl px-4 py-2 shadow-sm inline-block">{c.text}</p>
                              {c.changeType && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5 ml-1">
                                  <span className="text-[9px] font-bold uppercase tracking-widest bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200">
                                    {c.changeType}
                                  </span>
                                  {c.priority && (
                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${c.priority === "high" ? "bg-red-50 text-red-600 border-red-200" :
                                      c.priority === "medium" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                        "bg-blue-50 text-blue-600 border-blue-200"
                                      }`}>
                                      {c.priority} Priority
                                    </span>
                                  )}
                                  {c.slideIndex !== undefined && (
                                    <span className="text-[9px] font-bold uppercase tracking-widest bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200">
                                      Slide {c.slideIndex + 1}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <button onClick={() => onDeleteComment(activePost.id, c.id)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-red-500 transition-all self-start pt-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Comment Composer */}
                      <div className="relative pt-2 border-t border-zinc-200/50 mt-2">
                        <input
                          className="w-full bg-white border border-zinc-200 rounded-2xl pl-4 pr-28 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                          placeholder="Add a reply…"
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newCommentText.trim()) {
                              e.preventDefault();
                              submitComment(e.shiftKey);
                            }
                          }}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <button
                            onClick={() => submitComment(true)}
                            disabled={!newCommentText.trim()}
                            className="text-[9px] font-black uppercase tracking-wider text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg disabled:opacity-30 transition-all"
                            title="Send as internal note"
                          >
                            Internal
                          </button>
                          <button
                            onClick={() => submitComment(false)}
                            disabled={!newCommentText.trim()}
                            className="p-1.5 text-indigo-500 hover:text-indigo-700 disabled:opacity-30 transition-colors"
                            title="Send reply"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight ml-2">Enter to reply · Shift+Enter for Internal note</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareClientLinkModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        tenant={currentTenant ? { id: String(currentTenant.id), name: String(currentTenant.name || currentTenant.id) } : null}
        adminToken={adminToken}
        currentUser={currentUser}
        includeAgencyLink
      />

      {/* Tenant Manager */}
      <TenantManagerModal
        isOpen={showTenantModal}
        onClose={() => setShowTenantModal(false)}
        tenants={tenants}
        onUpsert={onUpsertTenant}
        onDelete={onDeleteTenant}
      />

      {/* Campaign Manager */}
      {showCampaignModal && (
        <Suspense fallback={null}>
          <CampaignManagerModal
            isOpen={showCampaignModal}
            onClose={() => setShowCampaignModal(false)}
            tenantId={_tenantId}
            adminToken={adminToken}
            emit={emit || (() => { })}
            onRefresh={refreshWorkspaceCatalog}
          />
        </Suspense>
      )}

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3 bg-zinc-900 text-white px-6 py-4 rounded-3xl shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center gap-4 pr-6 border-r border-zinc-700">
              <button onClick={clearSelection} className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-400">
                <X className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold whitespace-nowrap">{selectedIds.size} <span className="text-zinc-500 font-medium ml-1">selected</span></span>
            </div>
            <div className="flex items-center gap-2">
              {canReviewContent && (
                <button onClick={handlePushToReview} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20">
                   <Send className="w-4 h-4" /> Send for review
                </button>
              )}
              <button onClick={handleShareSelected} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                <Link className="w-4 h-4" /> Share Selected
              </button>
              {canSchedule && (
                <>
                  <button onClick={() => handleBulkStatusChange("Scheduled")} className="px-4 py-2 hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-purple-400" /> Set Scheduled
                  </button>
                  <button onClick={() => handleBulkStatusChange("Posted")} className="px-4 py-2 hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-emerald-400" /> Set Posted
                  </button>
                </>
              )}
              {canCreate && (
                <>
                  <button onClick={() => handleBulkStatusChange("Draft")} className="px-4 py-2 hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-blue-400" /> Move to Draft
                  </button>
                  <div className="w-px h-6 bg-zinc-800 mx-2" />
                  <button onClick={handleBulkArchive} className="px-4 py-2 hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <Archive className="w-4 h-4" /> Archive
                  </button>
                  <button onClick={handleBulkDelete} className="px-4 py-2 hover:bg-red-500/10 hover:text-red-400 text-red-500 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        onConfirm={confirm.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Batch Upload */}
      {showBatchModal && (
        <Suspense fallback={null}>
          <BatchUploadModal isOpen={showBatchModal} onClose={() => setShowBatchModal(false)} onComplete={onCreatePostsBulk} />
        </Suspense>
      )}

      {/* Post Form — key forces re-init when editingPost changes so status is never stale */}
      {showFormModal && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-[70] grid place-items-center bg-black/60 text-sm font-medium text-white">Loading post editor…</div>}>
        <PostFormModal
          key={editingPost?.id ?? `new-${calendarDraftDate ?? "today"}`}
          onClose={() => { setShowFormModal(false); setEditingPost(null); setCalendarDraftDate(undefined); }}
          onSubmit={(p) => {
            if (editingPost) {
              const latestPost = posts.find((px) => px.id === editingPost.id) ?? editingPost;
              const merged = { ...latestPost, ...p } as Post;
              merged.clientStatus = p.clientStatus ?? latestPost.clientStatus;
              merged.internalStatus = p.internalStatus ?? latestPost.internalStatus;
              merged.thumbnailUrl = (p.thumbnailUrl || latestPost.thumbnailUrl) || undefined;
              merged.clientComments = latestPost.clientComments;
              merged.internalTasks = latestPost.internalTasks;
              onUpdatePost(merged);
            } else {
              onCreatePost(p as any);
            }
            setShowFormModal(false);
            setEditingPost(null);
            setCalendarDraftDate(undefined);
          }}
          post={editingPost}
          initialDate={calendarDraftDate}
          pillarOptions={workspacePillars}
          campaignOptions={workspaceCampaigns}
        />
        </Suspense>
      )}
      {adminToken && currentUser && (
        <UpdatesModal
          isOpen={showUpdatesModal}
          onClose={() => { setShowUpdatesModal(false); setUnreadUpdates(0); }}
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onUnreadChange={setUnreadUpdates}
        />
      )}
    </div>
  );
}



