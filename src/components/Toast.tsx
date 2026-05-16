import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */
export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContext {
    toast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

/* ── Context ────────────────────────────────────────────────── */
const Ctx = createContext<ToastContext>({
    toast: () => { }, success: () => { }, error: () => { }, warning: () => { }, info: () => { },
});

export const useToast = () => useContext(Ctx);

/* ── Config ─────────────────────────────────────────────────── */
const ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
    error: <XCircle className="w-4 h-4 text-red-500 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
};

const COLORS: Record<ToastType, string> = {
    success: "border-emerald-100 bg-white",
    error: "border-red-100 bg-white",
    warning: "border-amber-100 bg-white",
    info: "border-blue-100 bg-white",
};

const DURATION = 3800;

/* ── Provider ───────────────────────────────────────────────── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: string) => {
        setToasts((t) => t.filter((x) => x.id !== id));
        const timer = timers.current.get(id);
        if (timer) { clearTimeout(timer); timers.current.delete(id); }
    }, []);

    const show = useCallback((message: string, type: ToastType = "info") => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setToasts((t) => [...t.slice(-4), { id, message, type }]); // max 5 visible
        const timer = setTimeout(() => dismiss(id), DURATION);
        timers.current.set(id, timer);
    }, [dismiss]);

    const ctx: ToastContext = {
        toast: show,
        success: (m) => show(m, "success"),
        error: (m) => show(m, "error"),
        warning: (m) => show(m, "warning"),
        info: (m) => show(m, "info"),
    };

    return (
        <Ctx.Provider value={ctx}>
            {children}

            {/* Toast stack — above FABs, below modals */}
            <div
                aria-live="polite"
                aria-label="Notifications"
                className="fixed z-[150] flex flex-col gap-2 items-center pointer-events-none"
                style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)", left: "50%", transform: "translateX(-50%)", width: "min(calc(100vw - 2rem), 400px)" }}
            >
                <AnimatePresence initial={false}>
                    {toasts.map((t) => (
                        <motion.div
                            key={t.id}
                            layout
                            initial={{ opacity: 0, y: 24, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -12, scale: 0.96 }}
                            transition={{ type: "spring", damping: 28, stiffness: 320 }}
                            className={`pointer-events-auto w-full flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-xl ${COLORS[t.type]}`}
                        >
                            {ICONS[t.type]}
                            <span className="flex-1 text-sm font-medium text-zinc-800 leading-snug">{t.message}</span>
                            <button
                                onClick={() => dismiss(t.id)}
                                className="shrink-0 text-zinc-300 hover:text-zinc-600 transition-colors ml-1 mt-0.5"
                                aria-label="Dismiss"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </Ctx.Provider>
    );
}
