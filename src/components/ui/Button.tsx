import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
    size?: "sm" | "md" | "lg";
    children: ReactNode;
    icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", children, icon, className = "", ...props }: ButtonProps) {
    const baseStyles = "inline-flex items-center justify-center font-bold transition-all rounded-xl focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

    const sizeStyles = {
        sm: "px-3 py-1.5 text-xs gap-1.5",
        md: "px-4 py-2 text-sm gap-2",
        lg: "px-6 py-3 text-base gap-2"
    };

    const variantStyles = {
        primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100",
        secondary: "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300",
        danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200",
        ghost: "bg-transparent hover:bg-zinc-100 text-zinc-600",
        outline: "bg-transparent border-2 border-dashed border-zinc-200 hover:border-indigo-400 hover:text-indigo-600 text-zinc-500"
    };

    return (
        <button
            className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
            {...props}
        >
            {icon}
            {children}
        </button>
    );
}
