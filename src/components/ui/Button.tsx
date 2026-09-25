import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
    size?: "sm" | "md" | "lg";
    children: ReactNode;
    icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", children, icon, className = "", type = "button", ...props }: ButtonProps) {
    const baseStyles = "inline-flex min-h-10 items-center justify-center rounded-lg font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

    const sizeStyles = {
        sm: "px-3 py-1.5 text-xs gap-1.5",
        md: "px-4 py-2 text-sm gap-2",
        lg: "px-6 py-3 text-base gap-2"
    };

    const variantStyles = {
        primary: "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md",
        secondary: "border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50",
        danger: "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
        ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        outline: "border border-zinc-300 bg-transparent text-zinc-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
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
