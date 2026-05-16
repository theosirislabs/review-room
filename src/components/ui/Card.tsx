import { ReactNode } from "react";

interface CardProps {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    hoverable?: boolean;
}

export function Card({ children, className = "", onClick, hoverable = false }: CardProps) {
    return (
        <div
            onClick={onClick}
            className={`bg-white border rounded-2xl shadow-sm overflow-hidden 
        ${hoverable ? "cursor-pointer hover:shadow-md hover:-translate-y-1 hover:border-indigo-100 transition-all" : ""}
        ${className}
      `}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string; }) {
    return <div className={`px-5 py-4 border-b border-zinc-100 flex items-center justify-between ${className}`}>{children}</div>;
}

export function CardContent({ children, className = "" }: { children: ReactNode; className?: string; }) {
    return <div className={`p-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = "" }: { children: ReactNode; className?: string; }) {
    return <div className={`px-5 py-4 border-t border-zinc-50 bg-zinc-50 flex items-center gap-3 ${className}`}>{children}</div>;
}
