import { ReactNode } from "react";

interface BadgeProps {
    children: ReactNode;
    variant?: "success" | "danger" | "warning" | "info" | "neutral";
    className?: string;
}

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
    const baseStyles = "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

    const variantStyles = {
        success: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        danger: "bg-red-50 text-red-600 border border-red-200",
        warning: "bg-amber-100 text-amber-700 border border-amber-200",
        info: "bg-blue-100 text-blue-700 border border-blue-200",
        neutral: "bg-zinc-100 text-zinc-500 border border-zinc-200",
    };

    return (
        <span className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
            {children}
        </span>
    );
}
