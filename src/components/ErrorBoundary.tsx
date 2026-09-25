import React from "react";
import { motion } from "motion/react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Log to console for developer visibility.
        // In production you'd forward to your error-tracking service (e.g. Sentry) here.
        console.error("[ErrorBoundary]", error, info.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 font-sans">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                     className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)]"
                >
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-7 h-7 text-red-500" />
                    </div>
                    <h1 className="text-lg font-bold text-zinc-900 mb-2">Something went wrong</h1>
                    <p className="text-sm text-zinc-500 mb-1">
                        An unexpected error occurred. Please reload the page to continue.
                    </p>
                    {this.state.error && (
                        <p className="text-xs font-mono text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3 text-left break-all">
                            {this.state.error.message}
                        </p>
                    )}
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: undefined });
                            window.location.reload();
                        }}
                         className="mx-auto mt-6 inline-flex min-h-10 items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Reload App
                    </button>
                </motion.div>
            </div>
        );
    }
}
