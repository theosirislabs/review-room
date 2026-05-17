import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Post } from "../types";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft, ChevronRight, Copy, Grid3X3,
  Play, Send, X, CalendarDays, Clock, CheckCheck,
  AlertCircle, Loader2, ImageOff, MessageSquare, Share2, FileText,
  Sun, Moon
} from "lucide-react";
import { useToast } from "./Toast";
import { createAndCopyClientPostShare } from "../clientPostShare";

interface Props {
  posts: Post[];
  tenantId: string;
  brandName?: string;
  logoUrl?: string;
  bio?: string;
  /** When true (single-post magic link), show the post even if client status is "Not Ready for Client". */
  singlePostShareMode?: boolean;
  /** Agency / internal staff: show control to copy a single-post review link from the client UI. */
  postShareLinkEligible?: boolean;
  adminToken?: string;
  onUpdatePost: (post: Post) => void;
  onAddComment: (postId: string, comment: any) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
}

import { isVideo, fallbackSvg, parseDateSafe, isPostVisibleToClient } from "../utils";
import { createAndCopyClientPostShare } from "../clientPostShare";
import OsirisLogo from "./OsirisLogo";
import { useTheme } from "../theme";

function PostStatusBadge({ status }: { status: Post["clientStatus"] }) {
  const cfg = {
    "Not Ready for Client": "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
    "Ready to Schedule": "bg-purple-500/15 text-purple-300 border-purple-500/25",
    "Approved": "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    "Changes Requested": "bg-amber-500/15 text-amber-300 border-amber-500/25",
    "Needs Your Review": "bg-white/10 text-white/70 border-white/15",
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
    <div className="w-full flex items-center justify-center bg-zinc-900 py-24">
      <p className="text-zinc-600 text-sm">No media</p>
    </div>
  );

  return (
    <div
      className="relative select-none flex items-center justify-center overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Global skeleton for viewer */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50">
          <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
        </div>
      )}

      {isVideo(url) || format === "reel" ? (
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
        <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {idx < urls.length - 1 && (
        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
      {urls.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/40"}`} />
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

  const handleTileClick = (e: React.MouseEvent) => {
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
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`relative block w-full aspect-[4/5] group bg-zinc-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl border-2 transition-all ${isSelected ? "border-indigo-500 scale-[0.98] ring-4 ring-indigo-500/20" : "border-transparent"}`}
      aria-label={`View post: ${post.title}`}
    >
      {/* Selection Checkbox */}
      {isSelectMode && (
        <div className={`absolute top-3 left-3 z-30 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "bg-indigo-500 border-indigo-500 shadow-lg" : "bg-black/20 border-white/50 backdrop-blur-md"}`}>
          {isSelected && <CheckCheck className="w-4 h-4 text-white" />}
        </div>
      )}

      {/* Skeleton */}
      {!loaded && <div className="absolute inset-0 skeleton animate-pulse z-10" />}
      {/* Media */}
      {post.thumbnailUrl || post.mediaUrls[0] ? (
        post.thumbnailUrl || isVideo(post.mediaUrls[0]) || post.format === "reel" ? (
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
                muted loop playsInline 
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
          {post.format === "carousel" ? <Copy className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
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
      className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white border border-zinc-100 rounded-2xl hover:border-zinc-300 transition-colors text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {/* Thumbnail */}
      <div className="w-14 h-[70px] sm:w-16 sm:h-20 shrink-0 rounded-xl overflow-hidden bg-zinc-200 relative">
        {!loaded && <div className="absolute inset-0 skeleton animate-pulse z-10" />}
        {post.thumbnailUrl || post.mediaUrls[0] ? (
          post.thumbnailUrl ? (
            <img src={post.thumbnailUrl} onLoad={() => setLoaded(true)} onError={(e) => { e.currentTarget.src = fallbackSvg; setLoaded(true); }} alt="" className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} />
          ) : isVideo(post.mediaUrls[0]) || post.format === "reel" ? (
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
export default function ClientView({ posts, tenantId, brandName, logoUrl, bio, singlePostShareMode = false, postShareLinkEligible = false, adminToken = "", onUpdatePost, onAddComment, onDeleteComment }: Props) {
  const { theme, toggleTheme } = useTheme();
  const visiblePosts = useMemo(
    () => (singlePostShareMode ? posts : posts.filter((p) => isPostVisibleToClient(p.clientStatus))),
    [posts, singlePostShareMode]
  );

  const [activeTab, setActiveTab] = useState<"grid" | "schedule">("grid");
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [commentText, setCommentText] = useState("");
  const { success, error: toastError } = useToast();

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

  // On mount, check all posts: if post has client comments and isn't approved, mark as Changes Requested
  useEffect(() => {
    let changed = false;
    const updated = posts.map(p => {
      const hasFeedback = p.clientComments && p.clientComments.some(c => !c.isInternalOnly);
      if (hasFeedback && p.clientStatus !== "Changes Requested" && p.clientStatus !== "Approved") {
        changed = true;
        return { ...p, clientStatus: "Changes Requested", internalStatus: "Changes Requested" };
      }
      return p;
    });
    if (changed) {
      // Update each post that needs it
      updated.forEach((p, i) => {
        if (p.clientStatus === "Changes Requested" && posts[i]?.clientStatus !== "Changes Requested") {
          onUpdatePost(p);
        }
      });
    }
  }, []);
  const commentRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const modalTouchX = useRef<number | null>(null);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [reqChangeType, setReqChangeType] = useState("Content");
  const [reqPriority, setReqPriority] = useState<"low" | "medium" | "high">("medium");
  const [reqSlideIndex, setReqSlideIndex] = useState<number | "">("");
  const [reqText, setReqText] = useState("");

  const sortedPosts = useMemo(() => {
    return [...visiblePosts].sort((a, b) => parseDateSafe(b.date, b.time) - parseDateSafe(a.date, a.time));
  }, [visiblePosts]);

  const activePost = useMemo(() => activePostId ? sortedPosts.find((p: any) => p.id === activePostId) ?? null : null, [activePostId, sortedPosts]);
  const activePostIdx = activePost ? sortedPosts.findIndex((p: any) => p.id === activePost.id) : -1;
  const clientComments = activePost?.clientComments.filter((c: any) => !c.isInternalOnly) ?? [];

  const approved = visiblePosts.filter((p: any) => p.clientStatus === "Approved").length;
  const changes = visiblePosts.filter((p: any) => p.clientStatus === "Changes Requested").length;
  const needsReview = visiblePosts.filter((p: any) => p.clientStatus === "Needs Your Review").length;
  const reviewed = approved + changes;
  const progress = visiblePosts.length > 0 ? Math.round((reviewed / visiblePosts.length) * 100) : 0;

  const displayName = brandName || tenantId.charAt(0).toUpperCase() + tenantId.slice(1);

  const copySinglePostClientLink = useCallback(async () => {
    if (!activePost) return;
    const r = await createAndCopyClientPostShare({
      tenantId,
      postId: activePost.id,
      adminToken: adminToken || undefined,
    });
    if (r.ok) success("Single-post client link copied — send this URL to your client.");
    else toastError(r.error);
  }, [activePost, tenantId, adminToken, success, toastError]);

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
      if (e.key === "Escape") setActivePostId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activePostId, activePostIdx, sortedPosts]);

  const submitComment = async () => {
    if (!activePost || !commentText.trim()) return;
    setSendingComment(true);
    onAddComment(activePost.id, {
      author: "Client",
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
    if (!activePost) return;
    const wasAlready = activePost.clientStatus === "Approved";
    onUpdatePost({ ...activePost, clientStatus: "Approved", internalStatus: "Approved" });
    if (!wasAlready) success("Post approved ✓");
  };

  const handleDisapprove = () => {
    if (!activePost) return;
    onUpdatePost({ ...activePost, clientStatus: "Changes Requested", internalStatus: "Changes Requested" });
    onAddComment(activePost.id, {
      author: "Client",
      text: "Disapproved — needs revision",
      isInternalOnly: false,
      timestamp: new Date().toISOString(),
      changeType: "Other",
      priority: "high",
    });
    success("Post disapproved — agency notified");
  };
  const handleRevertApproval = () => {
    if (!activePost) return;
    onUpdatePost({ ...activePost, clientStatus: "Needs Your Review", internalStatus: "Ready for Client" });
    success("Status reverted to Needs Your Review");
  };
  const handleRequestChanges = () => {
    setRequestModalOpen(true);
  };

  const submitRevisionRequest = () => {
    if (!activePost || !reqText.trim()) return;
    setSendingComment(true);

    // Create structured comment
    onAddComment(activePost.id, {
      author: "Client",
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
    <div className="min-h-screen bg-[#fafafa] font-sans text-zinc-900 antialiased">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-zinc-200 relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-signature" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} onError={(e) => { e.currentTarget.src = fallbackSvg; }} alt={`${displayName} logo`} className="w-7 h-7 rounded-full object-cover border border-zinc-200" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                {displayName.charAt(0)}
              </div>
            )}
            <span className="font-semibold text-sm text-zinc-900 truncate max-w-[120px] sm:max-w-none">{displayName}</span>
            <span className="hidden sm:block text-zinc-300">·</span>
            <span className="hidden sm:block text-zinc-500 text-sm">{singlePostShareMode ? "Shared post" : "Review Package"}</span>
          </div>

          {/* Progress / summary */}
          <div ref={summaryRef} className="relative flex-shrink-0 flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setSummaryOpen((o) => !o)}
              className="flex items-center gap-3 group"
              aria-label="Review summary"
            >
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 transition-colors whitespace-nowrap">
                  {reviewed}/{visiblePosts.length} reviewed
                </span>
                <div className="w-24 h-1.5 bg-zinc-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-signature rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="sm:hidden flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-signature rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-zinc-500">{progress}%</span>
              </div>
            </button>

            <AnimatePresence>
              {summaryOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-zinc-100 p-4 z-50"
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Review Summary</h3>
                  {[
                    ["Needs Your Review", needsReview, "text-zinc-600", "bg-zinc-100"],
                    ["Approved", approved, "text-emerald-700 font-bold", "bg-emerald-50"],
                    ["Changes Requested", changes, "text-amber-700 font-bold", "bg-amber-50"],
                  ].map(([label, val, cls, bg]) => (
                    <div key={label as string} className={`flex justify-between items-center px-3 py-2 rounded-lg mb-1 ${bg}`}>
                      <span className="text-xs text-zinc-600">{label}</span>
                      <span className={`text-sm ${cls}`}>{val}</span>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-zinc-100 text-center">
                    <span className="text-xs font-semibold text-zinc-500">{progress}% complete</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-0 sm:px-4 md:px-6 pb-24">

        {/* ── Profile ─────────────────────────────────────── */}
        <div className="px-4 sm:px-0 pt-8 sm:pt-12 pb-8 sm:pb-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-10">
            {/* Avatar */}
            <div className="shrink-0">
              <div className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-full overflow-hidden border-2 border-zinc-200 ring-1 ring-zinc-100 shadow-sm bg-zinc-100 flex items-center justify-center">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <OsirisLogo size={120} />
                )}
              </div>
            </div>

            {/* Meta */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 mb-4">
                <h2 className="text-xl font-medium leading-tight">{tenantId}</h2>
                <div className="flex justify-center sm:justify-start gap-2">
                  <button className="px-5 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm font-medium transition-colors">Following</button>
                  <button className="px-5 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm font-medium transition-colors">Message</button>
                </div>
              </div>

              {/* Stats */}
              <div className="flex justify-center sm:justify-start gap-6 sm:gap-8 mb-4 text-sm">
                <span><span className="font-bold text-zinc-900">{visiblePosts.length}</span> <span className="text-zinc-600">posts</span></span>
                <span><span className="font-bold text-emerald-600">{approved}</span> <span className="text-zinc-600">approved</span></span>
                <span><span className="font-bold text-amber-600">{changes}</span> <span className="text-zinc-600">changes</span></span>
              </div>

              {/* Bio */}
              <div className="text-sm text-zinc-700 max-w-sm mx-auto sm:mx-0">
                <p className="font-semibold">{displayName}</p>
                <p className="text-zinc-500 mt-0.5">{bio || "Content review portal · Powered by OSIRIS Review Room"}</p>
                {needsReview > 0 && (
                  <p className="mt-2 text-amber-600 font-medium text-xs flex items-center justify-center sm:justify-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {needsReview} post{needsReview > 1 ? "s" : ""} waiting for your review
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────── */}
        <div className="flex border-t border-zinc-200 mb-0.5">
          {[
            { id: "grid" as const, label: "Posts", Icon: Grid3X3 },
            { id: "schedule" as const, label: "Schedule", Icon: CalendarDays },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 text-xs font-bold tracking-widest uppercase transition-colors ${activeTab === id
                ? "text-zinc-900 border-t-2 border-zinc-900 -mt-px"
                : "text-zinc-400 hover:text-zinc-600"
                }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Selection Toggle */}
        {activeTab === "grid" && sortedPosts.length > 0 && (
          <div className="px-4 py-3 border-b border-zinc-100 flex justify-end">
             <button 
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  if (isSelectMode) setSelectedIds(new Set());
                }}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${isSelectMode ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-400"}`}
              >
                {isSelectMode ? "Cancel Selection" : "Select to Approve"}
              </button>
          </div>
        )}

        {/* ── Grid ────────────────────────────────────────── */}
        {activeTab === "grid" && (
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
            {sortedPosts.map((post: any, i: number) => (
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
                <ImageOff className="w-12 h-12 mb-4 opacity-25" />
                <p className="font-medium">No posts yet</p>
                <p className="text-sm mt-1 text-zinc-300">Your review package will appear here</p>
              </div>
            )}
          </div>
        )}

        {/* Bulk Approve Bar */}
        <AnimatePresence>
          {isSelectMode && selectedIds.size > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-6 border border-white/10"
            >
              <div className="flex items-center gap-3 pr-6 border-r border-white/10">
                <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center font-bold text-xs">
                  {selectedIds.size}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Selected</span>
              </div>
              <button 
                onClick={handleBulkApprove}
                className="bg-white text-zinc-900 px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-100 transition-all active:scale-95 shadow-lg flex items-center gap-2"
              >
                <CheckCheck className="w-4 h-4" /> Approve All Selected
              </button>
              <button onClick={() => { setIsSelectMode(false); setSelectedIds(new Set()); }} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Schedule ────────────────────────────────────── */}
        {activeTab === "schedule" && (
          <div className="px-4 sm:px-0 pt-4 space-y-2">
            {sortedPosts.length === 0 && (
              <div className="text-center py-16 text-zinc-400">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No posts scheduled</p>
              </div>
            )}
            {sortedPosts.map((post: any, realIdx: number) => {
              return <ScheduleRow key={post.id} post={post} index={realIdx} onClick={() => setActivePostId(post.id)} />;
            })}
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
            onClick={() => setActivePostId(null)}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="
                bg-white w-full
                rounded-t-3xl sm:rounded-2xl
                shadow-2xl
                max-h-[95vh] sm:max-h-[90vh]
                sm:max-w-2xl md:max-w-3xl lg:max-w-4xl
                flex flex-col
                overflow-hidden
              "
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onModalTouchStart}
              onTouchEnd={onModalTouchEnd}
            >
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
                    className="w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-zinc-600 hover:text-indigo-600 hover:bg-white shadow-sm transition-colors"
                    title="Copy client link for this post only"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActivePostId(null)}
                  className="w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-zinc-700 hover:text-zinc-900 hover:bg-white shadow-sm transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* ── Left: Media (true aspect ratio) ─────── */}
                <div className="md:w-[55%] bg-zinc-900 flex flex-col relative self-stretch">
                  <div className="flex-1 flex items-center justify-center bg-zinc-900">
                    <MediaViewer urls={activePost.mediaUrls} format={activePost.format} thumbnailUrl={activePost.thumbnailUrl} />
                    </div>

                  {/* Post‑level prev/next (navigate between posts) */}
                  <div className="absolute bottom-3 left-3 flex gap-2">
                    <button
                      onClick={() => { if (activePostIdx > 0) setActivePostId(sortedPosts[activePostIdx - 1].id); }}
                      disabled={activePostIdx <= 0}
                      className="w-7 h-7 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-all text-xs font-bold"
                    >
                      ‹
                    </button>
                    <button
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
                      <p className="font-semibold text-sm leading-tight truncate">{tenantId}</p>
                      <p className="text-xs text-zinc-400 truncate">
                        {new Date(activePost.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {activePost.time} · {activePost.format}
                      </p>
                    </div>
                    {postShareLinkEligible && (
                      <button
                        type="button"
                        onClick={() => void copySinglePostClientLink()}
                        className="sm:hidden p-2 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl shrink-0"
                        title="Copy client link for this post only"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                    )}
                    <button type="button" onClick={() => setActivePostId(null)} className="sm:hidden text-zinc-400 hover:text-zinc-700 p-1 shrink-0" title="Close">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    {/* Post navigation thumbnails */}
                    <div className="p-4 border-b border-zinc-100 flex gap-2 overflow-x-auto">
                      {sortedPosts.map((p: any) => (
                        <button key={p.id} onClick={() => setActivePostId(p.id)} className={`shrink-0 aspect-[4/5] w-16 rounded-lg overflow-hidden relative border-2 ${p.id === activePostId ? "border-signature" : "border-transparent"} transition-colors`}>
                          {p.thumbnailUrl ? (
                            <img
                              src={p.thumbnailUrl}
                              onError={(e) => { e.currentTarget.src = fallbackSvg; }}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : isVideo(p.mediaUrls[0]) || p.format === "reel" ? (
                            <video src={p.mediaUrls[0]} className="w-full h-full object-cover" />
                          ) : (
                            <img
                              src={p.mediaUrls[0]}
                              onError={(e) => { e.currentTarget.src = fallbackSvg; }}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          {p.id === activePostId && <div className="absolute inset-0 bg-black/20" />}
                        </button>
                      ))}
                    </div>

                    {/* Caption */}
                    <div className="p-4 border-b border-zinc-100">
                      <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
n                      {activePost.script && activePost.script.length > 0 && (
                      <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-1.5 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Script
                        </p>
                        <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">
                          {activePost.script}
                        </p>
                      </div>
                      )}
                        <span className="font-semibold mr-2">{tenantId}</span>
                        {activePost.caption}
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
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Your Feedback</h4>
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
                            <button
                              onClick={() => onDeleteComment(activePost.id, c.id)}
                              className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all self-start pt-1 shrink-0"
                              aria-label="Delete comment"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Action footer ──────────────────────── */}
                  <div className="p-4 border-t border-zinc-100 bg-zinc-50/80 space-y-3 shrink-0">
                    {/* Approve / Request Changes / Revert */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={handleApprove}
                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${activePost.clientStatus === "Approved"
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                          : "bg-white border border-zinc-200 text-zinc-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700"
                          }`}
                      >
                        {activePost.clientStatus === "Approved" ? (
                          <span className="flex items-center justify-center gap-1.5"><CheckCheck className="w-4 h-4" /> Approved</span>
                        ) : "Approve"}
                      </button>
                      <button
                        onClick={handleDisapprove}
                        className="py-2.5 rounded-xl text-sm font-semibold transition-all bg-white border border-zinc-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                      >
                        Disapprove
                      </button>
                      <button
                        onClick={handleRequestChanges}
                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${activePost.clientStatus === "Changes Requested"
                          ? "bg-amber-400 text-white shadow-sm shadow-amber-200"
                          : "bg-white border border-zinc-200 text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                          }`}
                      >
                        {activePost.clientStatus === "Changes Requested" ? "Changes Requested" : "Request Changes"}
                      </button>
                    </div>
                    {activePost.clientStatus === "Approved" && (
                      <button
                        onClick={handleRevertApproval}
                        className="w-full py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 border border-zinc-200 transition-all"
                      >
                        Revert to Needs Review (approved by mistake)
                      </button>
                    )}

                    {/* Comment input */}
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
                          onClick={submitComment}
                          disabled={!commentText.trim() || sendingComment}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 disabled:opacity-30 transition-colors"
                        >
                          {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
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
                      initial={{ scale: 0.95, y: 10, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.95, y: 10, opacity: 0 }}
                      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                        <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                          Request Revision
                        </h3>
                        <button onClick={() => setRequestModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
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
                                className={`py-2 px-3 text-sm font-semibold rounded-xl border transition-all truncate text-center ${reqChangeType === type ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
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
                              className="w-full bg-white border border-zinc-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
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
                            className="w-full bg-white border border-zinc-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
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
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-200 disabled:opacity-50 transition-all flex items-center gap-2"
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
