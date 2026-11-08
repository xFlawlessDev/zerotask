import { Toaster } from "sonner";
import { useAppearance } from "@/features/appearance";

/**
 * The toast host, inside the appearance provider so it can follow the theme.
 *
 * Sonner renders into a portal and styles its own surface. It accepts a `theme`
 * prop; without one it assumes light, so every toast in dark mode was a white card
 * on a black page. The provider is the only place that knows which theme resolved.
 */
export function ThemedToaster() {
  const { resolvedTheme } = useAppearance();

  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      offset={16}
      /* The palette's own surface and ink, so a toast is the same material as a dialog. */
      toastOptions={{
        style: {
          borderRadius: "6px",
          background: "var(--surface)",
          color: "var(--ink)",
          border: "1px solid var(--rule)",
        },
      }}
    />
  );
}
