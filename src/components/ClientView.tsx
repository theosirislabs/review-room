import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Post } from "../types";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft, ChevronRight, Copy, Grid3X3,
  Play, Send, X, CalendarDays, Clock, CheckCheck,
  AlertCircle, Loader2, ImageOff, MessageSquare, Share2, FileText
} from "lucide-react";
import { useToast } from "./Toast";
import { createAndCopyClientPostShare } from "../clientPostShare";
import { useClientTheme } from "../clientTheme";
import { ClientThemeToggle } from "./ClientThemeToggle";

interface Props {
  posts: Post[];
  tenantId: string;
  brandName?: string;
  logoUrl?: string;
  bio?: string;
  reviewerName?: string;
  /** When true (single-post magic link), show the post even if client status is "Not Ready for Client". */
  singlePostShareMode?: boolean;
  /** When true, this is a share-set (multi-post review) view. */
  shareSetMode?: boolean;
  /** Agency / internal staff: show control to copy a single-post review link from the client UI. */
  postShareLinkEligible?: boolean;
  previewMode?: boolean;
  adminToken?: string;
  onUpdatePost: (post: Post) => void;
  onAddComment: (postId: string, comment: any) => void;
  // Preserved for compatibility with the existing client route contract.
  onDeleteComment: (postId: string, commentId: string) => void;
}

import { fallbackSvg, parseDateSafe, isPostVisibleToClient, shouldRenderAsVideo } from "../utils";
import OsirisLogo from "./OsirisLogo";

function PostStatusBadge({ status }: { status: Post["clientStatus"] }) {
  const cfg = {
    "Not Ready for Client": "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
     "Ready to Schedule": "bg-blue-500/15 text-blue-200 border-blue-500/25",
    "Approved": "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    "Changes Requested": "bg-red-500/20 text-red-300 border-red-400/30",
    "Needs Your Review": "bg-blue-500/25 text-blue-200 border-blue-400/40",
  }[status];
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg}`}>
      {status}
    </span>
  );
}

/* ── Media viewer (true aspect ratio + swipe) ─────────────── */
function MediaViewer({ urls, format, thumbnailUrl: _thumbnailUrl }: { urls: string[]; format: string; thumbnailUrl?: string }) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const touchX = useRef<number | null>(null);
  const url = urls[idx] ?? "";

  // Reset loaded state when switching slides
  useEffect(() => { setLoaded(false); }, [idx]);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(urls.length - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const delta = touchX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) delta > 0 ? next() : prev();
    touchX.current = null;
  };

  if (!url) return (
    <div className="rr-media-surface w-full flex items-center justify-center py-24">
      <p className="text-zinc-600 text-sm">No media</p>
    </div>
  );

  return (
    <div
      className={`relative select-none flex items-center justify-center overflow-hidden ${format === "story" ? "aspect-[9/16] max-h-[70vh] mx-auto w-auto" : ""}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Global skeleton for viewer */}
      {!loaded && (
        <div className="rr-media-skeleton absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
        </div>
      )}

      {shouldRenderAsVideo(url, format) ? (
        <div className={`relative w-full h-full flex items-center justify-center transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}>
          <video
            key={url}
            src={url}
            className="w-full max-h-[70vh] object-contain block"
            controls
            autoPlay
            playsInline
            loop
            onLoadedData={() => setLoaded(true)}
            controlsList="nodownload"
            onError={(e) => { (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); e.currentTarget.classList.add("hidden"); setLoaded(true); }}
          />
          <img src={fallbackSvg} className="hidden w-full max-h-[70vh] object-contain block" alt="Fallback" />
        </div>
      ) : (
        <img key={url} src={url} onLoad={() => setLoaded(true)} onError={(e) => { e.currentTarget.src = fallbackSvg; setLoaded(true); }} alt="" className={`w-full max-h-[70vh] object-contain block transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} referrerPolicy="no-referrer" draggable={false} />
      )}

      {idx > 0 && (
         <button type="button" onClick={prev} aria-label="Previous media slide" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {idx < urls.length - 1 && (
         <button type="button" onClick={next} aria-label="Next media slide" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
      {urls.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => (
             <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`Go to media slide ${i + 1}`} className={`w-5 h-5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/40"}`} />
          ))}
        </div>
      )}
      {urls.length > 1 && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">{idx + 1} / {urls.length}</div>
      )}
    </div>
  );
}

/* ── 4:5 Grid tile ────────────────────────────────────────── */
interface GridTileProps {
  key?: string | number;
  post: Post;
  index: number;
  onClick: () => void;
}

function GridTile({ post, index, onClick, isSelected, isSelectMode, onToggleSelect }: GridTileProps & { isSelected: boolean, isSelectMode: boolean, onToggleSelect: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const approved = post.clientStatus === "Approved";
  const changes = post.clientStatus === "Changes Requested";

  const handleTileClick = () => {
    if (isSelectMode) {
      onToggleSelect();
    } else {
      onClick();
    }
  };

  return (
    <motion.button
      onClick={handleTileClick}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index, 12) * 0.04, duration: 0.3 }}
                 className={`relative block aspect-[3/4] w-full group bg-zinc-200 overflow-hidden rounded-sm border-2 transition-[border-color,box-shadow,transform] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? "border-blue-500 scale-[0.98] ring-4 ring-blue-500/20" : "border-transparent"}`}
       aria-label={`${isSelectMode ? "Select" : "View"} post: ${post.title}`}
       aria-pressed={isSelectMode ? isSelected : undefined}
    >
      {/* Selection Checkbox */}
      {isSelectMode && (
        <div className={`absolute top-3 left-3 z-30 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "bg-blue-500 border-blue-500 shadow-lg" : "bg-black/20 border-white/50 backdrop-blur-md"}`}>
          {isSelected && <CheckCheck className="w-4 h-4 text-white" />}
        </div>
      )}

      {/* Skeleton */}
      {!loaded && <div className="absolute inset-0 skeleton animate-pulse z-10" />}
      {/* Media */}
      {post.thumbnailUrl || post.mediaUrls[0] ? (
        post.thumbnailUrl || shouldRenderAsVideo(post.mediaUrls[0], post.format) ? (
          <div className="w-full h-full relative">
            {post.thumbnailUrl ? (
              <img src={post.thumbnailUrl} alt={post.title} onLoad={() => setLoaded(true)} onError={(e) => { e.currentTarget.src = fallbackSvg; setLoaded(true); }} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`} />
            ) : (
              <video 
                src={post.mediaUrls[0]} 
                onMouseEnter={(e) => e.currentTarget.play()}
                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                onLoadedData={() => setLoaded(true)}
                onError={(e) => { (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); e.currentTarget.classList.add("hidden"); setLoaded(true); }}
                muted loop playsInline preload="none"
                className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
              />
            )}
            <img src={fallbackSvg} className="hidden w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="Fallback" />
          </div>
        ) : (
          <img
            src={post.mediaUrls[0]}
            alt={post.title}
            onLoad={() => setLoaded(true)}
            onError={(e) => { e.currentTarget.src = fallbackSvg; setLoaded(true); }}
            className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            draggable={false}
          />
        )
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-200 to-zinc-300 flex flex-col items-center justify-center gap-2">
          <ImageOff className="w-8 h-8 text-zinc-400" />
          <p className="text-xs text-zinc-400 font-medium">No media</p>
        </div>
      )}

      {/* Format badge */}
      {post.format !== "image" && (
        <div className="absolute top-2 right-2 text-white drop-shadow-lg">
          {post.format === "carousel" ? <Copy className="w-4 h-4" /> : post.format === "story" ? <span className="text-[10px] font-black">9:16</span> : <Play className="w-4 h-4 fill-white" />}
        </div>
      )}

      {/* Slide count */}
      {post.mediaUrls.length > 1 && (
        <div className="absolute top-2 right-8 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
          {post.mediaUrls.length}
        </div>
      )}

      {/* Hover overlay */}
      {!isSelectMode && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <p className="text-white text-xs font-semibold truncate mb-1.5">{post.title}</p>
          {post.campaignCode && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/80 mb-1 truncate">{post.campaignCode}</p>
          )}
          <PostStatusBadge status={post.clientStatus} />
        </div>
      )}

      {/* Status dot */}
      <div className={`absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-md transition-colors ${approved ? "bg-emerald-500" : changes ? "bg-amber-400" : "bg-white/40"}`} />
    </motion.button>
  );
}

/* ── Schedule row ─────────────────────────────────────────── */
interface ScheduleRowProps {
  key?: string | number;
  post: Post;
  index: number;
  onClick: () => void;
}

function ScheduleRow({ post, onClick }: ScheduleRowProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      onClick={onClick}
       className="group flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left transition-[border-color,box-shadow] hover:border-zinc-400 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-4 sm:p-4"
    >
      {/* Thumbnail */}
      <div className={`shrink-0 rounded-xl overflow-hidden bg-zinc-200 relative w-14 sm:w-16 ${post.format === "story" ? "h-24 sm:h-28" : "h-[70px] sm:h-20"}`}>
        {!loaded && <div className="absolute inset-0 skeleton animate-pulse z-10" />}
        {post.thumbnailUrl || post.mediaUrls[0] ? (
          post.thumbnailUrl ? (
            <img src={post.thumbnailUrl} onLoad={() => setLoaded(true)} onError={(e) => { e.currentTarget.src = fallbackSvg; setLoaded(true); }} alt="" className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} />
          ) : shouldRenderAsVideo(post.mediaUrls[0], post.format) ? (
            <>
              <video src={post.mediaUrls[0]} onLoadedData={() => setLoaded(true)} onError={(e) => { (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); e.currentTarget.classList.add("hidden"); setLoaded(true); }} className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} muted autoPlay loop playsInline />
              <img src={fallbackSvg} className="hidden w-full h-full object-cover" alt="Fallback" />
            </>
          ) : (
            <img src={post.mediaUrls[0]} onLoad={() => setLoaded(true)} onError={(e) => { e.currentTarget.src = fallbackSvg; setLoaded(true); }} alt="" className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} referrerPolicy="no-referrer" loading="lazy" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-100 relative z-20">
            <Grid3X3 className="w-5 h-5 text-zinc-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {new Date(post.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />{post.time}
          </span>
        </div>
        <p className="font-semibold text-zinc-900 text-sm truncate">{post.title}</p>
        <p className="text-xs text-zinc-400 truncate mt-0.5">{post.caption}</p>
      </div>

      {/* Status */}
      <div className="flex flex-col items-end gap-2 ml-2 shrink-0">
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${post.clientStatus === "Approved" ? "bg-emerald-50 text-emerald-700"
          : post.clientStatus === "Changes Requested" ? "bg-amber-50 text-amber-700"
            : "bg-zinc-100 text-zinc-600"
          }`}>{post.clientStatus === "Approved" ? "✓ Approved" : post.clientStatus === "Changes Requested" ? "Changes" : "Review"}</span>
        <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
      </div>
    </button>
  );
}

/* ── Main component ───────────────────────────────────────── */
export default function ClientView({ posts, tenantId, brandName, logoUrl, bio, reviewerName = "", singlePostShareMode = false, shareSetMode = false, postShareLinkEligible = false, previewMode = false, adminToken = "", onUpdatePost, onAddComment, onDeleteComment: _onDeleteComment }: Props) {
  const visiblePosts = useMemo(
    () => (singlePostShareMode || shareSetMode ? posts : posts.filter((p) => isPostVisibleToClient(p.clientStatus))),
    [posts, singlePostShareMode, shareSetMode]
  );

  const [activeTab, setActiveTab] = useState<"grid" | "schedule">("grid");
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [commentText, setCommentText] = useState("");
  const { success, error: toastError } = useToast();
  const { theme: clientTheme, toggleTheme: toggleClientTheme } = useClientTheme(tenantId);

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = () => {
    if (previewMode) return;
    selectedIds.forEach(id => {
      const post = visiblePosts.find(p => p.id === id);
      if (post && post.clientStatus !== "Approved") {
        onUpdatePost({ ...post, clientStatus: "Approved", internalStatus: "Approved" });
      }
    });
    setSelectedIds(new Set());
    setIsSelectMode(false);
    success(`Approved ${selectedIds.size} posts`);
  };
  const [sendingComment, setSendingComment] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const commentRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const viewerDialogRef = useRef<HTMLDivElement>(null);
  const desktopViewerCloseRef = useRef<HTMLButtonElement>(null);
  const mobileViewerCloseRef = useRef<HTMLButtonElement>(null);
  const modalTouchX = useRef<number | null>(null);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [reqChangeType, setReqChangeType] = useState("Content");
  const [reqPriority, setReqPriority] = useState<"low" | "medium" | "high">("medium");
  const [reqSlideIndex, setReqSlideIndex] = useState<number | "">("");
  const [reqText, setReqText] = useState("");

  const closeViewer = () => {
    setRequestModalOpen(false);
    setActivePostId(null);
  };

  const sortedPosts = useMemo(() => {
    return [...visiblePosts].sort((a, b) => parseDateSafe(b.date, b.time) - parseDateSafe(a.date, a.time));
  }, [visiblePosts]);

  useEffect(() => { setVisibleCount(24); }, [visiblePosts.length, activeTab]);
  const pagedPosts = sortedPosts.slice(0, visibleCount);
  const schedulePosts = useMemo(
    () => [...sortedPosts].sort((a, b) => parseDateSafe(a.date, a.time) - parseDateSafe(b.date, b.time)),
    [sortedPosts],
  );
  const pagedSchedulePosts = schedulePosts.slice(0, visibleCount);

  const activePost = useMemo(() => activePostId ? sortedPosts.find((p: any) => p.id === activePostId) ?? null : null, [activePostId, sortedPosts]);
  const viewerOpen = activePost !== null;
  const activePostIdx = activePost ? sortedPosts.findIndex((p: any) => p.id === activePost.id) : -1;
  const clientComments = activePost?.clientComments.filter((c: any) => !c.isInternalOnly) ?? [];

  const approved = visiblePosts.filter((p: any) => p.clientStatus === "Approved").length;
  const changes = visiblePosts.filter((p: any) => p.clientStatus === "Changes Requested").length;
  const needsReview = visiblePosts.filter((p: any) => p.clientStatus === "Needs Your Review").length;
  const reviewed = approved + changes;
  const progress = visiblePosts.length > 0 ? Math.round((reviewed / visiblePosts.length) * 100) : 0;

  const displayName = brandName || tenantId.charAt(0).toUpperCase() + tenantId.slice(1);

  const copySinglePostClientLink = useCallback(async () => {
    if (previewMode || !activePost) return;
    const r = await createAndCopyClientPostShare({
       tenantId,
       postId: activePost.id,
       adminToken: adminToken || undefined,
       reviewerName: reviewerName || undefined,
     });
    if (r.ok) success("Single-post client link copied — send this URL to your client.");
    else toastError(r.error);
  }, [activePost, tenantId, adminToken, reviewerName, previewMode, success, toastError]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const allowed = new Set(visiblePosts.map((p) => p.id));
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
  }, [visiblePosts]);

  useEffect(() => {
    if (activePostId && !visiblePosts.some((p) => p.id === activePostId)) {
      setActivePostId(null);
    }
  }, [activePostId, visiblePosts]);

  // Close summary on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (summaryRef.current && !summaryRef.current.contains(e.target as Node)) setSummaryOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keep an opened viewer modal isolated from the page underneath and return
  // keyboard users to the post tile that opened it.
  useEffect(() => {
    if (!viewerOpen) return;

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const isDesktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 640px)").matches;
    (isDesktop ? desktopViewerCloseRef : mobileViewerCloseRef).current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = viewerDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )).filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });
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
  }, [viewerOpen]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || target.isContentEditable) return;
      if (activePostId !== null) {
        if (e.key === "ArrowLeft" && activePostIdx > 0) setActivePostId(sortedPosts[activePostIdx - 1].id);
        if (e.key === "ArrowRight" && activePostIdx < sortedPosts.length - 1) setActivePostId(sortedPosts[activePostIdx + 1].id);
      }
      if (e.key === "Escape") {
        if (requestModalOpen) {
          setRequestModalOpen(false);
          return;
        }
        closeViewer();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activePostId, activePostIdx, sortedPosts, requestModalOpen]);

  const submitComment = async () => {
    if (previewMode || !activePost || !commentText.trim()) return;
    setSendingComment(true);
    onAddComment(activePost.id, {
      author: reviewerName || "Client",
      text: commentText.trim(),
      isInternalOnly: false,
      timestamp: new Date().toISOString(),
    });
    // Auto-update status when client comments
    if (activePost.clientStatus !== "Changes Requested" && activePost.clientStatus !== "Approved") {
      onUpdatePost({ ...activePost, clientStatus: "Changes Requested", internalStatus: "Changes Requested" });
    }
    setCommentText("");
    setSendingComment(false);
  };

  const handleApprove = () => {
    if (previewMode || !activePost) return;
    const wasAlready = activePost.clientStatus === "Approved";
    onUpdatePost({ ...activePost, clientStatus: "Approved", internalStatus: "Approved" });
    if (!wasAlready) success("Post approved ✓");
  };

  const handleRevertApproval = () => {
    if (previewMode || !activePost) return;
    onUpdatePost({ ...activePost, clientStatus: "Needs Your Review", internalStatus: "Ready for Client" });
    success("Status reverted to Needs Your Review");
  };
  const handleRequestChanges = () => {
    if (previewMode) return;
    setRequestModalOpen(true);
  };

  const submitRevisionRequest = () => {
    if (previewMode || !activePost || !reqText.trim()) return;
    setSendingComment(true);

    // Create structured comment
    onAddComment(activePost.id, {
      author: reviewerName || "Client",
      text: reqText.trim(),
      isInternalOnly: false,
      timestamp: new Date().toISOString(),
      changeType: reqChangeType,
      priority: reqPriority,
      ...(reqSlideIndex !== "" ? { slideIndex: Number(reqSlideIndex) } : {})
    });

    // Update status
    if (activePost.clientStatus !== "Changes Requested") {
      onUpdatePost({ ...activePost, clientStatus: "Changes Requested", internalStatus: "Changes Requested" });
      success("Changes requested & notified agency");
    } else {
      success("Revision notes added");
    }

    // Reset forms
    setRequestModalOpen(false);
    setReqText("");
    setReqChangeType("Content");
    setReqPriority("medium");
    setReqSlideIndex("");
    setSendingComment(false);
  };

  // Swipe to navigate between posts in modal
  const onModalTouchStart = (e: React.TouchEvent) => { modalTouchX.current = e.touches[0].clientX; };
  const onModalTouchEnd = (e: React.TouchEvent) => {
    if (modalTouchX.current === null || activePostId === null) return;
    const diff = e.changedTouches[0].clientX - modalTouchX.current;
    if (diff > 50 && activePostIdx > 0) {
      setActivePostId(sortedPosts[activePostIdx - 1].id);
      modalTouchX.current = null;
    } else if (diff < -50 && activePostIdx < sortedPosts.length - 1) {
      setActivePostId(sortedPosts[activePostIdx + 1].id);
      modalTouchX.current = null;
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      data-testid="client-review-room"
      data-client-theme={clientTheme}
      data-preview-mode={previewMode ? "true" : undefined}
          className="rr-client min-h-screen bg-white font-sans text-zinc-950 antialiased selection:bg-zinc-950/10"
    >

      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-lg">
        {previewMode && (
          <div className="bg-blue-600 px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white">
            Client view preview · Client decisions are disabled
          </div>
        )}
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} onError={(e) => { e.currentTarget.src = fallbackSvg; }} alt={`${displayName} logo`} className="h-8 w-8 rounded-full border border-zinc-200 object-cover" />
            ) : (
              <div className="rr-client-brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
                {displayName.charAt(0)}
              </div>
            )}
            <span className="max-w-[42vw] truncate text-sm font-semibold text-zinc-950 sm:max-w-none">{displayName}</span>
            <span className="hidden text-xs text-zinc-500 sm:block">
              {shareSetMode ? "Shared set" : singlePostShareMode ? "Shared post" : "Content review"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div ref={summaryRef} className="relative flex shrink-0 items-center gap-2">
              <button
                onClick={() => setSummaryOpen((o) => !o)}
                className="group flex items-center gap-3"
                aria-label="Review summary"
                aria-expanded={summaryOpen}
                aria-controls="client-review-summary"
              >
                <div className="hidden flex-col items-end sm:flex">
                  <span className="whitespace-nowrap text-xs font-medium text-zinc-500 transition-colors group-hover:text-zinc-950">
                    {reviewed}/{visiblePosts.length} reviewed
                  </span>
                  <div className="rr-client-progress-track mt-1 h-1.5 w-24 overflow-hidden rounded-full">
                    <div className="h-full rounded-full bg-zinc-950 transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:hidden">
                  <div className="rr-client-progress-track h-1.5 w-16 overflow-hidden rounded-full">
                    <div className="h-full rounded-full bg-zinc-950 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-xs font-medium text-zinc-500">{progress}%</span>
                </div>
              </button>

              <AnimatePresence>
                {summaryOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    id="client-review-summary"
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
                  >
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Review Summary</h3>
                    {[
                      ["Needs Your Review", needsReview, "text-zinc-600", "bg-zinc-100"],
                      ["Approved", approved, "text-emerald-700 font-bold", "bg-emerald-50"],
                      ["Changes Requested", changes, "text-amber-700 font-bold", "bg-amber-50"],
                    ].map(([label, val, cls, bg]) => (
                      <div key={label as string} className={`mb-1 flex items-center justify-between rounded-lg px-3 py-2 ${bg}`}>
                        <span className="text-xs text-zinc-600">{label}</span>
                        <span className={`text-sm ${cls}`}>{val}</span>
                      </div>
                    ))}
                    <div className="mt-3 border-t border-zinc-100 pt-3 text-center">
                      <span className="text-xs font-semibold text-zinc-500">{progress}% reviewed</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <ClientThemeToggle theme={clientTheme} onToggle={toggleClientTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
        <section className="border-b border-zinc-200 py-8 sm:py-12">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-10">
            <div className="shrink-0">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 p-1 ring-4 ring-zinc-100 sm:h-36 sm:w-36">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={displayName}
                    className="h-full w-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <OsirisLogo size={120} />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h1 className="text-xl font-normal text-zinc-950 sm:text-2xl">{displayName}</h1>
              <div className="mb-5 mt-5 flex items-center justify-center gap-6 text-sm sm:justify-start sm:gap-10">
                <span><strong className="font-semibold text-zinc-950">{visiblePosts.length}</strong> <span className="text-zinc-600">posts</span></span>
                <span><strong className="font-semibold text-zinc-950">{approved}</strong> <span className="text-zinc-600">approved</span></span>
                <span><strong className="font-semibold text-zinc-950">{changes}</strong> <span className="text-zinc-600">changes</span></span>
              </div>
              <div className="mx-auto max-w-xl space-y-2 text-sm leading-6 text-zinc-700 sm:mx-0">
                <p>{bio || "Content review portal · Powered by OSIRIS Review Room"}</p>
                {reviewerName && (
                  <p className="text-xs font-medium text-zinc-500">Review shared with {reviewerName}</p>
                )}
                {needsReview > 0 && (
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {needsReview} post{needsReview > 1 ? "s" : ""} waiting for your review
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <div role="tablist" aria-label="Profile views" className="flex border-b border-zinc-200">
          {[
            { id: "grid" as const, label: "Posts", Icon: Grid3X3 },
            { id: "schedule" as const, label: "Scheduled", Icon: CalendarDays },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-selected={activeTab === id}
              role="tab"
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 border-t-2 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${activeTab === id
                ? "border-zinc-950 text-zinc-950"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {activeTab === "grid" && sortedPosts.length > 0 && !previewMode && (
          <div className="flex justify-end py-4">
            <button
              type="button"
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                if (isSelectMode) setSelectedIds(new Set());
              }}
              aria-label={isSelectMode ? "Cancel post selection" : "Select posts for approval"}
              aria-pressed={isSelectMode}
              title={isSelectMode ? "Cancel post selection" : "Choose posts for bulk approval"}
              className={`min-h-11 rounded-md border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${isSelectMode ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"}`}
            >
              {isSelectMode ? "Cancel" : "Select"}
            </button>
          </div>
        )}

        {activeTab === "grid" && (
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {pagedPosts.map((post: any, i: number) => (
              <GridTile
                key={post.id}
                post={post}
                index={i}
                onClick={() => setActivePostId(post.id)}
                isSelectMode={isSelectMode}
                isSelected={selectedIds.has(post.id)}
                onToggleSelect={() => toggleSelect(post.id)}
              />
            ))}
            {sortedPosts.length === 0 && (
              <div className="col-span-3 flex flex-col items-center justify-center py-24 text-zinc-400">
                <ImageOff className="mb-4 h-12 w-12 opacity-25" />
                <p className="font-medium">No posts yet</p>
                <p className="mt-1 text-sm text-zinc-400">Your review package will appear here</p>
              </div>
            )}
          </div>
        )}
        {activeTab === "grid" && sortedPosts.length > pagedPosts.length && (
          <div className="py-4">
            <button type="button" onClick={() => setVisibleCount((n) => n + 24)} className="w-full rounded-md border border-zinc-200 py-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-950">
              Show more ({sortedPosts.length - pagedPosts.length})
            </button>
          </div>
        )}

        <AnimatePresence>
          {!previewMode && isSelectMode && selectedIds.size > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="rr-client-action-bar fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 shadow-2xl sm:gap-6 sm:px-6 sm:py-4"
            >
              <div className="flex items-center gap-2 pr-2 sm:pr-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
                  {selectedIds.size}
                </div>
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:block">Selected</span>
              </div>
              <button
                onClick={handleBulkApprove}
                className="rr-client-contrast-action flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                <CheckCheck className="h-4 w-4" /> Approve
              </button>
              <button type="button" onClick={() => { setIsSelectMode(false); setSelectedIds(new Set()); }} aria-label="Cancel post selection" className="p-2 text-zinc-500 transition-colors hover:text-zinc-950">
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === "schedule" && (
          <div className="space-y-2 pt-5">
            {schedulePosts.length === 0 && (
              <div className="py-16 text-center text-zinc-400">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">No posts scheduled</p>
              </div>
            )}
            {pagedSchedulePosts.map((post: any, realIdx: number) => (
              <ScheduleRow key={post.id} post={post} index={realIdx} onClick={() => setActivePostId(post.id)} />
            ))}
            {schedulePosts.length > pagedSchedulePosts.length && (
              <button type="button" onClick={() => setVisibleCount((n) => n + 24)} className="mt-2 w-full rounded-md border border-zinc-200 py-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-950">
                Show more ({schedulePosts.length - pagedSchedulePosts.length})
              </button>
            )}
          </div>
        )}
      </main>

      {/* ── Post Viewer Modal ──────────────────────────────── */}
      <AnimatePresence>
        {activePost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={closeViewer}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              ref={viewerDialogRef}
              role="dialog"
              tabIndex={-1}
              aria-modal="true"
              aria-labelledby="client-post-viewer-title"
               className={`
                 bg-white w-full
                 rounded-t-3xl sm:rounded-2xl
                 shadow-2xl
                 max-h-[95vh] sm:max-h-[90vh]
                 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl
                 flex flex-col
                 overflow-hidden
                 ${previewMode ? "pb-20" : ""}
               `}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onModalTouchStart}
              onTouchEnd={onModalTouchEnd}
            >
              <h2 id="client-post-viewer-title" className="sr-only">Review post: {activePost.title}</h2>
              {/* Drag handle (mobile) */}
              <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-zinc-200 rounded-full" />
              </div>

              {/* Desktop: share (staff) + close */}
              <div className="hidden sm:flex absolute top-3 right-3 z-10 items-center gap-2">
                {postShareLinkEligible && (
                  <button
                    type="button"
                    onClick={() => void copySinglePostClientLink()}
                    className="w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-zinc-600 hover:text-blue-600 hover:bg-white shadow-sm transition-colors"
                    title="Copy client link for this post only"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  ref={desktopViewerCloseRef}
                  type="button"
                  onClick={closeViewer}
                  aria-label="Close post viewer"
                  className="w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-zinc-700 hover:text-zinc-900 hover:bg-white shadow-sm transition-colors"
                  title="Close post viewer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* ── Left: Media (true aspect ratio) ─────── */}
                <div className="rr-media-surface md:w-[55%] flex flex-col relative self-stretch">
                  <div className="rr-media-surface flex-1 flex items-center justify-center">
                     <MediaViewer key={activePost.id} urls={activePost.mediaUrls} format={activePost.format} thumbnailUrl={activePost.thumbnailUrl} />
                    </div>

                  {/* Post‑level prev/next (navigate between posts) */}
                  <div className="absolute bottom-3 left-3 flex gap-2">
                     <button
                       type="button"
                       aria-label="Previous post"
                       onClick={() => { if (activePostIdx > 0) setActivePostId(sortedPosts[activePostIdx - 1].id); }}
                       disabled={activePostIdx <= 0}
                      className="w-7 h-7 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-all text-xs font-bold"
                    >
                      ‹
                    </button>
                     <button
                       type="button"
                       aria-label="Next post"
                       onClick={() => { if (activePostIdx < sortedPosts.length - 1) setActivePostId(sortedPosts[activePostIdx + 1].id); }}
                       disabled={activePostIdx >= sortedPosts.length - 1}
                      className="w-7 h-7 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-all text-xs font-bold"
                    >
                      ›
                    </button>
                  </div>
                </div>

                {/* ── Right: Details panel ─────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  {/* Post header */}
                  <div className="p-4 border-b border-zinc-100 flex items-center gap-3 shrink-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={`${displayName} logo`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <OsirisLogo size={32} />
                      )}
                    </div>
                     <div className="flex-1 min-w-0">
                       <h3 className="font-semibold text-sm leading-tight truncate">{activePost.title}</h3>
                       <p className="text-xs text-zinc-400 truncate">
                         {displayName} · Post {activePostIdx + 1} of {sortedPosts.length} · {new Date(activePost.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {activePost.time}
                         {activePost.campaignCode ? ` · ${activePost.campaignCode}` : ""}
                         {activePost.dueDate ? ` · Due ${String(activePost.dueDate).slice(0, 10)}` : ""}
                       </p>
                     </div>
                    {postShareLinkEligible && (
                      <button
                        type="button"
                        onClick={() => void copySinglePostClientLink()}
                        className="sm:hidden p-2 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl shrink-0"
                        title="Copy client link for this post only"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      ref={mobileViewerCloseRef}
                      type="button"
                      onClick={closeViewer}
                      aria-label="Close post viewer"
                      className="sm:hidden w-11 h-11 flex items-center justify-center text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl shrink-0"
                      title="Close post viewer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                   {/* Scrollable content */}
                   <div className="flex-1 overflow-y-auto overscroll-contain">
                     {/* Caption */}
                    <div className="p-4 border-b border-zinc-100">
                      {activePost.script && activePost.script.length > 0 && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1.5 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Script
                          </p>
                          <p className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">
                            {activePost.script}
                          </p>
                        </div>
                      )}
                      <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                         <span className="font-semibold mr-2">{displayName}</span> {activePost.caption}
                      </p>
                      {activePost.hashtags.length > 0 && (
                        <p className="mt-2 text-sm text-blue-600 flex flex-wrap gap-1">
                          {activePost.hashtags.map((t: string) => <span key={t}>{t}</span>)}
                        </p>
                      )}

                      {/* Scheduled date/time pill */}
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          Scheduled {new Date(activePost.date).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })} at {activePost.time}
                        </span>
                      </div>
                    </div>

                    {/* Client feedback thread */}
                    {clientComments.length > 0 && (
                      <div className="p-4 space-y-3 border-b border-zinc-100">
                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Feedback</h4>
                        {clientComments.map((c: any) => (
                          <div key={c.id} className="flex gap-3 group">
                            <div className="w-7 h-7 rounded-full bg-zinc-200 shrink-0 flex items-center justify-center text-xs font-bold text-zinc-600">
                              {c.author.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-800 break-words whitespace-pre-wrap">
                                <span className="font-semibold mr-1.5">{c.author}</span>
                                {c.text}
                              </p>
                              {c.changeType && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                              <p className="text-[11px] text-zinc-400 mt-1">
                                {new Date(c.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-zinc-100 bg-zinc-50/80 space-y-3 shrink-0">
                    {previewMode && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-xs font-semibold text-blue-700">
                        Preview mode · Client decisions are disabled
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={previewMode || activePost.clientStatus === "Approved"}
                        aria-label={activePost.clientStatus === "Approved" ? "Approved" : "Approve post"}
                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${activePost.clientStatus === "Approved"
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                          : "bg-white border border-zinc-200 text-zinc-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700"
                          } ${previewMode ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {activePost.clientStatus === "Approved" ? (
                          <span className="flex items-center justify-center gap-1.5"><CheckCheck className="w-4 h-4" /> Approved</span>
                        ) : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestChanges}
                        disabled={previewMode}
                        aria-label="Request changes"
                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${activePost.clientStatus === "Changes Requested"
                          ? "bg-amber-400 text-white shadow-sm shadow-amber-200"
                          : "bg-white border border-zinc-200 text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                          } ${previewMode ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {activePost.clientStatus === "Changes Requested" ? "Changes requested" : "Request changes"}
                      </button>
                    </div>
                    {activePost.clientStatus === "Approved" && (
                      <button
                        type="button"
                        onClick={handleRevertApproval}
                        disabled={previewMode}
                        className="w-full py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 border border-zinc-200 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Undo approval
                      </button>
                    )}
                    {!previewMode && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <input
                            ref={commentRef}
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                            placeholder="Leave feedback…"
                            className="w-full bg-white border border-zinc-200 rounded-full pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow"
                          />
                          <button
                            type="button"
                            onClick={submitComment}
                            disabled={!commentText.trim() || sendingComment}
                            aria-label="Send feedback"
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 disabled:opacity-30 transition-colors"
                          >
                            {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                 </div>
               </div>

               {/* ── Structured Revision Modal (Overlay) ── */}
              <AnimatePresence>
                {requestModalOpen && activePost && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                  >
                     <motion.div
                       role="dialog"
                       aria-modal="true"
                       aria-labelledby="revision-dialog-title"
                       tabIndex={-1}
                       initial={{ scale: 0.95, y: 10, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.95, y: 10, opacity: 0 }}
                      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                         <h3 id="revision-dialog-title" className="font-bold text-zinc-900 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-blue-500" />
                          Request Revision
                        </h3>
                         <button type="button" onClick={() => setRequestModalOpen(false)} aria-label="Close revision request" className="text-zinc-400 hover:text-zinc-600">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="p-5 space-y-5 flex-1 overflow-y-auto">
                        {/* Change Type */}
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 block">Change Type</label>
                          <div className="grid grid-cols-3 gap-2">
                            {["Content", "Design", "Concept", "Other"].map(type => (
                              <button
                                key={type}
                                onClick={() => setReqChangeType(type)}
                                className={`py-2 px-3 text-sm font-semibold rounded-xl border transition-all truncate text-center ${reqChangeType === type ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                                  }`}
                              >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Priority */}
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 block">Issue Priority</label>
                          <div className="flex bg-zinc-100 p-1 rounded-xl">
                            {["low", "medium", "high"].map(p => (
                              <button
                                key={p}
                                onClick={() => setReqPriority(p as any)}
                                className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${reqPriority === p ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                                  }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Slide Index (if carousel) */}
                        {activePost.format === "carousel" && activePost.mediaUrls.length > 1 && (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 block">Slide Focus (Optional)</label>
                            <select
                              value={reqSlideIndex}
                              onChange={(e) => setReqSlideIndex(e.target.value ? Number(e.target.value) : "")}
                              className="w-full bg-white border border-zinc-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="">Whole Post</option>
                              {activePost.mediaUrls.map((_, i) => (
                                <option key={i} value={i}>Slide {i + 1}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Comment Text */}
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 block">Revision Notes</label>
                          <textarea
                            value={reqText}
                            onChange={(e) => setReqText(e.target.value)}
                            placeholder="What needs to be changed?"
                            rows={3}
                            className="w-full bg-white border border-zinc-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                          />
                        </div>
                      </div>

                      <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-2">
                        <button onClick={() => setRequestModalOpen(false)} className="px-4 py-2 font-semibold text-zinc-600 hover:bg-zinc-200 rounded-xl transition-all">
                          Cancel
                        </button>
                        <button
                          onClick={submitRevisionRequest}
                          disabled={!reqText.trim() || sendingComment}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-200 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Submit Revision
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
