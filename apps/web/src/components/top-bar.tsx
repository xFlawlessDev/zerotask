import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { signOut } from "@/lib/api/client";
import { useRequiredSession } from "@/features/session";
import { useAppearance } from "@/features/appearance";
import { IconButton } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { IconMoon, IconRail, IconSignOut, IconSun } from "@/components/icon";
import { initials } from "@/lib/format";

/**
 * The top bar: where you are, who you are, and the two settings that apply
 * everywhere. Everything in it exists; there is no search box that does not search
 * and no avatar menu with one item.
 */
export function TopBar({ title, onOpenNavigation }: { title: string; onOpenNavigation: () => void }) {
  const { person } = useRequiredSession();
  const { resolvedTheme, setTheme } = useAppearance();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      toast.success("Signed out");
      void navigate({ to: "/auth" });
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <header
      className="sticky top-0 z-30 flex h-(--topbar-height) shrink-0 items-center gap-3 border-b border-rule bg-canvas px-4"
      data-testid="topbar"
    >
      <div className="lg:hidden">
        <IconButton label="Open navigation" onClick={onOpenNavigation}><IconRail /></IconButton>
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-compact font-semibold text-ink-muted">{title}</h2>
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell />

        <IconButton
          label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <IconSun /> : <IconMoon />}
        </IconButton>

        <span className="mx-1 hidden h-5 w-px bg-rule sm:block" aria-hidden="true" />

        <Link
          to="/profile"
          className="flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors hover:bg-sunk"
        >
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-ink text-[11px] font-semibold text-on-accent"
          >
            {initials(person.name ?? person.email)}
          </span>
          <span className="hidden max-w-40 truncate text-compact text-ink sm:block">
            {person.name ?? person.email}
          </span>
        </Link>

        <IconButton label="Sign out" onClick={() => void handleSignOut()}>
          <IconSignOut />
        </IconButton>
      </div>
    </header>
  );
}

export { IconRail };
