import type { SVGProps } from "react";

/**
 * A hand-drawn icon set on a 16-unit grid with a 1.5 stroke.
 *
 * Written rather than imported because a recognizable library silhouette is the
 * fastest way for an interface to read as generated, and because each glyph here
 * depicts the literal object in this product: a bar per task for the Gantt, a
 * link for a dependency, a flag for a milestone.
 *
 * Every icon is decorative by default (`aria-hidden`), since it always sits next
 * to a text label. An icon-only control supplies its own `aria-label`.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Overview: four panes, one of them filled, as a dashboard is four unequal views. */
export const IconOverview = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2" width="5" height="5" />
    <rect x="9" y="2" width="5" height="5" />
    <rect x="2" y="9" width="5" height="5" />
    <path d="M9 11.5h5" />
  </Icon>
);

/** Projects: a stack of sheets, because a project is a bundle of work. */
export const IconProjects = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4.5h10v9H3z" />
    <path d="M5 2.5h8v2" />
    <path d="M5.5 7.5h5M5.5 10.5h3" />
  </Icon>
);

/** My work: a clipboard with a tick, the literal object of a task list. */
export const IconMyWork = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 3.5h8v10H4z" />
    <path d="M6.5 2h3v2.5h-3z" />
    <path d="M6 9l1.5 1.5L10.5 7" />
  </Icon>
);

/** Board: three columns of differing heights, which is what a kanban is. */
export const IconBoard = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 2.5v11M8 2.5v11M13.5 2.5v11" />
    <path d="M4 4h2M9.5 4h2M9.5 7h2M4 7h2M4 10h2" />
  </Icon>
);

/** Timeline: bars offset in time, the Gantt's own shape. */
export const IconTimeline = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4h6M5 8h7M8.5 12h5" />
    <path d="M2.5 2v12" strokeDasharray="2 2" />
  </Icon>
);

/** Critical path: a chain of nodes with one leg marked out. */
export const IconCriticalPath = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="3.5" cy="12" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="12.5" cy="3.5" r="1.5" />
    <path d="M4.6 10.9l2.3-2M9.1 6.9l2.3-2.3" />
  </Icon>
);

/** Dependencies: two links in a chain. */
export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.8.8" />
    <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7.5 12l.8-.8" />
  </Icon>
);

/** Milestone: a pennant on a pole, the literal marker. */
export const IconMilestone = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 2v12" />
    <path d="M4.5 3h7l-1.5 2.5L11.5 8h-7" />
  </Icon>
);

/** Documents: a page with a folded corner. */
export const IconDocument = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2v3h3" />
  </Icon>
);

/** Team: two shoulders, one behind the other. */
export const IconTeam = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="5.5" r="2" />
    <path d="M2.5 13c0-2 1.6-3.5 3.5-3.5s3.5 1.5 3.5 3.5" />
    <path d="M10.5 4.2a2 2 0 0 1 0 3.8M11.5 9.8c1.2.5 2 1.7 2 3.2" />
  </Icon>
);

/** Templates: a sheet with repeated rows, the idea of a reusable shape. */
export const IconTemplate = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3" width="11" height="10" />
    <path d="M2.5 6.5h11M6 6.5V13" />
  </Icon>
);

/** Admin: sliders, because administration is adjusting the machine. */
export const IconAdmin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 5h11M2.5 11h11" />
    <circle cx="6" cy="5" r="1.5" />
    <circle cx="10.5" cy="11" r="1.5" />
  </Icon>
);

/** Review: a stamp, which is what approval is. */
export const IconReview = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h10" />
    <path d="M5 12V8.5a3 3 0 0 1 6 0V12" />
    <path d="M8 2.5v1.5" />
  </Icon>
);

/** Blocked: a barrier. */
export const IconBlocked = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M4.2 11.8l7.6-7.6" />
  </Icon>
);

/** Overdue: a clock with a hand past the mark. */
export const IconOverdue = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 4.5V8l2.5 1.5" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.4 10.4L14 14" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5L8 10l4-3.5" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4L10 8l-3.5 4" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 4L6 8l3.5 4" />
  </Icon>
);

/** Collapse the rail: a panel with its left half pushed out. */
export const IconRail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" />
    <path d="M6 3v10" />
  </Icon>
);

/** The bell, drawn as a bell rather than a rounded outline with a dot. */
export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7a4 4 0 0 1 8 0v3l1 1.5H3L4 10z" />
    <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
  </Icon>
);

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
  </Icon>
);

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 9.5A5 5 0 0 1 6.5 3.5a5 5 0 1 0 6 6z" />
  </Icon>
);

export const IconSignOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 2.5h-6v11h6" />
    <path d="M7 8h6M11 5.5L13.5 8 11 10.5" />
  </Icon>
);

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4h11L9 9v4l-2-1V9z" />
  </Icon>
);

export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

/** Sort: an arrow that is also a set of ranked lines. */
export const IconSort = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 3v10M4 13l-1.5-2M4 13l1.5-2" />
    <path d="M8.5 4h5M8.5 8h3.5M8.5 12h2" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5L6.5 12 13 4.5" />
  </Icon>
);

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5L14 13H2z" />
    <path d="M8 6.5V9.5M8 11.2v.6" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 7v4M8 4.8v.6" />
  </Icon>
);

/** Recalculate: a circular arrow, as in "run the schedule again". */
export const IconRecalculate = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8a5 5 0 1 1-1.8-3.9" />
    <path d="M13.5 2v3h-3" />
  </Icon>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 11V2.5M5 5.5L8 2.5l3 3" />
    <path d="M2.5 10v3.5h11V10" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5V11M5 8l3 3 3-3" />
    <path d="M2.5 10v3.5h11V10" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4.5h11" />
    <path d="M5.5 4.5V2.5h5v2" />
    <path d="M4 4.5l.7 9.5h6.6l.7-9.5" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 2.5l3 3L6 13H3v-3z" />
    <path d="M9 4l3 3" />
  </Icon>
);

export const IconStar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5l1.7 3.6 3.8.5-2.8 2.7.7 3.9L8 11.4l-3.4 1.8.7-3.9L2.5 6.6l3.8-.5z" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 8h11M10 4.5L13.5 8 10 11.5" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Icon>
);

export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);

export const IconEyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3l10 10" />
    <path d="M6.6 3.4A7 7 0 0 1 8 3c4 0 6.5 5 6.5 5a11 11 0 0 1-1.7 2.2M4.9 4.9A10.6 10.6 0 0 0 1.5 8S4 13 8 13a6.8 6.8 0 0 0 3.1-.8" />
    <path d="M6.2 6.4a2 2 0 0 0 2.9 2.9" />
  </Icon>
);

export const IconClock = IconOverdue;
export const IconCheckCircle = IconCheck;
