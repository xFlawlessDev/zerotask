import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Theme and density are the two user settings the whole interface obeys.
 *
 * Both are stored under a `zerotask.` key and applied to `<html>` as data
 * attributes, which is what the stylesheet's `[data-theme="dark"]` and
 * `[data-density]` selectors read. The default is light and comfortable; a person
 * who wants dark or denser rows changes it once and it sticks.
 */

type Theme = "light" | "dark" | "system";
type Density = "comfortable" | "compact";

interface AppearanceValue {
  theme: Theme;
  density: Density;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
}

const THEME_KEY = "zerotask.theme";
const DENSITY_KEY = "zerotask.density";

const AppearanceContext = createContext<AppearanceValue | null>(null);

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const value = localStorage.getItem(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function systemPrefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored(THEME_KEY, ["light", "dark", "system"] as const, "light"));
  const [density, setDensityState] = useState<Density>(() => readStored(DENSITY_KEY, ["comfortable", "compact"] as const, "comfortable"));
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.density = density;
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(DENSITY_KEY, density);
  }, [resolved, density, theme]);

  return (
    <AppearanceContext.Provider
      value={{
        theme,
        density,
        resolvedTheme: resolved,
        setTheme: setThemeState,
        setDensity: setDensityState,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
