# 01 · Foundations — brand, tokens, type, motion

Everything here is copied from Spark CRM's `src/index.css` (full file in `reference-code/src/index.css`). **Copy that file as-is into Spark Flow** — it is the single source of truth for colors, dark mode and animations.

## Stack (match it exactly)

| Piece | Version / choice |
|---|---|
| Framework | React 19 + TypeScript, Vite |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`), tokens in `@theme` inside `index.css` — no `tailwind.config.js` |
| Icons | **lucide-react** only (no other icon sets, no emoji in UI) |
| Class merging | `clsx` |
| Data | TanStack Query v5 (drives the top loading bar — see 02-app-shell) |
| Routing | React Router (`createBrowserRouter`, pages lazy-loaded) |
| Font | **Inter** 400/500/600/700 from Google Fonts |

## Brand colors — `brand-*` (Spark red)

`brand-500` **#B72126** is the logo red. `brand-900` is the maroon.

| Token | Hex | Used for |
|---|---|---|
| brand-50 | #fcf1f1 | |
| brand-100 | #f9e0e1 | |
| brand-200 | #f4c1c2 | |
| brand-300 | #eea1a4 | |
| brand-400 | #dd4449 | active sidebar icon, loading bar in dark mode |
| **brand-500** | **#b72126** | primary buttons, focus rings, badges/counters, loading bar, unread dots |
| brand-600 | #9e1d21 | primary button hover |
| brand-700 | #88191d | |
| brand-800 | #711518 | |
| brand-900 | #671416 | |

## Ink — `ink-*` (neutral dark greys for the sidebar & dark surfaces)

ink-50 #f4f4f5 · ink-100 #e4e4e7 · ink-200 #d4d4d8 · ink-700 #3f3f46 · ink-800 #2a2a2d · **ink-900 #1c1c1e (sidebar + desktop frame)** · ink-950 #141415

## Semantic tokens — ALWAYS use these, never raw `slate-*`/`white`

They swap automatically in dark mode (class `dark` on `<html>`).

| Tailwind class | Light | Dark | Meaning |
|---|---|---|---|
| `bg-canvas` | #f8fafc | #141414 | page background (behind cards) |
| `bg-surface` | #ffffff | #1c1c1d | cards, top bar, sheets, menus |
| `bg-surface-sunken` | #f8fafc | #171718 | inset areas, search input, table header |
| `bg-surface-muted` | #f1f5f9 | #262628 | hover rows, selected segment, neutral badge |
| `bg-surface-strong` | #e2e8f0 | #303033 | skeleton blocks |
| `border-line` | #e2e8f0 | #2c2c2f | default borders & rings |
| `border-line-subtle` | #f1f5f9 | #232325 | dividers inside cards (header bottom, list rows) |
| `border-line-strong` | #cbd5e1 | #3d3d41 | hover ring on round buttons |
| `text-fg` | #0f172a | #ececed | headings, primary text |
| `text-fg-secondary` | #334155 | #cdcdd0 | body text, labels, menu items |
| `text-fg-tertiary` | #475569 | #b0b0b5 | icon buttons |
| `text-fg-muted` | #64748b | #929297 | subtitles, meta, timestamps, section labels |
| `text-fg-subtle` | #94a3b8 | #6c6c71 | placeholders, disabled |
| `text-accent` | #9e1d21 | #f0979a | links, text buttons, check marks, "*" required |
| `text-accent-strong` | #88191d | #f6bfc1 | link hover |
| `bg-accent-soft` | #fcf1f1 | #351d1e | selected/highlight backgrounds, focus ring color, unread row |
| `border-accent-line` | #f4c1c2 | #5a2a2c | border on accent-soft areas |

### Status colors (Tailwind defaults, with dark variants)

Pattern for every status pill / icon chip:
`bg-{c}-50 text-{c}-700 dark:bg-{c}-500/15 dark:text-{c}-300`

| Tone | c | Meaning |
|---|---|---|
| success | emerald | done, paid, won, approved |
| warning | amber | waiting, stuck, due soon |
| danger | red | overdue, lost, errors, delete |
| info | sky | assigned, today, informational |
| special | violet | approvals / requests |
| neutral | `bg-surface-muted text-fg-secondary` | default |
| brand | `bg-ink-50 text-ink-800 dark:bg-white/10 dark:text-fg-secondary` | |

### Chart colors

`chart-primary` (Spark red, single series) · `chart-context` (grey for comparison) · `chart-egypt` #2a78d6 · `chart-saudi` #eb6834 · `chart-grid` · `chart-axis` · `chart-step-1…5` (light→dark red for funnels/stages; in dark mode it reverses so later steps are brighter). Values are in `index.css`.

## Dark mode

- Class-based: `@custom-variant dark (&:where(.dark, .dark *));`
- **Default is light.** Only two choices: Light / Dark (no "system").
- Stored in `localStorage['spark-crm.theme']` and (when signed in) saved on the user's account.
- An inline script in `index.html` applies the class **before first paint** (no flash) and sets `<meta name="theme-color">` to `#ffffff` / `#1c1c1d`. Copy `reference-code/index.html`.
- Because every screen uses semantic tokens, dark mode is "free". Only status colors need explicit `dark:` variants.
- See `screenshots/02-home-dark.png`, `04-leads-list-dark.png`, `06-lead-detail-dark.png`.

## Typography

Font: Inter, `antialiased`. Body background `bg-canvas text-fg`.

| Role | Classes |
|---|---|
| Page title (h1) | `text-2xl font-semibold tracking-tight text-fg` |
| Record title (detail page) | `text-xl sm:text-2xl font-semibold tracking-tight` |
| Page subtitle | `mt-1 text-sm text-fg-muted` |
| Card title (h2) | `text-sm font-semibold text-fg` |
| Sheet/dialog title | `text-base font-semibold text-fg` |
| Body | `text-sm text-fg-secondary` |
| Meta / hints | `text-xs text-fg-muted` |
| Section label (menus, sidebar groups) | `text-[11px] font-semibold uppercase tracking-wider text-fg-muted` (sidebar: `text-neutral-500`) |
| Field label | `mb-1.5 text-sm font-medium text-fg-secondary` |
| Tiny counters | `text-[10px]` / `text-[11px] font-semibold` |
| Big KPI number | `text-2xl`–`text-3xl font-semibold` |

The app is basically all `text-sm` (14px). Use weight (500/600) and color (fg vs fg-muted) for hierarchy — not big size jumps.

## Shape, spacing, elevation

| Thing | Value |
|---|---|
| Buttons, inputs, menu items | `rounded-lg` |
| Cards, menus, dropdowns | `rounded-xl` |
| Dialogs, bottom sheets, desktop content panel | `rounded-2xl` |
| Pills, avatars, round icon buttons | `rounded-full` |
| Card | `rounded-xl border border-line bg-surface shadow-sm` |
| Menus / popovers | `border border-line bg-surface shadow-xl` |
| Dialog | `shadow-xl`, backdrop `bg-black/50` |
| Page padding | `px-4 md:px-6 xl:px-8`, `pt-6`, bottom `pb-24` (phones, room for bottom nav) / `lg:pb-10` |
| Card inner padding | `px-5 py-3.5` (header), `p-5` body |
| Gap between page sections | `gap-4`–`gap-6`, page header `mb-6` |

## Motion

All animation is wrapped in `motion-safe:` so reduced-motion users get none.

| Name | Spec | Used for |
|---|---|---|
| `animate-fade-up` | 0.32s, from opacity 0 / translateY(6px) | phone bottom sheets, page help on phone |
| `animate-fade-in` | 0.18s ease-out | backdrops, full-screen phone search |
| `animate-slide-in-right` | 0.28s, from translateX(24px) | drawers, help panel |
| `animate-pop-in` | 0.2s, from scale(.97) translateY(4px) | dialogs, desktop dropdowns |
| `animate-grow-x` / `grow-y` | 0.6s | bars growing from baseline |
| `animate-draw` | 0.9s | line charts drawing in |
| `animate-ring` | 0.9s | progress rings |
| `animate-shimmer` | 2.4s infinite | shimmer highlight |
| `animate-loading-bar` | 12s, scaleX 0 → 0.92, fast-then-slow | top loading bar |
| `animate-drift` / `animate-float` | 14s / 6s infinite | sign-in background glow & floating card |
| `animate-pulse` (Tailwind) | | skeleton placeholders |

Easing used everywhere: `cubic-bezier(0.2, 0.7, 0.2, 1)`.

## Logos & icons (in `assets/`)

| File | Use |
|---|---|
| `spark-logo-white.png` | sidebar (expanded), `h-7 w-auto`, followed by a divider + product name |
| `spark-mark-white.png` | sidebar collapsed, `h-4` |
| `spark-logo.png`, `spark-mark.png` | on light backgrounds (sign-in) |
| `app-icon.svg`, `favicon.svg`, `icon-*.png`, `apple-touch-icon.png` | PWA / favicon (red chevron on white) |

Sidebar logo lockup (replace `CRM` with `FLOW` for Spark Flow):

```tsx
<img src="/spark-logo-white.png" alt="Spark Systems" className="h-7 w-auto" />
<span className="border-l border-white/15 pl-3 text-[13px] font-semibold tracking-[0.2em] text-neutral-400">CRM</span>
```

Icons: lucide, usually `size-4` in buttons/menus, `size-[18px]` in sidebar and round top-bar buttons, `size-5` in mobile nav and close buttons, `size-3.5` in meta rows.

## Phone / PWA feel (from `index.html` + `index.css`)

- Viewport: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`; iOS pinch blocked via `gesturestart` preventDefault.
- `touch-action: manipulation; -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none; text-size-adjust: 100%`.
- Installable: `manifest.webmanifest` (standalone, portrait), apple-mobile-web-app tags.
- Respect safe areas: `pb-[env(safe-area-inset-bottom)]`, `pt-[calc(0.5rem+env(safe-area-inset-top))]`.
- Phone inputs use `text-base` (16px) where iOS would otherwise zoom.
