import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    isOpen, title, message,
    confirmLabel = "Confirm", cancelLabel = "Cancel",
    destructive = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Auto-focus: destructive → Cancel (safety), non-destructive → Confirm
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => {
            (destructive ? cancelRef : confirmRef).current?.focus();
        }, 50);
        return () => clearTimeout(timer);
    }, [isOpen, destructive]);

    // Keyboard: Escape → cancel, Tab → trap inside panel
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") { onCancel(); return; }
            if (e.key === "Tab") {
                if (!panelRef.current) return;
                const focusable = panelRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, onCancel]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-title"
                    aria-describedby="confirm-message"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <motion.div
                        ref={panelRef}
                        initial={{ scale: 0.95, opacity: 0, y: 8 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 8 }}
                        transition={{ type: "spring", damping: 25, stiffness: 350 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-4 mb-5">
                            {destructive && (
                                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                </div>
                            )}
                            <div className="flex-1">
                                <h3 id="confirm-title" className="font-bold text-zinc-900 text-base">{title}</h3>
                                <p id="confirm-message" className="text-sm text-zinc-500 mt-1 leading-relaxed">{message}</p>
                            </div>
                            {/* Close X button — separate ref from the Cancel button */}
                            <button
                                ref={closeRef}
                                onClick={onCancel}
                                aria-label="Close dialog"
                                className="text-zinc-400 hover:text-zinc-700 transition-colors p-0.5 rounded focus-visible:ring-2 focus-visible:ring-zinc-400"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button
                                ref={cancelRef}
                                onClick={onCancel}
                                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-zinc-400"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                ref={confirmRef}
                                onClick={() => { onConfirm(); onCancel(); }}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition-all focus-visible:ring-2 ${destructive
                                    ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-400"
                                    : "bg-zinc-900 hover:bg-zinc-800 focus-visible:ring-zinc-400"
                                    }`}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
