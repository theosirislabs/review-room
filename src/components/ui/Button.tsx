import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
    size?: "sm" | "md" | "lg";
    children: ReactNode;
    icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", children, icon, className = "", type = "button", ...props }: ButtonProps) {
    const baseStyles = "inline-flex min-h-10 items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    const sizeStyles = {
        sm: "px-3 py-1.5 text-xs gap-1.5",
        md: "px-4 py-2 text-sm gap-2",
        lg: "px-6 py-3 text-base gap-2"
    };

    const variantStyles = {
        primary: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
        secondary: "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300",
        danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200",
        ghost: "bg-transparent hover:bg-zinc-100 text-zinc-600",
        outline: "border border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700"
    };

    return (
        <button
            type={type}
            className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
            {...props}
        >
            {icon && <span aria-hidden="true" className="shrink-0">{icon}</span>}
            {children}
        </button>
    );
}
