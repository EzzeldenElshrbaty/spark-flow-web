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

---

# M0 Foundation — company system — 2026-10-27

Spec: `docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md`
Plan: `docs/superpowers/plans/2026-10-26-m0-foundation.md` (executed inline)

## Plan

- [x] Task 1 — IndexedDB mock store with memory fallback
- [x] Task 2 — Contracts and roles
- [x] Task 3 — Async MockDb on the store, export/import, legacy localStorage cleanup
- [x] Task 4 — Company-system seed story
- [x] Task 5 — Permissions and View as
- [x] Task 6 — Database page; safe file previews
- [x] Task 7 — Verify, docs

## Review — M0

### Gates
- `npm test`: 168 passed (19 files). `npm run build:prototype`: passes. `npm run lint`: clean.

### Browser checks (preview pane, 1440 light unless noted)
- A browser holding Phase 1+2 localStorage data: legacy keys removed, IndexedDB `spark-flow.mock` created, seed loads, no errors ✓
- View as Salma (Member): Settings hidden; Database page shows "You don't have access to the database." with no actions ✓; back to Youssef (Admin): Settings shown ✓
- Database: Export downloads `spark-flow-export-YYYY-MM-DD.json` that parses (5 projects, 9 users) ✓; Reload seed → `#general` ✓; Reset needs typing "reset", then → `#general` ✓
- Two tabs, the Phase 1+2 lost-write sequence (fresh tab opening #backend while the other tab sends), 3 runs: all 3 messages stored and shown live, read markers kept ✓
- Database page at 375px dark: no sideways scroll ✓; RTL mirrors ✓
- New seed: `#mobile-app` project chat with an `@all` message renders ✓
- FileViewer: covered by unit tests (`safeFileUrl`, `isPdf`); seeded PDF/PNG get a browser check in M1 when the project Files tab exists.

### Left for later milestones
- M1 projects/phases/tasks UI, M2 time, M3 chat writing and mentions UI, M4 dashboard (spec §8).

---

# M1 — Projects & tasks

Plan: `docs/superpowers/plans/2026-10-27-m1-projects-tasks.md` (executed inline)

## Plan

- [x] Task 1 — Project-scoped permissions
- [x] Task 2 — Derived values
- [x] Task 3 — Project, phase, deliverable, task and file APIs
- [x] Task 4 — Projects list and New project
- [x] Task 5 — Project page: header, phases, Overview
- [x] Task 6 — Tasks tab, task form, inspector edits, My tasks
- [x] Task 7 — Chat and Time tabs
- [x] Task 8 — Verify, docs

## Review — M1

### Gates
- `npm test`: 218 passed (32 files). `npm run build:prototype`: passes. `npm run lint`: clean. (Seed reloaded before the checks.)

### Browser checks (preview pane)
1. Admin: Projects shows 4 Engineering rows (the seed's 5th project, BRD, is in Design), tiles Active 2 · Overdue 2 · Due this month 1 · Delivered 1, Cost column ✓. NEX Overview: phases, deliverables, team, files ✓. Tasks board/list; QA chip → 1 task; Sprint 14 → 7; cleared → 10 ✓. New task → NEX-111 listed; renamed through the inspector's Edit task ✓
2. Sales (Karim): New project "Sela kiosk" (key SK, waterfall) → 5 phases, channel `c-p-sk` in the sidebar, no Cost column, no Manage phases ✓
3. PM (Ahmed): NEX has no Edit project or New task; MOB About edited; QA moved up and back; "Hypercare" added and deleted (typed confirm) ✓
4. Member (Tarek): `/projects?new=1` shows no New project and no form; My tasks: MOB-102 (Bug, Overdue), MOB-104 (Overdue), MOB-108; MOB-104 status → In review from the inspector; no Edit task ✓
5. Upload on MOB: swatch.png previews as an image, handover.pdf and the seeded mobile-2.4.0-scope.pdf preview in the frame; a 0-byte file → "That file is empty." ✓
6. `/p/NEX/board` → `tasks?view=board`, `/p/NEX/backlog` → `tasks?view=list`, `/p/NEX` and `/p/NEX/bogus` → `overview` ✓
7. 390px light and dark, LTR and RTL: Projects, NEX Overview, Tasks list, MOB Time, My tasks have no sideways scroll ✓. The TaskSheet's 24px is the pane's frozen slide-in animation (translateX 24), not layout. Phase chips moved to their own row on phones. No console errors after reload ✓
8. Two tabs: a task created in tab A appeared on tab B's board without a reload ✓

### Left for later milestones
- M2 time logging (timer, manual), M3 chat writing and mentions, M4 dashboard.

---

# M2 — Time

Plan: `docs/superpowers/plans/2026-10-27-m2-time.md` (executed inline)

## Plan

- [x] Task 1 — Time API: check-in, one running timer, manual entries
- [x] Task 2 — Rates API and the Hourly cost page
- [x] Task 3 — Time hooks, live clock and the timer bar
- [x] Task 4 — Add time, and timer controls on tasks
- [x] Task 5 — Home / My day, and its navigation
- [x] Task 6 — Verify, docs

## Review — M2

### Gates
- `npm test`: 248 passed. `npm run build:prototype`: passes. `npm run lint`: clean. Seed reloaded before the checks.

### Browser checks (preview pane; it was about 1:30 AM locally, so manual time went on yesterday)
1. Admin: `/` → `/w/engineering` Home, lit in the sidebar ✓. Checked in with a plan ✓. Start timer on NEX-101 (pill NEX-101), then NEX-102 → pill NEX-102 and NEX-101's entry closed ✓. Add time 07:00–08:00 yesterday on NEX ✓; the same window again → "That overlaps time you already logged." ✓. Check out → "Checked out at 1:29 AM" ✓. NEX on Projects 115h · EGP 38,200 → 116h · EGP 38,854 ✓
2. Member (Tarek) at 390px: checked in with MOB-104; the phone timer bar sits right above the bottom nav (bar 744–788, nav from 787) and `--timer-bar` is set ✓; bottom bar is Home · Projects · Chat · More ✓; `/settings/rates` → "You don't have access to hourly costs." ✓. As Ahmed (PM) on MOB, the RecordHeader action bar ends exactly where the timer bar starts (744) ✓. A done task (MOB-101, MOB-105) has no Start timer ✓
3. Admin, Hourly cost: Mariam 300 → 500 saved; NEX cost EGP 38,854 → 46,354 (her 37.5 h × 200) ✓
4. Two tabs: tab B showed tab A's running MOB-103; starting MOB-102 in tab B moved tab A's bar to MOB-102 without a reload ✓
5. Reload with a timer running: the clock went on from its true start (0:00:16 after a reload at ~0:00:10), not from zero ✓
6. 390px, light and dark, LTR and RTL: Home, Hourly cost and Add time have no sideways scroll ✓ (Home first overflowed by 132px: grid columns got `min-w-0`). No console errors ✓
   - Found and fixed: a timer started after check-out was hidden on the checked-out card (it now shows with Stop); on a 1024px desktop the pill squeezed the search box (the task title now shows from `xl`; key and clock always).

### Left for later milestones
- M3 chat writing, mentions and the Home mentions card; M4 dashboard (checked in now) and Time & cost page.

---

# M3 — Collaboration

Plan: `docs/superpowers/plans/2026-10-28-m3-collaboration.md` (executed inline)

## Plan

- [x] Task 1 — M2 carry-over fixes (midnight entries, live clocks, timer a11y, Settings)
- [x] Task 2 — Chat send and reply with parsed mentions
- [x] Task 3 — Composer, mention autocomplete and chips
- [x] Task 4 — Comments and bugs: API, task Activity, chat cards
- [x] Task 5 — Mentions in the bell and on Home
- [x] Task 6 — Verify, docs

## Review — M3

### Gates
- `npm test`: 279 passed. `npm run build:prototype`: passes. `npm run lint`: clean. Seed reloaded before the checks.

### Browser checks (preview pane)
1. Admin in `#general`: typed `@no` → Nour (Enter), `@NEX-101` (Tab), `@NEX` (Tab), sent → person chip, task chip (`?ticket=NEX-101`), project chip (`/p/NEX/overview`) ✓; Shift+Enter makes a new line ✓
2. Nour: bell "2 unread" with "Youssef Abdelrahman mentioned you" first ✓; clicking it opened `#general` and the count went to 1 ✓; Home's Mentions card lists it ✓. Nour replied in the `m-g01` thread with `@all` → Mariam's bell has "Nour El-Sayed mentioned you · @all token rotation ships Thursday.", and it opens the thread ✓
3. Salma on NEX-105 → Activity: a Bug with repro.png + steps.pdf and `@Mariam` from the popup → image thumbnail, file row, chip ✓; a second comment with screen.mp4 plays in a `<video controls>` ✓ (found: video types weren't accepted — added MP4/WebM/MOV); a 0-byte file → "That file is empty.", nothing posted ✓. `#nexus-core` shows both cards (Bug, Comment) with NEX-105 links ✓. Mariam's bell has Salma's bug first ✓
4. Tarek (not on NEX): `#nexus-core` has no composer, shows "You can read this channel. Only its project's people can write here." ✓; NEX-101 Activity shows "Only the project's people can comment here." ✓
5. Two tabs: a message sent in tab A appeared in tab B live ✓. (Both tabs share one demo persona, so a cross-tab bell bump can't be staged; the bell's refresh on message/reply/comment events is covered by `keysForEvent`.)
6. `<b>plain</b>` shows as literal text ✓. 390px dark, LTR and RTL: `#general`, NEX Chat tab, Home and the Activity panel have no sideways scroll ✓; the `@` popup opens above the composer ✓. A fresh tab through chat, Activity, Home and the bell has no console errors ✓

### Left for later milestones
- M4: dashboard (checked in now), Time & cost page, demo polish and the final review.
