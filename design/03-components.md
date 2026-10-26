# 03 · Components

Shared building blocks. Source for each is in `reference-code/src/components/ui/` and `components/charts/` — **copy those files**, don't redraw them. Class strings below are verbatim.

## Button (`Button.tsx`)

Base: `inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50`

| Variant | Classes | Use |
|---|---|---|
| `primary` (default) | `bg-brand-500 text-white hover:bg-brand-600` | the ONE main action per view ("New lead", "Save lead") |
| `secondary` | `bg-surface text-fg ring-1 ring-line hover:bg-surface-sunken` | Cancel, Filters, Change, Export |
| `ghost` | `text-fg-tertiary hover:bg-surface-muted hover:text-fg` | card header "+ Add" (`-mr-2 py-1 text-xs`) |
| `danger` | `bg-red-600 text-white hover:bg-red-700` | "Delete for good" only |

- Icon + label: `<Plus className="size-4" /> New lead`.
- Phones may hide the label: `className="max-sm:px-2.5"` + `<span className="max-sm:hidden">New client</span>`.
- Pending: disable and swap the label → `Saving…`, `Moving…`, `Deleting…` (no spinner, except on sign-in).
- Text-style button / link: `text-sm font-medium text-accent hover:text-accent-strong`.
- Dashed "add another": `<Button variant="secondary" className="w-full border-dashed">`.

## Badge / pills (`Badge.tsx`)

`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium` + tone: `neutral | brand | success | warning | danger | info` (see colors in 01-foundations).

**Status pill with dot** (record status):
`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium` + tone, dot `size-1.5 rounded-full` in the 500 shade. Each status in a flow gets its own hue (New sky → Assigned amber → Contacted violet → Meeting teal → Qualified emerald; Disqualified neutral grey).

**Small square chips** (services, tags, due): `inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-tertiary`. Due chip: overdue red, today amber, else neutral.

**Type pill** (activity type, with ring): `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset` + e.g. `bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30`. Mapping in `lib/activityIcons.ts`.

**Count pills**: in tabs `rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums bg-surface-muted text-fg-tertiary` (alert: `bg-brand-500 font-semibold text-white`).

## Card (`Card.tsx`)

```tsx
<div className="rounded-xl border border-line bg-surface shadow-sm">
<CardHeader title="Contacts (3)" action={<Button variant="ghost" className="-mr-2 py-1 text-xs"><Plus className="size-3.5" /> Add</Button>} />
// header: flex items-center justify-between border-b border-line-subtle px-5 py-3.5, title text-sm font-semibold
```
- Counts in titles: `"Contacts (3)"` or `"Needs attention · 5"`.
- Card list rows: `divide-y divide-line-subtle`, row `flex items-center gap-4 px-5 py-3.5 hover:bg-surface-sunken`.
- Header link: `text-sm font-medium text-accent` ("Calendar"), or quiet `text-xs font-medium text-fg-muted hover:text-accent` + `ChevronRight size-3.5` ("Report ›").

## Inputs (`Field.tsx`)

```ts
inputClass = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-60 aria-invalid:border-red-500'
selectClass = inputClass + ' select-chevron cursor-pointer pr-9'   // custom chevron utility in index.css
```
`<Field label hint error required>` wraps any control: label `mb-1.5 text-sm font-medium text-fg-secondary`, required `*` in `text-accent`, error `mt-1 text-xs text-red-600 dark:text-red-400` (replaces hint), hint `mt-1 text-xs text-fg-muted`.

- Search input = `inputClass + pl-9` with `Search` icon `absolute left-3 size-4 text-fg-subtle`.
- Textarea: `inputClass + min-h-20` (with a `0/200` counter where limited).
- Select first option: `Choose…`; filter selects: `"<Label>: any"`.
- Checkbox / radio: native with `accent-brand-500`.
- **Phone input** (`PhoneInput.tsx`): one box, country code segment on the left (`+20 ⌄`), tel input on the right.
- **Date/time** (`DateTimePicker.tsx`): custom popover (bottom sheet on phone) with quick chips (Today, Tomorrow, Next Sunday, In 1 week), month grid (**week starts Saturday**, Fri/Sat weekend), 15-min time slots with 9–17 highlighted, value applied only on **Done**. Display: "Sat, 3 Oct 2026 · 2:30 PM".
- **File drop** (`FileDrop.tsx`): dashed zone "Drag files here, or click to choose", per-file progress → "Saved" ✓ / "Not saved".

## Tabs & segmented controls — use the right one

| Kind | Look | When |
|---|---|---|
| **A. Underline tabs** | text tabs over `border-b border-line`, animated 2px red underline (`after:` pseudo), count pill | switching sub-lists of a page (All / Not now / Disqualified) |
| **B. Raised pill on muted track** | `inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line`; on = `bg-surface text-fg shadow-sm ring-1 ring-line` | view switch (Board/List), period (This cycle / 30 days / 90 days) |
| **C. Brand-filled** | `rounded-lg border border-line bg-surface p-0.5`; on = `bg-brand-500 text-white shadow-sm` | strong two-way switch (Clients / Contacts) |
| **D. Bordered, muted selection** | `inline-flex rounded-lg border border-line p-0.5`; on = `bg-surface-muted font-medium text-fg` | inside forms & menus (Inbound/Outbound, Light/Dark, All/Unread) |
| **E. Round chips** | `rounded-full border px-3 py-1.5 text-sm`; on = `border-brand-500 bg-accent-soft font-medium text-fg` | pick-one-of-many quick options (activity type, quick dates, markets) |
| **F. Option cards** | bordered rows/tiles; on = `border-brand-500 bg-accent-soft` | radio lists with descriptions, multi-select service grids |

Underline tab, verbatim:
```tsx
<div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
  <button role="tab" aria-selected={active} className={clsx(
    'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
    "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
    active ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg')}>
```

## Sheet — dialogs & drawers (`Sheet.tsx`)

The only modal component. Screenshots `25-sheet-new-lead.png`, `45-phone-new-lead-sheet.png`.

- `variant="dialog"` (default): centered, `sm:max-w-md` (`wide` → `max-w-3xl`, `wide="full"` → `max-w-6xl`), `sm:rounded-2xl sm:max-h-[90vh]`, `animate-pop-in`.
- `variant="drawer"`: slides from the right, `sm:max-w-lg h-full border-l`, `animate-slide-in-right`. Used for **create/edit forms** ("New lead").
- **Phones: both are full screen.**
- Backdrop `bg-black/50`. Rendered in a portal.
- Header: title `text-base font-semibold` + description `text-sm text-fg-muted` + ✕ (`X size-5`). Body scrolls. Footer `flex justify-end gap-2 border-t border-line-subtle px-5 pt-3` with safe-area padding: **Cancel (secondary) + main action (primary)**; a destructive secondary action goes left with `mr-auto`.
- **Does NOT close on backdrop click or Esc by default** (protects half-filled forms). Read-only panels pass `dismissible`.
- Focuses the first field on open (off for tap-opened phone sheets so the keyboard doesn't jump).
- Closing a dirty form asks first: a second small Sheet "Discard this lead?" / "Your changes will be lost." → "Keep editing" / "Discard".

## Confirm destructive — `DeleteDialog.tsx`

Red warning box (`rounded-lg bg-red-50 p-3 text-sm text-red-800` + `TriangleAlert`) "This can't be undone." + bullet list of what goes with it, then **type the record number/name to confirm**; button `danger` "Delete for good" → "Deleting…". Never `window.confirm`.

## Menus — `MenuPanel` (`Menu.tsx`)

See 02-app-shell §4. Also used for the record "⋯" **More actions** menu (`MoreMenu` in `RecordHeader.tsx`): trigger `size-9 rounded-lg ring-1 ring-line`, items with icon, danger items red, disabled items show the reason underneath in `text-xs text-fg-muted`.

## Page header (`PageHeader.tsx`)

`mb-6 flex items-start justify-between gap-3` → h1 `text-2xl font-semibold tracking-tight` + subtitle `mt-1 text-sm text-fg-muted`; actions right (`flex shrink-0 items-center gap-2`) at every width.

## Record header (`RecordHeader.tsx`) — top of every detail page

Avatar (`size-10`) · title `text-xl sm:text-2xl font-semibold` · status badges · meta row (`mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted`, each item icon `size-3.5` + text; clickable items; record ID copies on click → "Copied" for 1.5s) · actions on the right: **1 primary + optional secondary + "⋯" more**. Disabled actions explain why in a tooltip (`disabledHint`).

On phones the actions move into a **sticky bar above the bottom nav** (primary full-width + ⋯), and the page ends with `<RecordActionBarSpacer />`. Screenshot `42-phone-lead-detail.png`.

## Stage progress (`StageProgress.tsx`)

Chevron segments across the full width (`h-11 gap-1`, clip-path arrows). Done = `bg-brand-500 text-white` + ✓; current = `bg-brand-100 text-brand-800 font-semibold` with a moving shimmer; upcoming = `bg-surface-muted text-fg-muted`; paused amber, stopped red. Click a segment → popover with details. Phones: "Contacted · Stage 3 of 5 · 3d in stage" + thin segmented bar (`h-1.5 rounded-full`).

## Data table (`DataTable.tsx`)

- `table-fixed border-collapse text-sm` in `overflow-x-auto border border-line bg-surface`.
- Head `bg-surface-sunken`, `th px-4 py-2.5 text-xs font-medium text-fg-muted`.
- Sortable headers: hover shows `ChevronsUpDown`, sorted shows ↑/↓; click cycles asc → desc → default.
- **Resizable columns** (drag the edge, arrows keys, double-click resets), widths saved in localStorage.
- Rows `divide-y divide-line-subtle`, clickable rows `cursor-pointer hover:bg-surface-sunken`, cells `px-4 py-3 align-middle`, rows fade in with an 18ms stagger.
- `TableSkeleton` for first load.
- Primary cell = avatar + name (`font-medium text-fg hover:underline`, a real `<Link>`) + second line `text-xs text-fg-muted` ("CEO · Company").
- Numbers `tabular-nums`, empty values `—`.
- **On phones a table becomes a list** (see 04-page-patterns).

## Pagination (`Pagination.tsx`)

"Showing **1–20** of **1,234**" left; right: prev/next `size-9 rounded-lg border border-line`, numbers with gaps `1 … 4 5 6 … 50`, current `bg-brand-500 text-white`, "20 / page" select (10/20/50). Phones: "Page 3 of 50".

## Sort (`SortSelect.tsx`)

One select: friendly presets first ("Needs attention first", "Newest first", "Highest value", "Closing soonest"), then `<optgroup label="By column">` with every column both ways ("Lead: A to Z"). Synced with table header sorting.

## Avatars

- Initials (2 letters, strips "Dr."/"Eng."), `rounded-full font-semibold`, sizes `size-6 text-[10px]` / `size-9 text-xs` / `size-10 text-sm`.
- Color from a hash of the name over 6 tones: `bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200` (+ violet, emerald, amber, rose, teal).
- Current user in the top bar: dark `bg-ink-800 text-white`.
- Online dot: `absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-emerald-500`.

## Progress

- Bar (`ProgressBar.tsx`): track `h-2 rounded-full bg-surface-muted`, fill brand / emerald / amber.
- Ring (`ProgressRing.tsx`): 44px SVG, stroke 5, `var(--chart-primary)`, draws in with `animate-ring`.

## Files

- `UploadGroup` / `UploadList`: accordion per upload with stacked thumbnails, photo collage, colored file-type tiles (PDF red, DOC blue, XLS green, PPT orange, ZIP amber).
- `FileViewer`: full-screen dark viewer (`bg-black/85`), prev/next, zoom, PDF/image/text/CSV previews, Download, Esc closes.

## Flags

`Flags.tsx` — round SVG flags (Egypt, Saudi). Used instead of emoji (emoji flags don't render on Windows).

## Charts (`components/charts/*`)

Hand-made SVG/CSS charts, **no chart library**. All wrapped in `ChartCard` (Card + title/subtitle + action + chart⇄table toggle + legend).

| Component | What |
|---|---|
| `StatCard` (pages/home) | KPI tile: label, big number with `CountUp`, delta ↗ green / ↘ red "vs last cycle", icon chip (`bg-accent-soft text-accent`, red when alerting) or `ProgressRing`, `Sparkline` at the bottom |
| `Sparkline` | tiny area line in chart-primary |
| `LineChart` | SVG lines that draw in, dashed target line, crosshair + tooltip, keyboard accessible |
| `ColumnChart` | stacked columns that grow up |
| `BarList` | horizontal ranked bars with values and optional target marker |
| `ChartTooltip` | `rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg` |
| `CountUp` | numbers count up over 700ms |

Colors: single series = `chart-primary` (Spark red), comparison = `chart-context` (grey), ordered steps = `chart-step-1..5`. Numbers on axes compact ("1.2K"), dates "3 Oct".
