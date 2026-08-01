import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Theme layer.
 *
 * Tokens for both themes live in src/styles.css. This provider only decides
 * which class sits on <html>, so components
 * never need to know about theming beyond using semantic tokens.
 */

export type Theme = "dark" | "light" | "system";

import { ROOM_SETTINGS_EVENT, readDefaultTheme } from "@/lib/room-settings";

const STORAGE_KEY = "ashnight-theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [systemPref, setSystemPref] = useState<"dark" | "light">("light");

  // Read the stored preference after hydration to avoid SSR mismatches.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const hasChoice = stored === "dark" || stored === "light" || stored === "system";
    // No personal choice yet → follow the default the admin picked.
    setThemeState(hasChoice ? stored : readDefaultTheme());
    setSystemPref(systemTheme());

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemPref(systemTheme());
    media.addEventListener("change", onChange);

    // Track the admin default for anyone who never picked a theme themselves.
    function onSettings() {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
      setThemeState(readDefaultTheme());
    }
    window.addEventListener(ROOM_SETTINGS_EVENT, onSettings);
    window.addEventListener("storage", onSettings);

    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener(ROOM_SETTINGS_EVENT, onSettings);
      window.removeEventListener("storage", onSettings);
    };
  }, []);

  const resolvedTheme = theme === "system" ? systemPref : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
