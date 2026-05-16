import { useCallback, useState, useRef } from "react";
import { Upload, X, Play, Loader2, AlertCircle, GripVertical, Camera, Image as ImageIcon, Zap, Link } from "lucide-react";
import { useToast } from "./Toast";

interface MediaUploadZoneProps {
    mediaUrls: string[];
    onMediaChange: (urls: string[]) => void;
    thumbnailUrl?: string;
    onThumbnailChange?: (url: string) => void;
    maxFiles?: number;
    format?: string;
}
import { isVideo } from "../utils";

const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB per chunk (well under Cloudflare 100MB limit)
/** Use chunked upload above this size so each request stays small (avoids proxy timeouts / dropped connections on one huge POST). */
const CHUNK_THRESHOLD = CHUNK_SIZE;
const CHUNK_TIMEOUT_MS = 300000; // 5 min per chunk

export default function MediaUploadZone({ mediaUrls, onMediaChange, thumbnailUrl, onThumbnailChange, maxFiles = 10, format = "image" }: MediaUploadZoneProps) {
    const { success, error: toastError } = useToast();
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState<string[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const dragSrcIdx = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

    const uploadChunked = useCallback(async (file: File, tempId: string): Promise<string | null> => {
        const uploadId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        const uploadChunkXhr = (chunkFile: File, chunkIndex: number): Promise<void> =>
            new Promise((resolve, reject) => {
                const formData = new FormData();
                formData.append("uploadId", uploadId);
                formData.append("chunkIndex", String(chunkIndex));
                formData.append("totalChunks", String(totalChunks));
                formData.append("file", chunkFile);
                const xhr = new XMLHttpRequest();
                const chunkStartPct = (chunkIndex / totalChunks) * 100;
                const chunkSpanPct = 100 / totalChunks;
                xhr.upload.addEventListener("progress", (e: ProgressEvent) => {
                    if (e.lengthComputable) {
                        const chunkPct = (e.loaded / e.total) * chunkSpanPct;
                        setUploadProgress((prev) => ({ ...prev, [tempId]: Math.round(chunkStartPct + chunkPct) }));
                    }
                });
                xhr.addEventListener("load", () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else {
                        try {
                            const res = JSON.parse(xhr.responseText);
                            reject(new Error(res.error || xhr.statusText));
                        } catch {
                            reject(new Error(`Chunk ${chunkIndex + 1} failed (${xhr.status})`));
                        }
                    }
                });
                xhr.addEventListener("error", () => reject(new Error("Network error")));
                xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
                xhr.open("POST", "/api/upload-chunk");
                xhr.timeout = CHUNK_TIMEOUT_MS;
                xhr.send(formData);
            });

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunkFile = new File([file.slice(start, end)], file.name, { type: file.type });
            try {
                await uploadChunkXhr(chunkFile, i);
            } catch (e) {
                setErrors((errs) => [...errs, `${file.name}: ${e instanceof Error ? e.message : "Chunk failed"}`]);
                return null;
            }
        }

        const completeRes = await fetch("/api/upload-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId, totalChunks, originalFilename: file.name }),
        });
        if (!completeRes.ok) {
            const err = await completeRes.json().catch(() => ({}));
            setErrors((e) => [...e, `${file.name}: ${err.error || "Reassembly failed"}`]);
            return null;
        }
        const { url } = await completeRes.json();
        return url;
    }, []);

    const uploadFile = useCallback((file: File): Promise<string | null> => {
        const tempId = `${file.name}-${Date.now()}`;
        setUploading((u) => [...u, tempId]);
        setUploadProgress((prev) => ({ ...prev, [tempId]: 0 }));

        if (file.size > CHUNK_THRESHOLD) {
            return uploadChunked(file, tempId).finally(() => {
                setUploading((u) => u.filter((id) => id !== tempId));
                setUploadProgress((prev) => {
                    const next = { ...prev };
                    delete next[tempId];
                    return next;
                });
            });
        }

        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append("file", file);

            xhr.upload.addEventListener("progress", (e: ProgressEvent) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    setUploadProgress((prev) => ({ ...prev, [tempId]: percent }));
                }
            });

            xhr.addEventListener("load", () => {
                setUploading((u) => u.filter((id) => id !== tempId));
                setUploadProgress((prev) => {
                    const next = { ...prev };
                    delete next[tempId];
                    return next;
                });
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        resolve(res.url);
                    } catch (e) {
                        setErrors((errs) => [...errs, `${file.name}: Invalid server response`]);
                        resolve(null);
                    }
                } else {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        setErrors((errs) => [...errs, `${file.name}: ${res.error || xhr.statusText}`]);
                    } catch (e) {
                        setErrors((errs) => [...errs, `${file.name}: Upload failed (${xhr.status})`]);
                    }
                    resolve(null);
                }
            });

            xhr.addEventListener("error", () => {
                setUploading((u) => u.filter((id) => id !== tempId));
                setErrors((errs) => [...errs, `${file.name}: Network error`]);
                resolve(null);
            });

            xhr.addEventListener("timeout", () => {
                setUploading((u) => u.filter((id) => id !== tempId));
                setErrors((errs) => [...errs, `${file.name}: Upload timed out`]);
                resolve(null);
            });

            xhr.open("POST", "/api/upload");
            xhr.timeout = 1800000;
            xhr.send(formData);
        });
    }, [uploadChunked]);



    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const arr = Array.from(files);
        const toUpload = arr.slice(0, maxFiles - mediaUrls.length);
        if (!toUpload.length) return;
        setErrors([]);

        // Upload sequentially or in parallel? Parallel is fine for now.
        const uploadPromises = toUpload.map(async (file) => {
            const url = await uploadFile(file);
            return url;
        });

        const results = await Promise.all(uploadPromises);
        const newUrls = results.filter(Boolean) as string[];

        if (newUrls.length) {
            onMediaChange([...mediaUrls, ...newUrls]);
        }
    }, [mediaUrls, maxFiles, onMediaChange, uploadFile]);

    /* ── Drop zone ── */
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleFiles(e.target.files);
        e.target.value = "";
    };

    /* ── Reorder (drag within thumbnails) ── */
    const onThumbDragStart = (e: React.DragEvent, idx: number) => {
        dragSrcIdx.current = idx;
        e.dataTransfer.effectAllowed = "move";
    };
    const onThumbDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setDragOverIdx(idx);
    };
    const onThumbDrop = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverIdx(null);
        if (dragSrcIdx.current === null || dragSrcIdx.current === idx) return;
        const next = [...mediaUrls];
        const [moved] = next.splice(dragSrcIdx.current, 1);
        next.splice(idx, 0, moved);
        onMediaChange(next);
        dragSrcIdx.current = null;
    };
    const onThumbDragEnd = () => { setDragOverIdx(null); dragSrcIdx.current = null; };

    const [deletedItemsBuffer, setDeletedItemsBuffer] = useState<{ url: string, idx: number }[]>([]);
    const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const removeUrl = (idx: number) => {
        const urlToRemove = mediaUrls[idx];
        // Buffer the item for undo
        setDeletedItemsBuffer(prev => [...prev, { url: urlToRemove, idx }]);
        
        onMediaChange(mediaUrls.filter((_, i) => i !== idx));
        if (thumbnailUrl === urlToRemove && onThumbnailChange) {
            onThumbnailChange("");
        }

        // Show undo toast / auto-clear after 5s
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = setTimeout(() => {
            setDeletedItemsBuffer([]);
        }, 5000);
    };

    const undoRemove = () => {
        if (deletedItemsBuffer.length === 0) return;
        const last = deletedItemsBuffer[deletedItemsBuffer.length - 1];
        const next = [...mediaUrls];
        next.splice(last.idx, 0, last.url);
        onMediaChange(next);
        setDeletedItemsBuffer(prev => prev.slice(0, -1));
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };



    const [isCapturing, setIsCapturing] = useState<string | null>(null);
    const [videoFrames, setVideoFrames] = useState<Record<string, string[]>>({});

    const generateFrames = async (url: string) => {
        if (videoFrames[url]) return;
        const video = document.createElement("video");
        video.src = url;
        video.crossOrigin = "anonymous";
        video.muted = true;
        
        return new Promise<void>((resolve) => {
            video.onloadedmetadata = async () => {
                const duration = video.duration;
                const frameCount = 12;
                const frames: string[] = [];
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                // Set canvas size once based on video aspect ratio
                canvas.width = 160;
                canvas.height = (video.videoHeight / video.videoWidth) * 160;

                for (let i = 0; i < frameCount; i++) {
                    const time = (duration / (frameCount - 1)) * i;
                    video.currentTime = time;
                    await new Promise(r => video.onseeked = r);
                    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                    frames.push(canvas.toDataURL("image/jpeg", 0.7));
                }
                setVideoFrames(prev => ({ ...prev, [url]: frames }));
                resolve();
            };
        });
    };

    const handleCaptureFrame = async (url: string, dataUrl: string) => {
        setIsCapturing(url);
        try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
            const formData = new FormData();
            formData.append("file", file);

            const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
            const { url: thumbUrl } = await uploadRes.json();

            if (onThumbnailChange) {
                onThumbnailChange(thumbUrl);
                success("Cover updated from timeline");
            }
        } catch (err) {
            console.error("Capture error:", err);
        } finally {
            setIsCapturing(null);
        }
    };

    const [externalUrl, setExternalUrl] = useState("");
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [importingUrl, setImportingUrl] = useState(false);

    const handleAddExternalUrl = async () => {
        const url = externalUrl.trim();
        if (!url) return;
        if (!url.startsWith("http")) {
            setErrors(prev => [...prev, "URL must start with http:// or https://"]);
            return;
        }
        const token = localStorage.getItem("osiris_admin_token");
        setImportingUrl(true);
        try {
            const res = await fetch("/api/import-url", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ url }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toastError(data.error || "Could not import from that URL");
                return;
            }
            if (!data.url) {
                toastError("Invalid response from server");
                return;
            }
            onMediaChange([...mediaUrls, data.url]);
            setExternalUrl("");
            setShowUrlInput(false);
            success("Media imported from link");
        } catch (e) {
            console.error(e);
            toastError("Network error while importing URL");
        } finally {
            setImportingUrl(false);
        }
    };

    const isUploading = uploading.length > 0 || importingUrl;
    const canUpload = mediaUrls.length < maxFiles;

    return (
        <div className="space-y-3">
            {/* Drop / tap zone */}
            {canUpload && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    aria-label="Upload media files"
                    className={`relative cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-all select-none ${isDragging
                        ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
                        : "border-zinc-200 hover:border-indigo-400 hover:bg-indigo-50/40 bg-zinc-50 active:scale-[0.99]"
                        }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="sr-only"
                        onChange={onInputChange}
                        tabIndex={-1}
                    />

                    {isUploading ? (
                        <div className="flex flex-col items-center justify-center py-4 w-full px-4">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
                            <div className="w-full max-w-xs space-y-3">
                                {Object.entries(uploadProgress).map(([id, progress]) => (
                                    <div key={id} className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                                            <span className="truncate max-w-[180px]">{id.split('-').slice(0, -1).join('-')}</span>
                                            <span>{(progress as number)}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                {(uploading.length > Object.keys(uploadProgress).length || importingUrl) && (
                                    <p className="text-[10px] font-bold text-center text-zinc-400 uppercase tracking-widest animate-pulse">
                                        {importingUrl ? "Downloading from link…" : "Preparing assets..."}
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center text-zinc-400 py-1">
                            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mb-2">
                                <Upload className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-semibold text-zinc-600">
                                <span className="sm:hidden">Tap to add media</span>
                                <span className="hidden sm:inline">Drop files or click to browse</span>
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">Images &amp; videos · up to 500 MB</p>
                        </div>
                    )}
                </div>
            )}

            {/* External URL Input (Now Always Visible or Controlled by media limit independently) */}
            {!showUrlInput ? (
                <button
                    type="button"
                    disabled={!canUpload}
                    onClick={(e) => { e.stopPropagation(); setShowUrlInput(true); }}
                    className="w-full py-2.5 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2 border-dashed disabled:opacity-50"
                >
                    <Link className="w-3.5 h-3.5" /> Add from External URL
                </button>
            ) : (
                <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <input
                        autoFocus
                        type="text"
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddExternalUrl(); } if (e.key === "Escape") setShowUrlInput(false); }}
                        placeholder="Direct file URL, Google Drive, or Dropbox link"
                        className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                        type="button"
                        disabled={importingUrl}
                        onClick={() => { void handleAddExternalUrl(); }}
                        className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {importingUrl ? "…" : "Add"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowUrlInput(false)}
                        className="p-2 text-zinc-400 hover:text-zinc-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {/* Errors */}
            {deletedItemsBuffer.length > 0 && (
                <div className="flex items-center justify-between bg-zinc-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg animate-in fade-in slide-in-from-bottom-2">
                    <span className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-zinc-400" />
                        Item removed from carousel
                    </span>
                    <button onClick={undoRemove} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors">
                        <Zap className="w-3.5 h-3.5 fill-current" /> UNDO
                    </button>
                </div>
            )}
            {errors.length > 0 && (
                <div className="space-y-1">
                    {errors.map((err: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="flex-1">{err}</span>
                            <button
                                onClick={() => setErrors((e: string[]) => e.filter((_, j: number) => j !== i))}
                                className="shrink-0 text-red-400 hover:text-red-700 transition-colors"
                                aria-label="Dismiss error"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Thumbnail grid with drag reorder */}
            {mediaUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {mediaUrls.map((url, idx) => (
                        <div
                            key={url + idx}
                            draggable
                            onDragStart={(e) => onThumbDragStart(e, idx)}
                            onDragOver={(e) => onThumbDragOver(e, idx)}
                            onDrop={(e) => onThumbDrop(e, idx)}
                            onDragEnd={onThumbDragEnd}
                            className={`relative group aspect-square rounded-lg overflow-hidden bg-zinc-100 border-2 transition-all ${dragOverIdx === idx ? "border-indigo-400 scale-105 shadow-lg" : "border-zinc-200 hover:border-zinc-400"
                                }`}
                        >
                            {/* Drag handle */}
                            <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing" />
                            {/* Media */}
                            {isVideo(url) || format === "reel" ? (
                                <div 
                                    className="w-full h-full relative bg-zinc-900 flex items-center justify-center overflow-hidden"
                                    onMouseEnter={() => generateFrames(url)}
                                >
                                    <video
                                        src={url}
                                        className="w-full h-full object-cover opacity-60"
                                        muted
                                        playsInline
                                        preload="metadata"
                                        crossOrigin="anonymous"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity z-20">
                                        <Play className="w-6 h-6 text-white fill-white shadow-xl" />
                                    </div>
                                    
                                    {/* Timeline Strip Overlay */}
                                    <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-md p-2 translate-y-full group-hover:translate-y-0 transition-transform z-40">
                                        <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 px-1">Select Cover Frame</p>
                                        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                                            {!videoFrames[url] ? (
                                                <div className="flex gap-1">
                                                    {[...Array(6)].map((_, i) => (
                                                        <div key={i} className="w-10 h-12 bg-zinc-800 rounded animate-pulse" />
                                                    ))}
                                                </div>
                                            ) : (
                                                videoFrames[url].map((frame, fIdx) => (
                                                    <button
                                                        key={fIdx}
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleCaptureFrame(url, frame); }}
                                                        className="relative shrink-0 w-10 h-12 rounded overflow-hidden border border-white/10 hover:border-indigo-500 transition-colors"
                                                    >
                                                        <img src={frame} className="w-full h-full object-cover" alt="" />
                                                        {isCapturing === url && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-3 h-3 animate-spin text-white" /></div>}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <img
                                    src={url}
                                    alt={`Slide ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    loading="lazy"
                                />
                            )}

                            {/* Minimal Cover Indicator */}
                            {onThumbnailChange && (
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); onThumbnailChange(url); }}
                                    className={`absolute top-2 left-2 p-1.5 rounded-lg backdrop-blur-md transition-all z-50 flex items-center justify-center ${(thumbnailUrl === url || (!thumbnailUrl && idx === 0))
                                        ? "bg-indigo-600 text-white shadow-lg ring-1 ring-white/20"
                                        : "bg-black/40 text-white/50 border border-white/10 hover:bg-black/60 hover:text-white"
                                        }`}
                                    title={(thumbnailUrl === url || (!thumbnailUrl && idx === 0)) ? "Current Cover" : "Set as Cover"}
                                >
                                    <ImageIcon className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Slide number */}
                            <div className="absolute bottom-1 left-1 bg-black/55 text-white text-[10px] px-1 rounded z-20">
                                {idx + 1}
                            </div>

                            {/* Remove — always visible on mobile, hover on desktop */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); removeUrl(idx); }}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center transition-opacity sm:opacity-0 sm:group-hover:opacity-100 active:scale-95 shadow-lg z-50 hover:bg-red-700"
                                aria-label={`Remove slide ${idx + 1}`}
                            >
                                <X className="w-3 h-3" />
                            </button>

                            {/* Drag handle hint on desktop */}
                            <div className="absolute inset-x-0 bottom-0 top-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                                <GripVertical className="w-4 h-4 text-white/50 drop-shadow" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reorder hint */}
            {mediaUrls.length > 1 && (
                <div className="flex items-center justify-center gap-3 px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl mt-4">
                    <div className="flex -space-x-1.5">
                        <div className="w-4 h-4 rounded-full bg-white border border-zinc-300 flex items-center justify-center text-[10px] font-bold text-zinc-400">1</div>
                        <div className="w-4 h-4 rounded-full bg-white border border-zinc-300 flex items-center justify-center text-[10px] font-bold text-zinc-400">2</div>
                        <div className="w-4 h-4 rounded-full bg-white border border-zinc-300 flex items-center justify-center text-[10px] font-bold text-zinc-400">3</div>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium">
                        <span className="hidden sm:inline">Drag thumbnails to reorder · </span>First asset becomes the cover
                    </p>
                </div>
            )}
        </div>
    );
}
