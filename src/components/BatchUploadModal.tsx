import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    X, Upload, Grid3X3, Trash2, Loader2, Layers, Zap, ArrowRight, GripVertical
} from "lucide-react";
import { useToast } from "./Toast";

interface BatchItem {
    id: string;
    url: string;
    title: string;
    format: "image" | "reel" | "carousel" | "image" | "reel";
    file: File;
    remoteUrl?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (posts: any[]) => void;
}

export default function BatchUploadModal({ isOpen, onClose, onComplete }: Props) {
    const [items, setItems] = useState<BatchItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const dragSrcIdx = useRef<number | null>(null);
    const [uploading, setUploading] = useState(false);
    const [mode, setMode] = useState<"individual" | "carousel">("individual");
    const [baseTitle, setBaseTitle] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Separate ref for the "Add more" button so two hidden inputs don't fight over the same ref
    const addMoreRef = useRef<HTMLInputElement>(null);
    const { success, error: toastError } = useToast();

    const handleFiles = useCallback((files: FileList | File[]) => {
        const newItems: BatchItem[] = [];
        for (const file of Array.from(files)) {
            if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
            const isVideo = file.type.startsWith("video/");
            const item: BatchItem = {
                id: Math.random().toString(36).substr(2, 9),
                url: URL.createObjectURL(file), // Temporary preview
                title: file.name.split(".")[0].replace(/[-_]/g, " "),
                format: isVideo ? "reel" : "image",
                file
            };
            newItems.push(item);
        }
        setItems((prev) => [...prev, ...newItems]);
    }, []);

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    };

    const clearStagedItems = () => {
        items.forEach((i: BatchItem) => URL.revokeObjectURL(i.url));
        setItems([]);
    };

    const handleClose = () => {
        clearStagedItems();
        onClose();
    };

    const removeItem = (id: string) => {
        setItems((prev: BatchItem[]) => {
            const item = prev.find(i => i.id === id);
            if (item) URL.revokeObjectURL(item.url);
            return prev.filter(i => i.id !== id);
        });
    };

    /* ── Reorder ── */
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
        setDragOverIdx(null);
        if (dragSrcIdx.current === null || dragSrcIdx.current === idx) return;
        const next = [...items];
        const [moved] = next.splice(dragSrcIdx.current, 1);
        next.splice(idx, 0, moved);
        setItems(next);
        dragSrcIdx.current = null;
    };

    const handleUploadAndFinalize = async () => {
        if (items.length === 0) return;
        setUploading(true);

        try {
            // 1. Upload all files
            const uploadPromises = items.map(async (item: BatchItem) => {
                const formData = new FormData();
                formData.append("file", item.file);
                const res = await fetch("/api/upload", { method: "POST", body: formData });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `Upload failed for ${item.file.name}`);
                }
                const data = await res.json();
                return { ...item, remoteUrl: data.url as string };
            });

            const uploadedItems = await Promise.all(uploadPromises);

            // 2. Prepare posts based on mode
            const finalPosts = [];
            const now = new Date();
            const finalDateStr = now.toISOString().split("T")[0];
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (mode === "carousel") {
                finalPosts.push({
                    title: baseTitle || "New Carousel Batch",
                    format: "carousel",
                    mediaUrls: uploadedItems.map((i: any) => i.remoteUrl),
                    date: finalDateStr,
                    time: timeStr,
                    clientStatus: "Not Ready for Client",
                    internalStatus: "Draft"
                });
            } else {
                uploadedItems.forEach((item, idx) => {
                    finalPosts.push({
                        title: baseTitle ? `${baseTitle} - ${idx + 1}` : item.title,
                        format: item.format,
                        mediaUrls: [item.remoteUrl],
                        date: finalDateStr,
                        time: timeStr,
                        clientStatus: "Not Ready for Client",
                        internalStatus: "Draft"
                    });
                });
            }

            onComplete(finalPosts);
            success?.("Batch created successfully");
            clearStagedItems();
            setBaseTitle("");
            onClose();
        } catch (err: any) {
            toastError(err.message || "Failed to finalize batch");
        } finally {
            setUploading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                                    <Zap className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Batch Post Creator</h2>
                                    <p className="text-xs text-zinc-500 font-medium">Turn assets into review-ready drafts in seconds</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-zinc-200 rounded-full transition-all text-zinc-400 hover:text-zinc-900"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            {/* Left Side: Drag/Drop & List */}
                            <div className="flex-1 overflow-auto p-8 border-r border-zinc-100">
                                {items.length === 0 ? (
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={onDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`h-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group ${isDragging ? "border-indigo-500 bg-indigo-50 scale-[0.98]" : "border-zinc-200 hover:border-indigo-400 hover:bg-indigo-50/30"
                                            }`}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept="image/*,video/*"
                                            className="hidden"
                                            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
                                        />
                                        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Upload className={`w-8 h-8 ${isDragging ? "text-indigo-600" : "text-zinc-400"}`} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base font-bold text-zinc-900">Drop content here</p>
                                            <p className="text-xs text-zinc-500 mt-1">Images or videos · up to 500 MB</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Staged Assets ({items.length})</span>
                                            <button
                                                onClick={() => addMoreRef.current?.click()}
                                                className="text-xs font-bold text-indigo-600 hover:underline"
                                            >
                                                Add more
                                            </button>
                                            {/* Separate hidden input so it doesn't conflict with the drop-zone ref */}
                                            <input
                                                ref={addMoreRef}
                                                type="file"
                                                multiple
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                            {items.map((item, idx) => (
                                                <div
                                                    key={item.id}
                                                    draggable
                                                    onDragStart={(e) => onThumbDragStart(e, idx)}
                                                    onDragOver={(e) => onThumbDragOver(e, idx)}
                                                    onDrop={(e) => onThumbDrop(e, idx)}
                                                    onDragEnd={() => setDragOverIdx(null)}
                                                    className={`relative aspect-[4/5] rounded-2xl overflow-hidden group border-2 transition-all cursor-grab active:cursor-grabbing ${dragOverIdx === idx ? "border-indigo-400 scale-105 shadow-xl z-10" : "border-zinc-100 bg-zinc-50 shadow-sm"
                                                        }`}
                                                >
                                                    {item.format === "reel" ? (
                                                        <video src={item.url} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                                                    ) : (
                                                        <img src={item.url} className="w-full h-full object-cover" alt="" />
                                                    )}
                                                    <div className="absolute inset-0 bg-black/40 sm:opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                                        <div className="flex justify-between items-start">
                                                            <div className="bg-black/40 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded font-bold">
                                                                {idx + 1}
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                                                                className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-1">
                                                            <div className="bg-black/60 backdrop-blur-md rounded-lg p-1.5 text-[10px] text-white truncate font-medium flex-1">
                                                                {item.title}
                                                            </div>
                                                            <GripVertical className="w-4 h-4 text-white/50 shrink-0" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Side: Options */}
                            <div className="w-full md:w-80 bg-zinc-50/50 p-8 flex flex-col gap-8 border-t md:border-t-0 border-zinc-100">
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Creation Mode</h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            onClick={() => setMode("individual")}
                                            className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${mode === "individual"
                                                ? "bg-white border-indigo-200 shadow-lg shadow-indigo-100 ring-2 ring-indigo-500/10"
                                                : "bg-white/50 border-zinc-200 hover:border-zinc-300"
                                                }`}
                                        >
                                            <Grid3X3 className={`w-5 h-5 ${mode === "individual" ? "text-indigo-600" : "text-zinc-400"}`} />
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-zinc-900">Separate Posts</p>
                                                <p className="text-[10px] text-zinc-500 leading-tight">1 Post per asset</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => setMode("carousel")}
                                            className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${mode === "carousel"
                                                ? "bg-white border-indigo-200 shadow-lg shadow-indigo-100 ring-2 ring-indigo-500/10"
                                                : "bg-white/50 border-zinc-200 hover:border-zinc-300"
                                                }`}
                                        >
                                            <Layers className={`w-5 h-5 ${mode === "carousel" ? "text-indigo-600" : "text-zinc-400"}`} />
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-zinc-900">Merged Carousel</p>
                                                <p className="text-[10px] text-zinc-500 leading-tight">Combine all into 1 post</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Initial Context</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-zinc-500 mb-1 block ml-1">Base Title / Campaign</label>
                                            <input
                                                value={baseTitle}
                                                onChange={(e) => setBaseTitle(e.target.value)}
                                                placeholder="Spring Collection..."
                                                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto pt-4 border-t border-zinc-100">
                                    <button
                                        disabled={items.length === 0 || uploading}
                                        onClick={handleUploadAndFinalize}
                                        className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-[0.98] shadow-xl shadow-zinc-200"
                                    >
                                        {uploading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                Finalize Batch <ArrowRight className="w-4 h-4 ml-1" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
