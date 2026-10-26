# Scaffold Spark Flow app from the design kit — 2026-10-26 — scaffold

Why: `Spark-Flow-Design-Kit/reference-code/` couldn't run. It's 84 files copied out of Spark CRM that import 84 modules
never included (`api/*`, `mocks/*`, `lib/useRole|useAuth|useMarket`, ~35 pages), with no `tsconfig.json`, root-absolute
imports in `main.tsx`, and a CRM-backend guard in `vite.config.ts`. The kit README says to copy it into a Spark Flow repo.

## Plan

- [x] Scaffold `spark-flow-web/`: package.json (CRM versions), tsconfig trio, vite.config.ts, `public/` from kit assets
- [x] index.html + manifest: Spark Flow name, theme key `spark-flow.theme`
- [x] Copy as-is: `index.css`, `components/ui/*`, `components/charts/*`, `lib/{format,loading,useTheme,sorting,fileTypes}`
- [x] `lib/ThemeProvider.tsx`: storage key `spark-flow.theme`
- [x] Stand-ins: `lib/roles.ts`, `lib/useRole.ts` (sample Management user), `api/notifications.ts` (empty list)
- [x] Layout adapted: AppLayout, Sidebar (logo `FLOW`), TopBar, MobileNav, UserMenu, NotificationsMenu, GlobalSearch + searchShortcuts (pages and actions only)
- [x] Pages: HomePage, PlaceholderPage (Settings)
- [x] main.tsx / router.tsx / navigation.ts (Home + Settings)
- [x] Kit copied to `design/`, `CLAUDE.md` at root
- [x] `npm install`

## Review — scaffold

- `npm run build`: passes (tsc + vite). CSS 52 kB.
- `npm run lint`: clean.
- Playwright on `npm run dev`:
  - 1440px light and dark: dark sidebar with Spark | FLOW, floating rounded panel, top bar search, bell, avatar.
  - Avatar menu → Dark: applied, saved as `spark-flow.theme`, kept after reload, `theme-color` `#1c1c1d`.
  - Search "set" → Settings hit, Enter opens `/settings`.
  - 390px: bottom bar (Home + More), drawer, bell opens as bottom sheet, no horizontal scroll.
  - Console: no errors or warnings.
- Found while verifying: Tailwind v4 scans the whole project, so `design/reference-code` CRM classes doubled the CSS
  (104 kB). Fixed with `@source not '../design'` in `index.css` (the one change to that file). oxlint likewise
  ignores `design/` via `.oxlintrc.json`.

## Left out on purpose — scaffold (copy from `design/reference-code` when the feature arrives)

- Sign-in, View as, change password (needs auth + API): ActivityTracker, ViewingAsBanner, ChangePasswordSheet, lib/api.
- Markets (CRM-only): MarketSwitcher, PhoneInput, lib/phone, Flags.
- Page help panel (needs a guide): PageHelpPanel, PageHelpButton, pageHelpTopics, usePageHelp.
- Uploads and Excel export (need API): FileDrop, UploadGroup, ExportLink.
- Record search in GlobalSearch (needs API).

## Next

- Spark Flow's real sections in `src/navigation.ts`, with their pages.
- Auth + API layer (`lib/api.ts`), then replace the `useRole` stand-in and save the theme on the account.

---

# Phase 1 + 2 — shell and backend-ready data layer — 2026-10-26

Spec: `docs/superpowers/specs/2026-10-26-spark-flow-shell-data-layer-design.md`
Plan: `docs/superpowers/plans/2026-10-26-spark-flow-shell-data-layer.md` (execution: subagent-driven)

## Plan

- [x] Task 0 — Git baseline
- [x] Task 1 — Tooling: `@/` alias, dev proxy, prod guard, Vitest, Zustand
- [x] Task 2 — RTL readiness (logical classes, `dir`, `slide-in-end`)
- [x] Task 3 — Contracts, `ApiError`, mock database
- [x] Task 4 — Seed data
- [x] Task 5 — Realtime interface and mock hub
- [x] Task 6 — Mock API
- [x] Task 7 — `lib/api.ts`, query keys, hooks
- [x] Task 8 — UI store, `RealtimeBridge`, persona from `useMe`
- [x] Task 9 — Routes, landing redirect, sidebar groups, switcher, search, settings
- [x] Task 10 — Channel and project pages, inspector
- [x] Task 11 — CLAUDE.md rules, gates, Playwright run, review

## Review — Phase 1 + 2

### Gates

- `npm test`: 17 files, 135 tests, all pass.
- `npm run build:prototype`: passes (`tsc -b` + `vite build --mode prototype`), main chunk 324.51 kB (100.25 kB gzip).
- `npm run lint`: exit 0, no warnings.
- `npm run build` (no env): fails on purpose with "Production build needs VITE_BACKEND=on and VITE_API_URL." The guard works.

### Browser checks (preview pane on `npm run dev`)

1. 1440 light: `/` → `/w/engineering/c/c-general`. Sidebar groups CHANNELS / DIRECT MESSAGES / PROJECTS. `#frontend-dev` unread pill 3, cleared after opening (markRead). ✓
2. Workspace switcher: check on the current workspace; Spark Design → `/w/design/c/c-design`, sidebar swaps; `/w/nope` → `/` → last workspace. ✓
3. Nexus Core → Board (5 tinted columns, Board | Backlog control); Backlog grouped Active / Planned / No sprint. `/p/NEX` and `/p/NEX/timeline` → `/board`. ✓
4. `?ticket=nex-101` → inspector beside the content at xl, `TICKET · NEX-101`, all fields. `Escape` closes and clears the param. `?ticket=NOPE-1` → "This ticket doesn't exist or was removed." `/p/NOPE/board` → project 404. ✓
5. `?thread=m-g04` → thread inspector docked beside at 1440. The 1100px slide-over was not separately captured.
6. Stale saved place (`/c/c-nope`) then `/` → `#general`. Settings → Reset demo data → `/w/engineering/c/c-general`; `/` again → `#general`. ✓
7. Second tab: `window.__sparkFlowDev.sendMessage` in tab A → tab B on `#backend` shows it without a refresh. Tried 3 times; on the 2nd and 3rd attempts the message appeared live and persisted in storage. ✓
   - ⚠️ On the 1st attempt, right after the second tab was created, the message was written (`sendMessage` returned it with `linkedTicketKeys: ["NEX-101"]`) but was later missing from `localStorage`; a later write did not include it. The same sequence (fresh tab + reload, then send) did not reproduce it. Cause unknown; see Known follow-ups.
8. Dark mode: 375px dark channel page legible. Dark at 1440 was not separately captured for the board and inspector.
9. 375px: bottom bar Chat · Projects · Search · More. No horizontal page scroll on channel, board and backlog (html scrollWidth 375). The inspector bottom sheet renders; its fade-up animation can't be observed because the preview pane freezes `document.timeline` at 0 (environment artifact).
10. `dir="rtl"`: sidebar measures at x 1184–1440 (right side). Verified by measurement, since the screenshot tool shows stale frames.
11. Console: no errors or warnings on any page checked. ✓

Added after the Task 11 review (same preview, 1440 light):

- Check 2: Engineering `#backend` → Design → `/w/engineering` lands on `/w/engineering/c/c-backend` (last place) ✓
- Check 3: after opening Backlog, the sidebar Nexus Core link is `/w/engineering/p/NEX/backlog` (choice remembered) ✓
- Check 4: `?ticket=NEX-101` → Escape closes → browser back reopens `?ticket=NEX-101` with the inspector ✓
- Check 6: reload keeps `/w/engineering/p/NEX/board?ticket=NEX-101`, the ticket is shown, and earlier writes ("Fourth check") are still in storage ✓

Extra: `/w/design/c/c-general` (another workspace's channel) → "This channel doesn't exist or was removed." ✓

### Left out on purpose — Phase 1 + 2

See spec §10 (`docs/superpowers/specs/2026-10-26-spark-flow-shell-data-layer-design.md`). Later phases:

- Phase 3: sending messages, reactions, attachment upload, typing indicators in the UI, simulated colleague messages.
- Phase 4: drag-and-drop, backlog table, filters, create/edit ticket.
- Phase 5: ticket unfurling, message → ticket, discussion tab, command palette, split view.
- Later: sign-in and the real .NET/SignalR connection; Arabic strings, an i18n layer and an Arabic font (the layout is RTL-ready now).

### Known follow-ups

- FileViewer iframe sandbox (security): tighten before it renders untrusted files. Phase 3.
- Lost write across tabs (check 7 ⚠️), explained:
  - Root cause: Chromium caches localStorage per renderer, the mock db writes the whole document, and a fresh tab's mount-time `markRead` wrote its stale copy last, erasing the other tab's message.
  - Mitigation done: the current user's read markers moved out of the document into per-channel keys (`spark-flow.mockdb.v1.read.<channelId>`), so `markRead` never rewrites the document.
  - Phase 3 prerequisite, still open: serialise mock writes across tabs (an IndexedDB transaction, or a single writer tab via `navigator.locks`). Two tabs writing the document at the same moment can still lose one write; Review Focus #2 holds for sequential writes only.
- Before the first production build: load `@/mocks` with a dynamic `import()` behind `backendOn`. Today it ships in the production bundle and opens a BroadcastChannel.
- Extract `backendOn` / `apiUrl` to `lib/env.ts` to remove the `lib/api.ts` ↔ `lib/http.ts` import cycle.
- Before showing the demo: fix the seed narrative contradictions (messages that cite tickets created later, two "tonight 23:00", freeze dates).
- The mock backend's `markRead` triggers a broad refetch; narrow the invalidation.
