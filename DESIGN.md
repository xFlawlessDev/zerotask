# Zero Task: design direction

> Honest provenance: this direction was written by the agent at the owner's request, with the
> owner's answers to three questions (mood, default theme, accent). Agent-authored direction tends
> toward default AI taste, which is the slop the filter exists to catch. Treat this file as a
> starting point the owner can overwrite, not as a finished brand.

## What the product is

Zero Task is an internal project-delivery workspace. A delivery team plans a project as a
dependency graph of tasks, runs critical-path scheduling over that graph, tracks who is working on
what through the week, and gates task completion behind review and document handover.

The people using it are planners, leads, and department staff. They use it for hours at a time,
several times a day. They read numbers, compare dates, and scan lists. Nobody is here to be
impressed; they are here to find out what is late.

## Dial

```
ENERGY 1 / RHYTHM 2 / MOTION 1
```

- **ENERGY 1** because this is a working surface. It says hello by being immediately legible, not
  by being loud. A dashboard that shouts competes with the data.
- **RHYTHM 2** because page types genuinely differ: a scan-heavy board, a dense task table, a
  two-dimensional Gantt, a form. They must not be forced into one composition, but they share a
  shell and a rhythm so the app reads as one tool.
- **MOTION 1** because movement in a scheduling tool is noise. Animation appears only where it
  explains a state change (a row entering review, a task moving between columns), never on load.

## Identity motif: the ledger rule

One device, repeated: **a single hairline rule that separates structure**, and **tabular numerals
everywhere a number appears**.

- Section headers, table rows, card headers, and panel splits are divided by a 1px rule, not by
  shadow or by floating cards. The interface reads like a well-set schedule book.
- Every date, duration, float, percentage, and hour is set in tabular figures so columns of numbers
  line up and two dates can be compared by eye without reading them.
- The motif is structural, not decorative: the rule marks a real boundary between two things. It is
  never page texture, never a background grid.

Why this motif: the product's actual subject is commitments in time. A ledger is the oldest
interface for that subject, and it gives a dense tool a visual spine that costs no pixels.

## Palette

Two cores plus one accent. Neutrals are the paper, ink is the text, one blue is the accent.

| Token        | Light     | Dark      | Role                                        |
| ------------ | --------- | --------- | ------------------------------------------- |
| `canvas`     | `#F4F4F0` | `#0E1114` | app background, the paper                   |
| `surface`    | `#FFFFFF` | `#16191D` | panels and rows that hold content           |
| `surface-sunk` | `#EDEDE7` | `#0A0C0F` | wells: table headers, gutters, empty states |
| `ink`        | `#14181D` | `#E9E9E3` | primary text                                |
| `ink-muted`  | `#545B63` | `#A2A9B1` | secondary text, labels, metadata            |
| `ink-faint`  | `#767D85` | `#8A9199` | disabled and placeholder (never body copy)  |
| `rule`       | `#D8D8D0` | `#2A2F35` | the hairline                                |
| `accent`     | `#17457F` | `#8FB4E8` | one accent: primary actions, active state, focus |
| `accent-wash`| `#E8EEF7` | `#1B2431` | accent background for selection and active nav |
| `danger`     | `#9A2B1E` | `#F0917F` | overdue, blocked, destructive              |
| `caution`    | `#7A4A00` | `#E3B661` | at risk, awaiting review                   |
| `settled`    | `#2A5B41` | `#7FC49B` | completed, approved                        |

Why these: the ground is a warm neutral so that long sessions do not glare the way pure white does,
and so that white surfaces separate from the page without needing shadow. The accent is deep,
desaturated blue: it reads as ink rather than as a highlight, it holds white text at AA, and it is
far enough from the "blue to purple gradient" default that it cannot be mistaken for it. The status
trio is deliberately dark and desaturated so status text is readable as text, not as a colored chip.

Contrast is computed, not eyeballed. Every pairing in the theme is checked against WCAG AA and the
measured ratios are recorded in `apps/web/src/styles/tokens.css`.

## Typography

| Role      | Family                                   | Reason                                                                                                                                                                    |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI text   | **Public Sans** (variable, self-hosted)  | Drawn for dense government interfaces: tall x-height, unambiguous `1`/`l`/`I`, generous tabular figures. Neutral voice, so the numbers carry the emphasis.                |
| Code, codes, dates, dependency notation | **IBM Plex Mono** | Task codes (`ZR-114`), dependency notation (`FS+2`), and dates appear inside prose constantly; a mono with a true slashed zero keeps them distinguishable from surrounding text. |

Type scale (px, at 16px root): 11 label, 12 meta, 13 body-compact, 14 body, 16 section, 20 page
title, 28 hero number. Body copy is 14px because the density requires it; the line height stays at
1.5 so 14px remains readable. Nothing on screen is smaller than 11px, and 11px is reserved for
uppercase-free labels adjacent to a control.

Fonts are self-hosted from `@fontsource` packages. No third-party font CDN: a render-blocking
third-party request on every load is a cost this tool does not need to pay.

## Layout

- **One shell.** A fixed left rail (240px, 56px collapsed) for navigation, a 48px top bar for
  context and search, and one scroll region. The rail never scrolls away and never reflows into a
  drawer above 1024px.
- **Two densities.** `comfortable` for forms and reading surfaces, `compact` for tables, boards, and
  the Gantt. Compact rows are 32px; comfortable rows are 40px. The density is a user setting, not a
  per-page accident.
- **Breakpoints.** 640, 768, 1024, 1280. Below 1024 the rail becomes a drawer. Below 768 tables
  become stacked records, the Gantt becomes a horizontal scroll region with a pinned task column,
  and the board becomes a single-column swipe list. Below 640 every tap target is at least 44px.
- **Focus is content.** Every page opens with its title, its state summary, and its one primary
  action. Filters and secondary controls sit below the primary content, not above it.

## Component rules

- **Radius.** 4px for controls, 6px for panels, 2px for status marks. Nothing is a pill. Radius is
  not uniform, because a control and a panel are different things.
- **Shadow.** Panels sit flat on the canvas and are separated by `rule`. Shadow appears in exactly
  two places: menus and dialogs, because they genuinely float above the page. That is the whole
  elevation system.
- **No gradients** anywhere. Not for backgrounds, not for buttons, not for charts. A gradient has
  no job in a tool whose subject is measurement.
- **Icons.** A hand-built 16px set drawn on a 16-unit grid at 1.5px stroke, in
  `apps/web/src/components/icon/`. Each glyph depicts the literal object it names (a calendar, a
  chain link for a dependency, a bracket for a milestone). No icon library, because a recognizable
  library look is the fastest way to look generated.
- **Status is never color alone.** Every status renders a mark (a filled, half-filled, or hollow
  square), the status word, and the color. The mark survives color blindness and forced-colors mode.
- **Numbers are right-aligned and tabular** in every table. Durations carry their unit (`4d`), and
  percentages carry `%`, so a column never requires a header to be read.

## What this direction refuses

- Dashboards made of identical metric cards. A number earns a card only if it is the page's subject.
- A sidebar of collapsible sections holding one item each.
- Charts used as decoration. The Gantt is the only chart on the planning pages, because time is
  two-dimensional and a bar chart cannot show a dependency.
- Empty states that say "No data". Every empty state names what would appear, why it is empty, and
  the action that creates the first record.

## Accessibility floor

- WCAG AA on every text pairing, computed.
- Every interactive element reachable by keyboard, with a 2px `accent` focus ring at 2px offset.
- Dialogs trap focus and close on Escape.
- `prefers-reduced-motion: reduce` disables every transition longer than a color change.
- Both themes are first class. A component that works only in light is unfinished.
