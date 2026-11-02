import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useRequiredSession } from "@/features/session";
import { useFavorites, useOverview } from "@/features/hooks";
import { TopBar } from "@/components/top-bar";
import { IconRail, IconStar } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";
import {
  IconAdmin,
  IconBoard,
  IconCriticalPath,
  IconDocument,
  IconMyWork,
  IconOverview,
  IconProjects,
  IconReview,
  IconTemplate,
} from "@/components/icon";

/**
 * The shell: one fixed rail, one top bar, one scroll region.
 *
 * The rail holds only pages that exist. Reviews appears with a count when there is
 * something to review, so the navigation reflects the work rather than a fixed
 * template; favorites are the person's own pinned projects.
 */

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Pages an admin never sees are not listed at all. */
  adminOnly?: boolean;
  /** A count, when the page has something waiting. */
  count?: (overview: { reviews: { pendingForMe: number } }) => number;
}

const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: IconOverview },
  { to: "/projects", label: "Projects", icon: IconProjects },
  { to: "/my-work", label: "My work", icon: IconMyWork },
  { to: "/reviews", label: "Reviews", icon: IconReview, count: (o) => o.reviews.pendingForMe },
  { to: "/documents", label: "Documents", icon: IconDocument },
  { to: "/cpm", label: "Critical path", icon: IconCriticalPath },
  { to: "/resources", label: "Resources", icon: IconBoard },
  { to: "/team", label: "Team", icon: IconBoard },
  { to: "/templates", label: "Templates", icon: IconTemplate, adminOnly: true },
  { to: "/admin", label: "Admin", icon: IconAdmin, adminOnly: true },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { person, capabilities } = useRequiredSession();
  const { data: overview } = useOverview();
  const { data: favorites } = useFavorites();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);

  const items = NAV.filter((item) => !item.adminOnly || capabilities.managePeople);

  const railNav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {items.map((item) => {
        const active = isActive(location.pathname, item.to);
        const count = overview && item.count ? item.count(overview) : 0;
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-control px-2 text-compact font-medium transition-colors duration-100",
              active
                ? "bg-accent-wash text-accent-ink"
                : "text-ink-muted hover:bg-sunk hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && count > 0 && (
              <span className="tnum ml-auto rounded-mark bg-danger px-1 text-[10px] font-semibold text-surface">
                {count}
              </span>
            )}
            {collapsed && count > 0 && (
              <span
                aria-hidden="true"
                className="absolute left-9 size-1.5 rounded-full bg-danger"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );

  const favoritesNav =
    !collapsed &&
    (favorites?.length ?? 0) > 0 && (
      <div className="border-t border-rule p-2">
        <p className="px-2 pb-1 text-label font-medium text-faint">Pinned</p>
        <ul className="flex flex-col gap-0.5">
          {favorites!.slice(0, 6).map((favorite) => (
            <li key={favorite.href}>
              <Link
                to={favorite.href}
                className="flex h-7 items-center gap-2 rounded-control px-2 text-meta text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
              >
                <IconStar size={12} className="shrink-0" />
                <span className="truncate">{favorite.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-accent-ink focus:px-3 focus:py-1.5 focus:text-compact focus:text-on-accent"
      >
        Skip to content
      </a>

      <aside
        data-testid="rail"
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-rule bg-surface transition-[width] duration-150",
          collapsed ? "w-(--nav-width-collapsed)" : "w-(--nav-width)",
          // Below 1024px the rail hides; the top bar's menu button takes over.
          "max-lg:hidden",
        )}
      >
        <div className="flex h-(--topbar-height) items-center gap-2 border-b border-rule px-3">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="Zero Task home">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-control bg-accent-ink text-[13px] font-bold text-on-accent"
            >
              Z
            </span>
            {!collapsed && (
              <span className="truncate text-compact font-semibold tracking-tight text-ink">
                Zero Task
              </span>
            )}
          </Link>
        </div>

        {railNav}
        {favoritesNav}

        <div className="flex items-center justify-between border-t border-rule p-2">
          {!collapsed && (
            <span className="min-w-0 truncate px-2 text-meta text-faint" title={person.email}>
              {person.name ?? person.email}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="flex size-8 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
          >
            <IconRail className={collapsed ? "" : "rotate-180"} />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
