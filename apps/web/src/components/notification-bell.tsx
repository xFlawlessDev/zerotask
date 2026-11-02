import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useNotifications, useNotificationActions } from "@/features/hooks";
import { IconButton } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/ui/surface";
import { IconBell, IconCheck } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  assignment: "Assignment",
  review: "Review",
  schedule: "Schedule",
  dependency: "Dependency",
  mention: "Comment",
  system: "System",
};

/**
 * The notification bell.
 *
 * The unread count polls once a minute; the feed itself is cached and invalidated
 * on read. A notification with a destination navigates and marks itself read in the
 * same click, so a notice is never a dead item. Without a destination it is still
 * dismissible, because a control that does nothing is a defect.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useNotifications(30);
  const { markRead, markAllRead } = useNotificationActions();

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <IconButton
        label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <IconBell />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="tnum absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-surface"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="float absolute top-10 right-0 z-50 w-80 overflow-hidden rounded-panel border border-rule bg-popover"
        >
          <div className="flex items-center justify-between border-b border-rule px-3 py-2">
            <span className="text-compact font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate(undefined)}
                className="inline-flex items-center gap-1 text-meta text-accent-ink hover:underline"
              >
                <IconCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <LoadingState label="Loading notifications" />
          ) : items.length === 0 ? (
            <EmptyState
              compact
              title="Nothing here yet"
              description="Assignments, reviews, and schedule changes land here as they happen."
            />
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => {
                const content = (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-compact", item.readAt ? "text-ink-muted" : "font-medium text-ink")}>
                        {item.title}
                      </span>
                      <span aria-hidden="true" className="mt-0.5 shrink-0">
                        {item.readAt ? (
                          <span className="block size-1.5 rounded-full bg-transparent" />
                        ) : (
                          <span className="block size-1.5 rounded-full bg-accent-ink" />
                        )}
                      </span>
                    </div>
                    {item.body && (
                      <p className="mt-0.5 line-clamp-2 text-meta text-ink-muted">{item.body}</p>
                    )}
                    <p className="mt-1 text-label text-faint">
                      {KIND_LABEL[item.kind] ?? "Notice"} · {formatDateTime(item.createdAt)}
                    </p>
                  </>
                );

                const rowClass = cn(
                  "w-full border-b border-rule px-3 py-2 text-left last:border-b-0",
                  !item.readAt && "bg-accent-wash/40",
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        to={item.href}
                        className={cn(rowClass, "block hover:bg-sunk")}
                        onClick={() => {
                          setOpen(false);
                          if (!item.readAt) markRead.mutate([item.id]);
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className={rowClass}>
                        {content}
                        {!item.readAt && (
                          <button
                            type="button"
                            className="mt-1 text-meta text-accent-ink hover:underline"
                            onClick={() => markRead.mutate([item.id])}
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
