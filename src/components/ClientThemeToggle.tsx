import { Moon, Sun } from "lucide-react";
import type { ClientTheme } from "../clientTheme";

interface ClientThemeToggleProps {
  theme: ClientTheme;
  onToggle: () => void;
  compact?: boolean;
}

export function ClientThemeToggle({ theme, onToggle, compact = false }: ClientThemeToggleProps) {
  const switchingToLight = theme === "dark";
  const targetMode = switchingToLight ? "light" : "dark";
  const label = `Switch to ${targetMode} mode`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rr-client-theme-toggle ${compact ? "rr-client-theme-toggle--compact" : ""}`}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
    >
      {switchingToLight ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
      {!compact && <span className="hidden md:inline">Switch to {targetMode}</span>}
    </button>
  );
}
