# 05 · UX rules, behavior & microcopy

The "feel" of Spark CRM. These are the decisions behind the screens — follow them so Spark Flow *behaves* the same, not just looks the same.

## Behavior

1. **Never a full-page spinner.** The 2px red top loading bar shows any loading or saving (after 200ms). First loads show skeletons shaped like the content; refetches just dim the old content to 60%.
2. **No page refresh ever needed.** After any save, everything on screen reloads (lists, counts, badges, bell). The dialog closes only after the fresh data is in, so the user sees the result immediately.
3. **No toasts.** Success = the sheet closes and the change is visible. Small inline "Saved" (emerald) only where you edit in place. Warnings = amber inline box; errors = red text near the cause.
4. **Forms don't get lost.** Sheets don't close on outside click / Esc; closing a changed form asks "Discard …?". Destructive deletes require typing the record ID.
5. **Explain, don't hide.** A disabled action stays visible and its tooltip / menu line says why ("Only Management can delete").
6. **URL is the state.** Tabs, search, filters, sort, page and "new" dialogs are in the query string. Back works; links can be shared.
7. **Attention first.** Lists default to "Needs attention first". Overdue = red, today = sky/amber, missing next step = amber. Every list page starts with attention tiles that are one-click filters.
8. **One primary action per screen** (the red button). Everything else is secondary, ghost, text link or inside "⋯".
9. **Role-aware.** Menu items, home page, search and actions depend on the user's role; things you can't use aren't shown (or are disabled with a reason).
10. **Market-aware.** A market switcher (flag) in the top bar scopes the whole app; money shows in the market currency ("EGP 18.3M", "SAR 50,000").
11. **Keyboard friendly.** Ctrl/⌘+K or / → search; arrows + Enter in search results; Esc closes menus and returns focus; Tab is trapped in menus.
12. **Help is one click away.** The "?" in the top bar opens the guide section for the current page beside it.
13. **Data freshness**: cached for 30s when you come back to a page; notifications poll every 2 min silently.

## Phones (the app is used heavily on phones)

- Breakpoints: phone `< 640` (sm), tablet `md 768`, desktop sidebar from `lg 1024`, wide `xl 1280`, help-beside-page `2xl 1536`.
- Bottom tab bar with 4 key sections + More (drawer with the full sidebar).
- Menus become **bottom sheets**; dialogs and drawers become **full screen**; the date picker becomes a bottom sheet.
- Tables become **lists**; boards become **swipeable, snapping columns**.
- Record pages pin their main action above the bottom nav.
- Search opens full screen.
- Respect safe areas (notch & home bar). No zoom, no tap flash, no pull-to-refresh bounce. Inputs ≥16px where iOS would zoom.
- Installable as an app (manifest + apple tags).

## Microcopy

- **Language: English**, plain and friendly, second person ("Your leads.", "You’re all caught up.").
- **Sentence case** everywhere: "New lead", "Add update", "Clear all", "Save lead". Capitalize only names and roles.
- **Buttons start with a verb**: Save lead, Add update, Plan next step, Delete for good. Compound actions use a middle dot: "Not now · follow up later".
- **Pending labels**: "Saving…", "Loading…", "Searching…", "Deleting…", "Signing in…" — always the real ellipsis character `…`, never `...`.
- **Hints, errors and empty states are full sentences with a period**: "Pick at least one service.", "It may have been removed, or the link is wrong.", "Nothing waiting. Every lead has a salesperson."
- **Separators**: ` · ` (middle dot) between meta parts: "Omar Khaled · 3h ago", "EGP 1.2M · 40% chance", "Lead · Contacted".
- **Empty value** `—` (em dash); **count still loading** `–` (en dash).
- **Placeholders** start with "e.g.": "e.g. IT Manager". Selects start with "Choose…". Filter selects: "Status: any".
- Optional fields: "(optional)" in muted text. Required: red `*`.
- Use curly quotes and apostrophes in new copy (“ ” ’).
- Titles with counts: "Contacts (3)" in card headers, "Needs attention · 5" on the dashboard.

## Formatting (copy `lib/format.ts`)

| What | Format |
|---|---|
| Money | `EGP 1,250,000` (no decimals); compact `EGP 1.2M`, `SAR 350K` |
| Percent | `40%` |
| Relative time | `just now`, `25 min ago`, `3h ago`, `2d ago` |
| Due | `Today 2:00 PM`, `Tomorrow 10:00 AM`, `Sat 3 Oct, 2:00 PM`, `Overdue 3h`, `Overdue 2d` |
| Date | `3 Oct 2026` (en-GB) |
| Time | `9:30 AM` (12-hour) |
| Age in stage | `12d`, `3mo` |
| Durations | `45 min`, `3h 20m` |
| File size | `1.2 MB`, `340 KB` |
| Big counts | `1,234` |
| Numbers in columns | always `tabular-nums` |

Week starts **Saturday**; Friday & Saturday are the weekend (Egypt / KSA).

## Accessibility

- Semantic roles everywhere: `role="menu"/"menuitem"/"menuitemradio"`, `tablist/tab`, `combobox/listbox`, `dialog aria-modal`, `progressbar`, `aria-pressed` on toggles, `aria-expanded` on triggers.
- Every icon-only button has `aria-label` and `title`.
- Visible focus: `focus-visible:ring-2 ring-brand-500` (round buttons) or `outline-2 outline-offset-2`.
- All animation behind `motion-safe:`; CountUp and charts are instant with reduced motion.
- Status is never color alone — always text too ("Overdue 3d").

## Do / Don't

| Do | Don't |
|---|---|
| `bg-surface`, `text-fg-muted`, `border-line` | `bg-white`, `text-gray-500`, `border-slate-200` (breaks dark mode) |
| lucide icons, `size-4` | other icon packs, emoji |
| Spark red for primary/active/focus/counters | red for decoration or large areas |
| soft status pills `bg-x-50 text-x-700` | solid saturated status blocks |
| `rounded-lg` controls, `rounded-xl` cards, `rounded-2xl` dialogs | mixing other radii |
| `text-sm` body, hierarchy by weight/grey | many font sizes |
| Sheet with Cancel + primary in the footer | `window.confirm`, `alert()` |
| top loading bar + skeletons | spinners, overlays blocking the page |
| close the dialog and show the result | success toasts |
| `…`, ` · `, `—` | `...`, `|`, `-` / `N/A` |
