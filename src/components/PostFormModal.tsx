import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2 } from "lucide-react";
import { Post, PostFormat, InternalStatus, ClientStatus } from "../types";
import MediaUploadZone from "./MediaUploadZone";
import { isVideo } from "../utils";

const INTERNAL_STATUSES: InternalStatus[] = ["Concept", "Draft", "Internal QA", "Ready for Client", "Changes Requested", "Approved", "Scheduled", "Posted"];
const CLIENT_STATUSES: ClientStatus[] = ["Not Ready for Client", "Needs Your Review", "Approved", "Changes Requested"];
const FORMATS: PostFormat[] = ["image", "carousel", "reel"];
const PILLARS = ["Product Launch", "Culture", "Thought Leadership", "Education", "UGC", "Promotional", "Community", "Event", "General"];

type FormState = {
    title: string;
    format: PostFormat;
    mediaUrls: string[];
    caption: string;
    hashtags: string[];
    date: string;
    time: string;
    clientStatus: ClientStatus;
    internalStatus: InternalStatus;
    assignee: string;
    campaignCode: string;
    contentPillar: string;
    customPillar: string;
    internalNotes: string;
    assetLineage: string;
    isBlocked: boolean;
    blockedReason: string;
    thumbnailUrl: string;
};

interface Props {
    post?: Post | null;
    onSubmit: (data: Partial<Post> & { id?: string }) => void;
    onClose: () => void;
}

export default function PostFormModal({ post, onSubmit, onClose }: Props) {
    const [form, setForm] = useState<FormState>({
        title: post?.title ?? "",
        format: post?.format ?? "image",
        mediaUrls: post?.mediaUrls ?? [],
        caption: post?.caption ?? "",
        hashtags: post?.hashtags ?? [],
        date: post?.date ?? new Date().toISOString().split("T")[0],
        time: post?.time ?? "12:00 PM",
        clientStatus: post?.clientStatus ?? "Not Ready for Client",
        internalStatus: post?.internalStatus ?? "Draft",
        assignee: post?.assignee ?? "",
        campaignCode: post?.campaignCode ?? "",
        // If the existing contentPillar is not in the preset list, treat it as custom
        contentPillar: PILLARS.includes(post?.contentPillar ?? "") || !post?.contentPillar ? (post?.contentPillar ?? "") : "__custom",
        customPillar: PILLARS.includes(post?.contentPillar ?? "") ? "" : (post?.contentPillar ?? ""),
        internalNotes: post?.internalNotes ?? "",
        assetLineage: post?.assetLineage ?? "",
        isBlocked: post?.isBlocked ?? false,
        blockedReason: post?.blockedReason ?? "",
        thumbnailUrl: post?.thumbnailUrl ?? "",
    });
    const [tagInput, setTagInput] = useState("");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const handleCaptureFrame = async () => {
        const video = videoRef.current;
        if (!video) return;

        setIsCapturing(true);
        try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas context error");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
            if (!blob) throw new Error("Blob error");

            const file = new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const { url } = await res.json();

            set("thumbnailUrl", url);
        } catch (err) {
            console.error("Frame capture error:", err);
        } finally {
            setIsCapturing(false);
        }
    };

    const set = (key: keyof FormState, value: any) => setForm((f) => ({ ...f, [key]: value }));
    const handleInternalStatusChange = (value: InternalStatus) => {
        setForm((f) => {
            let clientStatus = f.clientStatus;
            if (value === "Ready for Client") clientStatus = "Needs Your Review";
            else if (value === "Concept" || value === "Draft" || value === "Internal QA") {
                clientStatus = "Not Ready for Client";
            }
            return { ...f, internalStatus: value, clientStatus };
        });
    };

    const addTag = () => {
        const raw = tagInput.trim();
        if (!raw) return;
        const tag = raw.startsWith("#") ? raw : `#${raw} `;
        if (!form.hashtags.includes(tag)) set("hashtags", [...form.hashtags, tag]);
        setTagInput("");
    };

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.title.trim()) e.title = "Title is required";
        if (form.mediaUrls.length === 0) e.media = "At least one media item required";
        // Reel format requires video media — images won't display as video
        if (form.format === "reel") {
            const nonVideoUrls = form.mediaUrls.filter((url) => !isVideo(url));
            if (nonVideoUrls.length > 0) {
                e.media =
                    "Reel format requires video files (.mp4, .mov, .webm, .avi). Remove image files or switch to Image/Carousel format.";
            }
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            // Resolve the actual content pillar value (custom text or preset)
            const resolvedPillar = form.contentPillar === "__custom" ? form.customPillar.trim() : form.contentPillar;
            // Explicitly include status fields; preserve thumbnail when form has empty (don't clear existing)
            const payload = {
                ...form,
                contentPillar: resolvedPillar,
                id: post?.id,
                clientStatus: form.internalStatus === "Ready for Client" ? "Needs Your Review" : form.clientStatus,
                internalStatus: form.internalStatus,
                thumbnailUrl: form.thumbnailUrl || post?.thumbnailUrl || undefined,
            };
            onSubmit(payload);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const inputClass = "w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow";
    const labelClass = "block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.96, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="bg-white w-full md:max-w-5xl h-full md:h-auto md:max-h-[94vh] md:rounded-2xl shadow-2xl flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
                        <div>
                            <h2 className="text-sm sm:text-base font-bold text-zinc-900">{post ? "Edit Post" : "Create New Post"}</h2>
                            <p className="text-xs text-zinc-400 mt-0.5 hidden sm:block">{post ? `Editing: ${post.title} ` : "Fill in the details below to publish a new post"}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body — stacked on mobile, side-by-side on desktop */}
                    <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
                        {/* Media section */}
                        <div className="w-full md:w-[38%] md:border-r border-b md:border-b-0 border-zinc-200 overflow-y-auto p-4 sm:p-5 space-y-4 bg-zinc-50/50 max-h-[40vh] md:max-h-none">
                            <div>
                                <label className={labelClass}>Media Files</label>
                                {errors.media && <p className="text-xs text-red-600 mb-2">{errors.media}</p>}
                                <MediaUploadZone
                                    mediaUrls={form.mediaUrls}
                                    onMediaChange={(u) => set("mediaUrls", u)}
                                    thumbnailUrl={form.thumbnailUrl}
                                    onThumbnailChange={(u) => set("thumbnailUrl", u)}
                                    format={form.format}
                                />
                            </div>

                            <div>
                                <label className={labelClass}>Post Format</label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {FORMATS.map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => {
                                                set("format", f);
                                                if (f === "reel") {
                                                    const hasImages = form.mediaUrls.some((url) => !isVideo(url));
                                                    if (hasImages && form.mediaUrls.length > 0) {
                                                        setErrors((prev) => ({
                                                            ...prev,
                                                            media:
                                                                "Reel requires video files. Current media includes images — replace with video or switch back to Image/Carousel.",
                                                        }));
                                                    } else {
                                                        setErrors((prev) => {
                                                            const next = { ...prev };
                                                            delete next.media;
                                                            return next;
                                                        });
                                                    }
                                                } else {
                                                    setErrors((prev) => {
                                                        const next = { ...prev };
                                                        delete next.media;
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className={`py-2 rounded-lg border text-xs font-semibold capitalize transition-colors ${form.format === f ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                                                }`}
                                        >{f}</button>
                                    ))}
                                </div>
                                {form.format === "reel" && form.mediaUrls.some((u) => !isVideo(u)) && (
                                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        Reel format needs video. Replace image files with .mp4, .mov, or .webm.
                                    </p>
                                )}
                            </div>



                            {/* Caption preview */}
                            {form.caption && (
                                <div className="bg-white border border-zinc-200 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Caption Preview</p>
                                    <p className="text-xs text-zinc-700 whitespace-pre-wrap break-words leading-relaxed line-clamp-6">{form.caption}</p>
                                    {form.hashtags.length > 0 && <p className="text-xs text-blue-600 break-words mt-1.5">{form.hashtags.join(" ")}</p>}
                                </div>
                            )}
                        </div>

                        {/* Right: Fields */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                            {/* Title */}
                            <div>
                                <label className={labelClass}>Post Title <span className="text-red-500">*</span></label>
                                {errors.title && <p className="text-xs text-red-600 mb-1">{errors.title}</p>}
                                <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)}
                                    placeholder="e.g. Spring Collection Launch"
                                    className={`${inputClass} ${errors.title ? "border-red-300 focus:ring-red-500" : ""} `} />
                            </div>

                            {/* Date & Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Publish Date</label>
                                    <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Time</label>
                                    <input type="text" value={form.time} onChange={(e) => set("time", e.target.value)}
                                        placeholder="09:00 AM" className={inputClass} />
                                </div>
                            </div>

                            {/* Statuses */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Internal Status</label>
                                    <select value={form.internalStatus} onChange={(e) => handleInternalStatusChange(e.target.value as InternalStatus)}
                                        className={`${inputClass} bg-white cursor-pointer`}>
                                        {INTERNAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Client Status</label>
                                    <select value={form.clientStatus} onChange={(e) => set("clientStatus", e.target.value as ClientStatus)}
                                        className={`${inputClass} bg-white cursor-pointer`}>
                                        {CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Assignee / Campaign / Pillar */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className={labelClass}>Assignee</label>
                                    <input type="text" value={form.assignee} onChange={(e) => set("assignee", e.target.value)}
                                        placeholder="Sarah J." className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Campaign Code</label>
                                    <input type="text" value={form.campaignCode} onChange={(e) => set("campaignCode", e.target.value)}
                                        placeholder="SPR26-LCH" className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Content Pillar</label>
                                    <select
                                        value={form.contentPillar}
                                        onChange={(e) => set("contentPillar", e.target.value)}
                                        className={`${inputClass} bg-white cursor-pointer`}
                                    >
                                        <option value="">Select…</option>
                                        {PILLARS.map((p) => <option key={p}>{p}</option>)}
                                        <option value="__custom">Custom…</option>
                                    </select>
                                    {form.contentPillar === "__custom" && (
                                        <input
                                            autoFocus
                                            type="text"
                                            value={form.customPillar}
                                            onChange={(e) => set("customPillar", e.target.value)}
                                            placeholder="e.g. Partnerships"
                                            className={`${inputClass} mt-2`}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Caption */}
                            <div>
                                <label className={labelClass}>Caption</label>
                                <textarea value={form.caption} onChange={(e) => set("caption", e.target.value)}
                                    placeholder="Write the post caption here…" rows={4}
                                    className={`${inputClass} resize-none`} />
                                <p className={`text-[11px] mt-1 text-right font-medium ${form.caption.length > 2200 ? "text-red-500" :
                                    form.caption.length > 1800 ? "text-amber-500" : "text-zinc-400"
                                    }`}>{form.caption.length} / 2200 chars</p>
                            </div>

                            {/* Hashtags */}
                            <div>
                                <label className={labelClass}>Hashtags</label>
                                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                                    {form.hashtags.map((tag) => (
                                        <span key={tag} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-0.5 text-xs font-medium">
                                            {tag}
                                            <button onClick={() => set("hashtags", form.hashtags.filter((t) => t !== tag))} className="hover:text-blue-900">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addTag(); } }}
                                        placeholder="Type a hashtag and press Enter" className={`${inputClass} flex-1`} />
                                    <button onClick={addTag} className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm font-semibold text-zinc-700 transition-colors whitespace-nowrap">+ Add</button>
                                </div>
                            </div>

                            {/* Internal Notes */}
                            <div>
                                <label className={labelClass}>Internal Notes</label>
                                <textarea value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)}
                                    placeholder="Agency-only notes about this post…" rows={3}
                                    className={`${inputClass} resize-none bg-amber-50/60 border-amber-200 focus:ring-amber-500`} />
                            </div>

                            {/* Asset Lineage */}
                            <div>
                                <label className={labelClass}>Asset Lineage</label>
                                <input type="text" value={form.assetLineage} onChange={(e) => set("assetLineage", e.target.value)}
                                    placeholder="e.g. Final color grade from v3 folder. Do not use v2." className={inputClass} />
                            </div>

                            {/* Blocked */}
                            <div className={`rounded-xl border p-4 transition-colors ${form.isBlocked ? "bg-red-50 border-red-200" : "bg-zinc-50 border-zinc-200"}`}>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={form.isBlocked} onChange={(e) => set("isBlocked", e.target.checked)}
                                        className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer" />
                                    <span className={`text-sm font-semibold ${form.isBlocked ? "text-red-700" : "text-zinc-700"}`}>Mark as Blocked</span>
                                </label>
                                {form.isBlocked && (
                                    <textarea value={form.blockedReason} onChange={(e) => set("blockedReason", e.target.value)}
                                        placeholder="Describe why this post is blocked…" rows={2}
                                        className="mt-3 w-full border border-red-200 bg-white rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between shrink-0 bg-white/80 backdrop-blur-md sticky bottom-0 z-10">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 shadow-lg shadow-zinc-900/10 active:scale-95"
                        >
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {post ? "Save Changes" : "Create Post"}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
