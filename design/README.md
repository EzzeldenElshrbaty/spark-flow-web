# Spark Flow — Design Kit (from Spark CRM)

This folder lets you build **Spark Flow** with exactly the same UI and UX as **Spark CRM**, so the two feel like one product. Everything here was extracted from the live Spark CRM frontend (Oct 2026).

## What's inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | **Put this at the root of the Spark Flow repo.** Claude reads it automatically and follows the rules. |
| `01-foundations.md` | Stack, colors & tokens, dark mode, typography, spacing, motion, logos |
| `02-app-shell.md` | Layout, sidebar, top bar, dropdown menus, search, notifications, mobile nav, help panel, **the loader** |
| `03-components.md` | Buttons, badges, cards, inputs, sheets/dialogs, tabs & segmented controls, tables, record header, charts… |
| `04-page-patterns.md` | How list pages, detail pages, dashboards, boards, forms and settings are put together |
| `05-ux-rules.md` | Behavior rules, microcopy & tone, phone rules, accessibility, "do / don't" |
| `screenshots/` | 34 reference screenshots — desktop & phone, light & dark, menus open |
| `reference-code/` | The real source files: `index.css`, `index.html`, `components/ui/*`, `components/charts/*`, `layout/*`, helpers |
| `assets/` | Spark logos (white + color), app icons, favicon, manifest |

## How to use it with Claude (Claude Code)

1. Create the Spark Flow project (React 19 + Vite + TypeScript + Tailwind v4 — see `01-foundations.md`).
2. Copy this whole folder into the repo as `design/` (or `docs/design/`).
3. Copy `CLAUDE.md` to the **repo root** (and fix the paths in it if you used a different folder name).
4. Copy `assets/*` into `public/`.
5. Start Claude with something like:

> Read `CLAUDE.md` and everything in `design/`, look at the screenshots, then set up the app shell (layout, sidebar, top bar, menus, loading bar, theme) by copying the reference code in `design/reference-code/`. Rename "CRM" to "FLOW" in the logo lockup. Then build the first page: …

6. For every new screen, tell Claude which Spark CRM screen it should resemble (e.g. "a list page like Leads — see `screenshots/03-leads-list-light.png`").

## The 10 things that make it "look like Spark"

1. Dark ink sidebar, content floating as a **rounded panel** on desktop.
2. Spark red `#B72126` only for primary actions, active states, counters and focus — everything else is neutral greys.
3. Inter, almost everything `text-sm`; hierarchy by weight and grey level.
4. Semantic color tokens (`bg-surface`, `text-fg-muted`, `border-line`…) so **light and dark** both work.
5. Round 36px icon buttons in the top bar; avatar with initials.
6. One `MenuPanel`: dropdown on desktop, **bottom sheet on phones**.
7. Thin red **top loading bar** + pulse skeletons — never spinners.
8. Forms in `Sheet` dialogs/drawers that don't close by accident; full screen on phones.
9. Status = soft colored pill (`bg-x-50 text-x-700`) — never solid colored blocks.
10. Short, plain, friendly English microcopy ("Save lead", "Saving…", "You’re all caught up.").
