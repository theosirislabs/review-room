import { useCallback, useEffect, useState } from "react";

export type ClientTheme = "light" | "dark";

export const clientThemeStorageKey = (tenantId: string) =>
  `osiris_client_theme_${tenantId || "review"}`;

function systemTheme(): ClientTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readClientTheme(tenantId: string): ClientTheme {
  try {
    const saved = window.localStorage.getItem(clientThemeStorageKey(tenantId));
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Private browsing or storage restrictions should not block the portal.
  }
  return systemTheme();
}

/**
 * Keeps a client portal's appearance independent from the agency workspace.
 * The choice is scoped by tenant so a client cannot accidentally change staff UI.
 */
export function useClientTheme(tenantId: string) {
  const [theme, setTheme] = useState<ClientTheme>(() => readClientTheme(tenantId));

  useEffect(() => {
    setTheme(readClientTheme(tenantId));
  }, [tenantId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(clientThemeStorageKey(tenantId), theme);
    } catch {
      // The current session still works when persistence is unavailable.
    }
  }, [tenantId, theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
