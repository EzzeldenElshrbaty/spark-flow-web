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

---

# M4 — Manager and polish

Plan: `docs/superpowers/plans/2026-10-28-m4-manager-polish.md` (executed inline). Demo script: `docs/demo-script.md`.

## Plan

- [x] Task 1 — Dashboard API with per-role scope
- [x] Task 2 — Dashboard page and the MANAGE group
- [x] Task 3 — Time & cost report
- [x] Task 4 — Teams page and the live demo seed
- [x] Task 5 — Polish for Thursday
- [x] Task 6 — End-to-end pass, docs

## Review — M4

### Gates
- `npm test`: 305 passed. `npm run build:prototype`: passes. `npm run lint`: clean. Seed reloaded before the pass.

### End-to-end (preview pane; it was about 2:40 AM locally)
1. Story 1: Karim created "Sela kiosk" (key SK, Ahmed PM, Tarek on it) → 5 phases ✓; Back from the new project returned to Projects without the form ✓. Ahmed added SK-101 (due 15 Nov) and SK-102 (6 h) for Tarek ✓. Tarek checked in on SK-101 (pill SK-101) and added 1 h on SK-102 ✓. Ahmed's Dashboard: SK "1h of 6h", TL 1h in the last 7 days, Tarek under Checked in now ✓. Found and fixed: a checked-in person on a project outside the PM's scope showed "—" for their task (Hossam on NEX); it now names the task.
2. Story 2: Salma checked in, started NEX-105 from its panel (the check-in picker lists only her own tasks), reported a Bug with board.png and @Mariam → card with image in #nexus-core, Mariam's bell "Salma Ibrahim mentioned you" ✓; started NEX-108 (pill moved), checked out → "Checked out at 2:43 AM" with both entries ✓
3. Admin Dashboard: 5 projects (with SK), NEX cost, Checked in now: Tarek, Hossam, Mariam, Nour ✓
4. Time & cost: 7/30/90 days tiles 184.2h/229.2h/229.2h; By project and By person sum to the same within display rounding (0.1h) ✓; By week chart titled by the peak week ✓; Edit hourly costs → Hossam 900 → 30-day cost EGP 75.6K → 98K ✓
5. Access: Sales has Dashboard (no cost, no Checked in now list), no Time & cost; Nour (PM) sees "The projects you manage."; Tarek (Member) gets both denial sentences and only Teams in the nav ✓
6. Polish: Back after create ✓, Escape keeps the @ list shut ✓, private DM read-only wording ✓, screenshot-only bug ✓ (others covered by unit tests; HEIC/MOV fallback and the per-channel send error weren't exercised in the browser)
7. 390px dark, LTR and RTL: Dashboard, Time & cost (project and week) and Teams have no sideways scroll ✓. Two tabs: Admin checked in in tab A → tab B's Dashboard listed Youssef live ✓; fresh tab, no console errors ✓

# Flow chat — Phase 1 keyboard shortcuts (spec §10) — 2026-10-28 — done

Scope: Alt+↑/↓, Alt+Shift+↑/↓, Esc, Shift+Esc, U (with a Mark unread menu item) and L on a focused message.

## Plan

- [x] `channelKeys.ts`: `sidebarOrder` (Starred, Channels, DMs), `stepChannel` (no wrap; unread = bold row), `channelKey`
- [x] `useChannelKeys.ts`: one `keydown` listener on `window`, after every document-level layer; skips prevented keys, open `aria-modal` dialogs and IME composing; Esc and Shift+Esc skip typing in fields other than the channel composer (`data-channel-composer`)
- [x] `ChannelShortcuts.tsx`: wires the keys on the channel page; Alt+↑/↓ navigate with `{ focus: 'composer' }` state, the new channel's composer takes focus (`RichComposer autoFocus`); Shift+Esc confirm `MarkAllReadModal` (`useMarkAllRead`, one `/read` per unread channel)
- [x] Mark unread route: `POST /api/channels/:id/unread { seq }` in contract, types, http, mock (`seq - 1`, either way, 400 outside 1..lastSeq), `useMarkUnread`
- [x] `readState.ts`: `useReadHold` (one held channel), `useReadHoldScope` (ends on leaving the channel, not on tab switch), `useChannelReadState` (New line moves to `seq - 1`; marking read myself ends the hold); `MessageList holdRead` stops auto-read
- [x] U and L in `ChannelMessage` (status line under the message: "Marked unread", "Link copied", failures stay); "Mark unread" item with `aria-keyshortcuts="U"` in `MessageActions`
- [x] Esc ownership: `MenuPanel` and the Inspector `preventDefault()` the Esc they use, so one Esc doesn't also mark the channel read
- [x] Tests first: channelKeys, useChannelKeys, readState, ChannelShortcuts (modal), ChannelMessage (U, L), MessageList (held read), RichComposer (autoFocus), mock + http (route), a11y (modal, menu)

## Review — keyboard shortcuts

- `npm test`: 939/939 (103 files). `tsc -b`, lint, `build:prototype` pass.
- Watched RED first for each: route (`markUnread is not a function`), held read (`onMarkRead` called once without the change), ⋯ menu Esc (marked read without `MenuPanel` fix), U/L, modal, autoFocus.
- In the app (1280px): U on Mariam's message in #frontend-dev → New line above it, "Marked unread", row bold; at the end with focus it stays unread; Esc marks it read; Alt+↓ → #general with the caret in the composer; Alt+Shift+↓ skips read #release-v2 to the unread DM; Shift+Esc asks "Mark everything read?" and marks it read; ⋯ menu shows "Mark unread U".
- Not verified in the app: L's success path (the browser pane refuses clipboard writes; the header's Copy link fails the same way there). Covered by tests.
- Rulings: U only on someone else's message (mine never count as unread); U moves the marker either way, like Slack; Alt moves don't wrap; Alt+↑/↓ work while typing; Shift+Esc confirms first and includes muted channels; muted channels are skipped by Alt+Shift; Esc does nothing when the channel has nothing unread.
- Seen, not changed: the ⋯ menu on the last message opens downward and is cut off by the composer (existing; the new item makes it a row taller). Shift+Esc right after U can miss the channel until its unread count has refreshed.

# Flow chat — ⋯ menu on the last message opens upward — 2026-10-28 — done

- [x] Test first (`src/components/ui/Menu.browser.test.tsx`, Chromium, 1280px): opens below with room; on the last row of a scrolling list it opens upward inside the list, the list doesn't scroll and focus is on the first item; near the window's bottom it opens upward. RED: both opened downward and the list scrolled ~39px to the focused item.
- [x] `MenuPanel` (desktop): measures the room above and below its trigger inside the window and every ancestor that scrolls or clips (`roomAround`); opens upward (`bottom-full mb-2`) when it doesn't fit below and there's more room above. Focus moves to the first item only once placed, so it never scrolls the list. Phones keep the bottom sheet.

## Review — ⋯ menu

- `npm test`: 942/942 (104 files). Lint and `build:prototype` (with `tsc -b`) pass.
- In the app (1280px, #general scrolled to the end): the last message's ⋯ (trigger 514–546) opens its menu at 340–507, inside the list (156–644) and clear of the composer; list scrollTop unchanged; focus on the first reaction. A row near the top still opens below. Phone (375px): bottom sheet as before.
- Ruling: the flip is in the shared `MenuPanel`, so every menu near the bottom of a list or the window gets it (time entries, comments, rows); top-bar menus always have room below, so they don't change.
- Seen, not changed: the error note under the ⋯ (react or delete failed) still opens downward and can be cut off on the last row. In the phone emulation the bottom sheet ends 6px below the window, the same before this change.

# Flow chat — review of the work since the Phase 1 fix pass — 2026-10-28 — done

Range `0e6a9a6..e1cbc21` (pinch zoom, 16px phone text, keyboard shortcuts with Mark unread, the menu flip). One fresh reviewer: no Critical, 3 Important, 8 Minor. Verdict "with fixes".

## Fixed (each RED → GREEN)

- [x] Alt+↑ from an empty channel composer opened my last message for editing instead of the previous channel (Lexical sends Alt+↑ as Up; KeysPlugin's "Up in an empty box" took it). Up with Alt, Shift, Ctrl or Meta is now left to the page. Test: `RichComposer.browser.test.tsx` "leaves Up with Alt, Shift, Ctrl or Meta to the page" (RED: edit opened twice).
- [x] One Esc closed an image preview and also marked the channel read (with a real key the preview is gone before the page's listener checks for a dialog). `useChannelKeys` now notes whether a dialog was open in the capture phase, before any listener runs. Test: `useChannelKeys.browser.test.tsx` with real keys (RED: marked read once).
- [x] Alt+↑/↓ while typing a thread reply or an inline edit moved to another channel and lost the text (those fields have no draft). The channel keys now follow one rule: from the page or the channel composer, not while typing in another field. Test: `useChannelKeys.test.tsx` "not while typing in another field" (RED: the key was taken).

## Review — fix pass

- `npm test`: 945/945 (105 files). Lint and `build:prototype` (with `tsc -b`) pass.
- In the app (1280px, real keys): Alt+↑ in the empty #general composer → #frontend-dev, no edit opened; Alt+↓ while typing in a thread reply → stays, reply kept. The image preview case is covered by the real-key browser test only: no seeded message has an image and uploads come with Phase 2.
- Ruling changed: "Alt+↑/↓ work while typing" is now "only from the page or the channel composer" (reviewer: it lost replies and edits).
- Deferred minors: a failed U releases the hold from an earlier successful U; Esc right after U (count not refreshed yet) does nothing and leaves the hold; no ⋯ (so no Mark unread item) where I can't react, edit, delete or create tasks; U and L leave the desktop ⋯ menu open and holding U repeats the request; a partial Shift+Esc failure leaves holds for the channels that succeeded; Esc on a ⋯ menu inside the thread panel also closes the panel (existing); a menu that flips upward isn't capped to the room above; every row renders an empty `role="status"`.

# Flow chat — the 8 deferred minors from the review — 2026-10-28 — done

Each test written first and watched fail (the one guard that already passed is noted).

- [x] A refused U after one that went through dropped the first hold. U now remembers whether the channel was already held and only releases its own. Test: `readState.test.tsx` "a refused U after one that went through keeps the first hold".
- [x] Esc right after U (unread count not refreshed yet) did nothing and left the hold on; a held channel whose U'd message was deleted could never be released. `markOpenChannelRead` marks a held channel read even at 0 and always ends the hold; with nothing unread and nothing held it sends nothing. Tests: `readState.test.tsx` "Esc: markOpenChannelRead".
- [x] Where I can't react, edit, delete or create tasks there was no ⋯, so no Mark unread item. `MessageActions` now also shows for Mark unread alone. Test: `MessageActions.test.tsx` "is offered even where I can do nothing else".
- [x] U and L acted inside the open desktop ⋯ menu and left it open; a held U sent a request per repeat. The row ignores repeats and keys from inside its menu; `MenuPanel` picks the item that names the letter in `aria-keyshortcuts` (U → Mark unread, which closes the menu). Tests: `ChannelMessage.test.tsx` "holding U down marks it unread once", "in the open ⋯ menu, U picks Mark unread".
- [x] A partial Shift+Esc failure left holds on the channels that went through and refreshed nothing. `useMarkAllRead` throws `MarkAllReadError` with `failedIds` and refreshes on error; the dialog releases every hold but the failed ones. Tests: `ChannelShortcuts.test.tsx` "the ones that went through end their hold, and everything refreshes" (RED); "a channel that failed keeps its hold" (guard, passed before and after).
- [x] Esc on a ⋯ menu in the thread panel also closed the panel (existing). The Inspector leaves Esc to an open menu, as it does to a dialog. Test: `useChannelKeys.test.tsx` "Esc with a ⋯ menu open in the thread panel is the menu's".
- [x] A menu that flips upward could still run past the top of a short box. `MenuPanel` caps its height at the room on the side it opens to (8px from the edge, at least one item, never over 80vh). Test: `Menu.browser.test.tsx` "with little room either way".
- [x] Every row rendered an empty `role="status"`. One shared `Announcer` (`components/sf/Announcer.tsx`, mounted in `AppLayout`) reads notes out; the row shows its note only while there is one. Tests: `Announcer.test.tsx`; `ChannelMessage.test.tsx` "a row has no live region of its own".

## Review — minors

- `npm test`: 959/959 (106 files). Lint and `build:prototype` (with `tsc -b`) pass.
- In the app (1280px, real keys): ⋯ open on Salma's message in #frontend-dev, U → menu closed, "Marked unread" under it, read out once through the shared region, New line moved; Esc → row no longer bold. Thread panel: ⋯ open on a reply, Esc → only the menu closed, panel stayed, focus back on its ⋯. The page has 3 status regions in all, none per row.
- Ruling: the shared announcer is mounted once in the shell; a note shown in a row is plain text now, read out through it.

# Flow chat — Phase 2 slice 1: message toolbar and ⋯ menu (spec 6.4, 6.5) — 2026-10-28 — done

Approved scope: the toolbar and the ⋯ menu on the sf Menu with today's actions, plus T (Reply in thread) and Copy text. No server changes. Hidden until their own slices: Get notified about replies (threads), Pin, Save for later, Forward. Remind me is Phase 3; the AI action is OPEN (spec 13).

## Plan

- [x] `src/lib/roomAround.ts`: the room above and below an element inside everything that clips it (moved out of `components/ui/Menu`, shared with the toolbar). `menuItemClass` moves to `components/ui/Menu` (RowMenu, CommentRow use it; the chat no longer does).
- [x] sf `MenuItem` gets `shortcut` (hint + `aria-keyshortcuts`); in the menu, a letter that is an item's shortcut picks it before the letter jump.
- [x] `MessageActions.tsx`: More (⋮) + sf Menu in spec order: Mark unread (U) · — · Create task · Copy link (L) · Copy text · — · Edit (E) · Delete (danger). Separators only between groups that have items. The delete flow (Undo toast, confirm, focus after delete) stays.
- [x] `MessageToolbar.tsx`: `role="toolbar"` "Message actions", one Tab stop per row (←/→, Home/End move along it), ✅ 👀 🙌 (pressed when mine; a toggle), Add reaction (emoji picker, adds only), Reply in thread (T; top-level messages outside their own thread), More. Shown while the row is hovered or has focus, and while its menu or picker is open; hidden, it takes no pointer. 16px above the row's top end; inside the row when there's no room above it (the top row of the list or the panel).
- [x] Phones (below 768px): no toolbar; the ⋯ stays and its sheet starts with ✅ 👀 🙌, Add reaction and Reply in thread, then the menu.
- [x] `ChannelMessage`: renders the toolbar; T opens the thread with the reply box focused; Copy text copies the message as plain text ("Text copied" / "Couldn't copy the text"); after an edit or a delete, focus goes back to the row's toolbar.
- [x] `ThreadInspector` + `Composer` `autoFocus`: opened by Reply in thread or T, the reply box takes focus, also when that thread is already open.
- [x] `useTaskFromMessage`: Create task as an sf `MenuItem`.
- [x] Tests first: sf Menu shortcut letters; MessageActions (order, separators, hints, delete flow); MessageToolbar (roving keys, buttons, pressed, T, no Reply on replies); ChannelMessage (Copy text, T, focus back); ThreadInspector focus; browser: the toolbar isn't clipped on the top row and stays while its menu is open; axe on the toolbar and the menu.

Rulings approved with the plan: the quick reactions are fixed to ✅ 👀 🙌 (spec: "later: the viewer's three most recent"); Create task stays on project channels with the project set (the spec's project picker needs `POST /tasks/from-message`); the desktop menu has no emoji row (the toolbar carries reactions); Copy text copies the message as plain text.

## Review — slice 1

- `npm test`: 986/986 (108 files). Lint and `build:prototype` (with `tsc -b`) pass.
- Watched RED first: sf Menu shortcut letters (`aria-keyshortcuts` null); MessageMenu, MessageToolbar and useReplyFocus (modules missing); ChannelMessage (no More actions, no Reply in thread, no Copy text); the placement and stay-open browser tests fail with the inside/`has-[aria-expanded]` code taken out; the sheet's missing row keys (a React warning).
- In the app, 1280px, real keys: hovering Salma's message in #frontend-dev shows ✅ 👀 🙌, Add reaction | Reply in thread, More above its top end; More opens Mark unread (U) · — · Copy link (L) · Copy text · — · Delete (Admin), and the toolbar stays while it's open; Esc closes it back to More; ← moves to Reply in thread (tooltip "Reply in thread T") and the Tab stop follows; T opens the thread with the reply box focused. The thread's root has no Reply in thread. Dark theme looks right (checked by adding the `dark` class; the app has no theme toggle yet) and axe passes in both themes.
- 390px: no toolbar, ⋯ on every row, no sideways scroll; the sheet reads ✅ 👀 🙌, Add reaction, Reply in thread, then the menu; Add reaction opens the picker sheet with search focused.
- Rulings: More is the row's first Tab stop (the old ⋯ was the row's focus target, and Enter on a reaction by accident is worse); the arrows wrap, like the sf Menu; in the menu an item's own letter picks it (L picks Copy link, U Mark unread, E Edit), other letters jump; on phones the picker opens from a visually hidden trigger in the row, which is where focus goes when the picker closes; `menuItemClass` moved to `components/ui/Menu` (RowMenu, CommentRow) and `roomAround` to `lib/roomAround.ts`.
- Not verified in the app: Copy text's success (the browser pane refuses clipboard writes; tests cover it).

# Flow chat — review of Phase 2 slice 1 — 2026-10-28 — done

Range `592aaca..c6861c6`. One fresh reviewer: no Critical, 3 Important, 9 Minor. Verdict "with fixes". Re-graded M1 (a mouse click left that row's toolbar showing, two at once) to Important: it happens on every mouse reaction.

## Fixed (each RED → GREEN)

- [x] I1 — in the 384px thread panel the toolbar covered the reply's time, and long author names. `placeToolbar` keeps the spec's 16px rise when it hides neither the name nor the time (`data-row-header`), else puts it fully above the row, else inside, under the name line. Test: `a11y.browser.test.tsx` "in the thread panel (384px) it never covers the author name or the time" (RED: [true, true]).
- [x] I2 — in the thread panel, one Esc in the emoji picker's grid closed the picker and the whole panel. The panel's Esc now yields while any sf layer (menu, picker, tooltip, dialog) is open (`hasOpenLayer`), and sees a dialog as it was when the key went down (`lib/keyStart.ts`, shared with `useChannelKeys`). It stays on the document so it still runs before the channel's keys (on window). Tests: `layout/Inspector.browser.test.tsx` with real keys: picker (RED: panel closed), image preview (guard), and "closes the panel and doesn't also mark the channel read" (RED for a window listener, which I tried first).
- [x] I3 — on touch screens of 768px and up with no hover (tablets) no message action could be reached. `useNoHover` (`(hover: none)`) sends them to the ⋯ path like phones. Test: `MessageToolbar.test.tsx` "on a touch screen with no hover" (RED: the toolbar rendered).
- [x] M1 — keyboard focus shows the toolbar (`group-has-[:focus-visible]`), a mouse click doesn't pin it. Tests: "a mouse click doesn't keep a row's toolbar showing" (RED: '1'), "keyboard focus in the row shows it" (guard).

## Review — fix pass

- `npm test`: 993/993 (109 files). Lint and `build:prototype` (with `tsc -b`) pass.
- In the app (1280px): in the thread panel, the root's toolbar sits under its name line (no room above) and the replies' toolbars sit fully above their rows; no name or time is covered. Esc in the picker opened from a reply's toolbar closed only the picker; the thread stayed open with focus back on Add reaction. (A script's `.focus()` fires no `focusin` while the pane isn't the focused window; the checks dispatched it or used real hovers.)
- Not checked in the app: a real tablet without hover (covered by the unit test).
- Deferred minors: M2 typing "de" toward Delete picks Edit (E is a shortcut letter); M3 the phone ⋯ is 32px, under 6.16's 44px (existing size); M4 on phones the picker closes onto the invisible Add reaction button, a duplicate screen-reader stop per row; M5 Reply in thread and T are offered where I can't post (the thread opens without a reply box); M6 T or Reply on the thread already open adds a history entry; M7 `useReplyFocus` can miss the caret if the reply box mounts after its wrapper on a cold load; M8 the unread bar can cover the top rows' raised toolbars; M9 the delete error sits inside the hidden toolbar and hides with it (existing).

# Flow chat — the 8 deferred minors from the slice 1 review — 2026-10-28 — done

Each test written first and watched fail.

- [x] M2 — typing "de" toward Delete picked Edit (E is its key). In the sf Menu a shortcut letter picks its item unless it continues a typed prefix of an item's name. Test: `layers.test.tsx` "typing on toward an item".
- [x] M3 — the phone ⋯ was a 32px target. It keeps its 32px look with a 44px touch area (`after:-inset-1.5`, spec 6.16). Test: `a11y.browser.test.tsx` "on a phone the ⋯ answers a 44px touch" (RED with the class taken out).
- [x] M4 — on phones the picker closed onto an invisible "Add reaction" button, a duplicate screen-reader stop per row. It's `aria-hidden` now and passes focus straight on to the ⋯. Test: `MessageToolbar.test.tsx` "closing it puts focus back on the ⋯".
- [x] M5 — Reply in thread and T were offered where I can't post (a thread with no reply box). Now only where I may post; the thread summary still opens threads to read. Test: `ChannelMessage.test.tsx` "where I may not post there is no Reply in thread".
- [x] M6 — T or Reply on the thread already open added a history step. It replaces then; another thread is still a new step. Tests: "on the thread already open … without adding to the history", "another thread is a new step".
- [x] M7 — the reply box could miss the caret when it came after its wrapper (cold load). `useReplyFocus` waits for it (MutationObserver). Test: `useReplyFocus.test.tsx` "a reply box that comes after the thread has loaded".
- [x] M8 — the unread bar (and the day pill) could cover the top rows' raised toolbars. They're marked `data-list-overlay`; `placeToolbar` keeps below them. Test: `a11y.browser.test.tsx` "it keeps clear of a bar laid over the list" (RED: 20 < 56).
- [x] M9 — a refused delete's message sat inside the hidden toolbar and hid with it. `MessageMenu` reports it (`onDeleteError`) and the toolbar shows it outside itself. Test: `MessageToolbar.test.tsx` "a delete the server refuses".

## Review — minors

- `npm test`: 1001/1001 (109 files). Lint and `build:prototype` (with `tsc -b`) pass.
- Not seen in the app: the unread bar case (the pane runs as a background page, so the list never positions itself and the bar doesn't come up after a fresh load); covered by the browser test.
- Asked along the way: several emoji per message is by design (spec 6.6: one reaction per person per emoji, up to 50 per message). After Mark unread, coming back keeps it unread until its newest message is on screen in a focused window, or Esc / Mark as read (spec 6.2); Slack's default marks a channel read on opening. Both are open for the user to change.

# Flow chat — opening a channel marks it read (spec 6.2 change) — 2026-10-28 — done

Approved: opening a channel marks it read at once, like Slack, while still starting at the New line. No new route.

## Plan

- [x] `readState.ts` `useChannelReadState`: when the Messages tab opens, mark the channel read up to its newest message at opening (`POST /api/channels/:id/read { seq: lastSeq }`), once per visit; not when the channel is held by U (a tab switch inside it) or has nothing unread; a page opened in the background waits until it's shown. Returns `readOnOpen` (that seq, or null).
- [x] `ChannelPage` PaneFeed: the New line (`newAfterSeq`) and the unread count stay as they were at opening; the list is told about the mark (`markedSeq` = the larger of the marker and `readOnOpen`) so it doesn't send it again.
- [x] `MessageList` unread bar: "N new messages since 9:03 PM · Mark as unread" (was Mark as read): the first message after the New line goes back to unread through Mark unread, held until I leave; the bar goes.
- [x] Spec 6.2 and the API contract say so.
- [x] Tests first: readState (marks once up to lastSeq, the New line stays; nothing unread; held; hidden page waits), MessageList (the bar's Mark as unread, on the first new message).

Rulings approved with the plan: a permalink or a date jump opens the channel too, so it's marked read; opening straight onto Files or Pins waits for the Messages tab; muted channels follow the same rule; messages that come in while I'm in the channel keep the old rule (read once the newest is on screen in a focused window).

## Review — mark read on open

- `npm test`: 1006/1006 (109 files). Lint and `build:prototype` (with `tsc -b`) pass.
- Watched RED first: readState (no call to `markRead('c1', 9)`; `readOnOpen` undefined), MessageList (the bar still said Mark as read).
- In the app: #frontend-dev, unread at 11: opening it marked it read (17), its sidebar row stopped being bold, and the New line still showed. Mark unread on a message (marker 0), Files tab and back: still 0 (held). Leaving and coming back: 17.
- Not seen in the app: the bar's Mark as unread (the pane runs as a background page and the bar doesn't come up there; covered by the browser test).
- Seen, not changed: the project's Chat tab (`ChannelFeed`) has its own read handling and isn't part of this change.

# Flow chat — Phase 2 slice 2: threads (spec 6.7) — 2026-10-28 — done

Approved: part A (following and the panel header menu), then part B (the rich thread composer, Also send to #channel, broadcast replies), with the contract updated.

## Plan

Part A — following
- [x] Data: `threadFollows` (person, root, following: my explicit choice), DB_VERSION 11 with its migration; `following` on every message read, worked out per person: my choice, else the author, anyone who replied, anyone mentioned (by name) in the root or a reply. Replying, or a new mention, clears my choice (I follow again).
- [x] Routes: `PUT` / `DELETE /api/messages/:id/follow` → 204 (the thread's root only; read access); `messageChanged` live. Api `setFollowing(messageId, following)`, http, `useSetFollowing`.
- [x] ⋯ menu, first item on top-level messages: "Get notified about replies" / "Turn off notifications for replies" while following.
- [x] Thread panel header ⋮ (sf Menu): Copy link, the same follow item, Open in a new window. `InspectorFrame` gets an `actions` slot.

Part B — replies
- [x] Reply route `POST /api/messages/:id/replies { content, body?, alsoInChannel? }`: rich text; with `alsoInChannel` it also takes the channel's next seq (one record: the reply). Channel pages list it as a message with `broadcast: { rootId, rootText }`, its id the reply's; its edits, deletes and reactions go to `/api/replies/:id`. Counts as unread like any message. `replyReceived` carries `alsoInChannel`.
- [x] Thread composer: the rich composer with its formatting row hidden until Aa, a draft per thread, and "Also send to #channel" (a DM: "Also send to <name>"), unchecked each time.
- [x] Channel: a broadcast reply reads "replied to a thread: <first line>" (a link to the thread), stands alone (no grouping); its toolbar acts on the reply, Reply in thread opens its root's thread.
- [x] Panel: a broadcast reply shows "↪ Also sent to #channel".
- [x] Contract (`docs/flow-chat/api-contract.md`): the routes, fields and events above.
- [x] Tests first: mock (follow rules, broadcast seq / unread / one record), http, migration; menus, header menu, composer checkbox, the broadcast row and label; axe on the header menu and the thread composer.

Rulings approved with the plan: one record for a broadcast reply; following is stored and shown, not yet delivered (bell, Activity, Threads come later); no Mute in the header menu; the panel stays 384px; the same wording for following everywhere.

## Review — threads slice

- `npm test`: 1045/1045 (111 files). Lint and `build:prototype` (with `tsc -b`) pass.
- Watched RED first: part A: `setFollowing is not a function`, `following` undefined, migration null; the menu item and the header menu missing. Part B: no `alsoInChannel` / `seq`, the reply not in the channel's list, rich body ignored, nested replies allowed; the composer's formatting row shown, no ThreadComposer, no "replied to a thread:", reactions on the message route, no "Also sent to".
- In the app: the database moved to version 11 on load. The thread panel's ⋮ shows Copy link, Get notified about replies, Open in a new window, and following flips its label. The thread composer has no formatting row (Aa shows it) and "Also send to #frontend-dev"; a reply sent with it showed in the channel as "replied to a thread: Bug: a long ticket title…", with a link to the thread, and in the panel with "↪ Also sent to #frontend-dev"; the box came back unchecked.
- Fixed along the way: the "L copies the link … then clears" test could miss its timer under load (it now lets the note's effect start the timer first).
- Not changed: the project's Chat tab still uses the old plain composer for its own messages; following doesn't notify yet (bell, Activity, Threads come later).

# Flow chat — review of Phase 2 slice 2 (threads) — 2026-10-28 — done

Range `1819445..52de4fc`. One fresh reviewer: no Critical, 2 Important, 6 Minor. Verdict "with fixes". Re-graded M2 (the contract contradicted the mock) to Important: the .NET team builds from it.

## Fixed

- [x] I1 — once anyone followed a thread, an export no longer imported ("That file isn't a Spark Flow export."), and the next DB_VERSION bump would have reseeded the mock database: the records check wanted an `id`. A thread follow is now checked by its person and thread. Tests: `db.test.ts` "thread follows survive an export and an import" (RED), "a follow without its person or thread is refused on import" (guard).
- [x] I2 — a broadcast reply opened two edit boxes (channel row and thread panel share its id), and an edit in the panel scrolled the channel. The editing store keeps the place too (`channel` / `thread`); the list only follows the channel's. Tests: `ChannelMessage.test.tsx` "edited where I started" (RED: the panel row lost its toolbar), `MessageList.browser.test.tsx` "an edit started in the thread panel doesn't move the channel" (RED: 199 ≠ 814).
- [x] M2 — the contract now says what the mock does: `following` on top-level messages only, and for a broadcast id `GET` returns it, its replies are `[]`, writes through `/api/messages/:id` are `404`, replying or following is `400`. (Text only.)

## Review — fix pass

- `npm test`: 1049/1049 (111 files). Lint and `build:prototype` (with `tsc -b`) pass.
- In the app: with the thread open, Up in the empty channel composer opened one edit box, in the channel, with focus there (the broadcast reply "Fixed on staging too").
- Deferred minors: M1 the thread ⋮'s "Link copied" is only read out, not shown; M3 Create task from a broadcast row links the task to its channel entry, not the reply (the chip shows only in the channel); M4 a non-member of a public channel gets "Also send to #channel" in the thread panel while the channel asks them to join first; M5 Reply in thread or T puts the caret at the start of a saved draft; M6 `CLAUDE.md` still says the old textarea Composer serves threads.

# Flow chat — the 5 deferred minors from the threads review — 2026-10-28 — done

Each test written first and watched fail (M6 is text).

- [x] M1 — the thread ⋮'s "Link copied" (and its failure) was only read out. It's shown under the ⋮ too: a success clears after 2s, a failure stays. Tests: `ThreadMenu.test.tsx` "says so, on screen and read out", "a copy the browser refuses says so".
- [x] M3 — Create task from a broadcast row linked the task to its channel entry, not the reply. A broadcast row offers no Create task (`canMakeTask`), and the mock refuses one: "A task can't be made from a thread reply." Tests: `taskDraft.test.ts` "canMakeTask", `tasks.test.ts` "a thread reply also sent to the project's chat is refused".
- [x] M4 — a non-member of a public channel got the thread's reply box (and Also send) while the channel asks them to join first. One rule, `mustJoin` (`lib/channels.ts`), shows Join channel in both. Test: `channels.test.ts` "mustJoin".
- [x] M5 — Reply in thread or T put the caret at the start of a saved draft. `useReplyFocus` puts it at the end. Test: `useReplyFocus.test.tsx` "the caret goes after the draft" (RED: offset 0).
- [x] M6 — `CLAUDE.md` says a thread replies with `ThreadComposer` and edits use the rich editor; the old textarea Composer serves the project Chat tab and task comments.

## Review — minors

- `npm test`: 1056/1056 (111 files). Lint and `build:prototype` (with `tsc -b`) pass.
- In the app: a thread draft "half a thought", closed and reopened with Reply in thread: the caret came back at its end (typing "!" gave "half a thought!"). The thread ⋮'s Copy link showed "Couldn't copy the link" under it (the pane refuses clipboard writes).
- Not seen in the app: the Join channel line in a thread (needs a public channel I'm not in); covered by the rule's test and the same line as the channel page.

# Flow chat — Phase 2 slice 3: Activity and channel notifications (spec 6.11, 6.12) — 2026-10-28

Approved: part A (activity data and routes), part B (the Activity page), part C (the channel bell menu and the levels), with the contract updated.

## Plan

Part A — activity data
- [x] Types: `ActivityItem` (kind mention | reaction | thread, actor, channel, message or reply, excerpt, emoji, time, read); Api `inbox.list(workspaceId)`, `inbox.markRead(workspaceId, ids?)` (`activity` is already the project history); `chat.setNotifyLevel(id, level)`; live `notificationCreated { userId }`.
- [x] Mock DB version 12: `notifications` (stored reaction and thread items), with its migration; a channel's level that was "all" (nobody could choose yet) becomes "mentions"; a DM stays "all". New state starts at the kind's default.
- [x] A reaction to my message or reply stores an item for me (taking it back removes it); a reply in a thread I follow stores one for every follower but the replier, those it mentions (they get the mention) and those who can't read the channel.
- [x] `GET /api/workspaces/:id/activity`: my mentions (as today) and stored items in that workspace, newest first, at most 100, without channels set to Nothing; `POST /api/workspaces/:id/activity/read { ids? }` (no ids: all); a mention's read state is the bell's. The bell also leaves out channels set to Nothing.
- [x] `PATCH /api/channels/:id/me { notifyLevel }`; http; hooks; query keys and live refresh.

Part B — the Activity page
- [x] `/w/:ws/activity`: header "Activity", tabs All / Mentions / Reactions / Threads, Unread only, Mark all read; rows with the unread dot, avatar, kind line, text and time, an "Earlier" group; opening a row goes there and marks it read; "Nothing here yet." / "You're all caught up."; phones full screen.
- [x] The sidebar's Activity link opens it, with the count of unread items in the workspace.

Part C — the channel bell menu
- [x] Channel header bell → "Notify me about": All new messages / Mentions and keywords / Nothing (checked), — Mute channel. Mute leaves the ⋮ menu.
- [x] Sidebar row by level: All → unread count; Mentions → my mentions (today); Nothing → no count; muted → no bold, no count, last in its group.
- [x] Contract: the routes, fields and event above.
- [x] Tests first for each step; axe on the page and the menu.

Rulings approved with the plan: one Activity route (mentions worked out, reactions and thread replies stored, in the mock); the top-bar bell stays mentions only; keywords, desktop / mobile / email and Do Not Disturb wait for Preferences; reading a message in its channel doesn't mark its Activity item read; Reminders stays hidden until Phase 3.

Rulings while building: the Api namespace is `inbox`, since `api.activity` is task and project history (routes unchanged); a new message also refreshes Activity, as it can mention me; a row opens a message on it in its channel and a reply in its thread (the bell opens every mention's thread, as before); Mark all read on a tab other than All marks that tab's unread rows; a DM is "a direct message" in the kind line; the tab row became the sf `Tabs` primitive (the channel's tabs use it); the Activity error is `text-sf-accent`, since `text-sf-error` (red-600) fails contrast in dark; the bell is "Channel notifications" ("Conversation notifications" in a DM), with its icon off when muted or at Nothing; picking the level already set sends nothing; at Nothing a row stays bold with unread; muted rows go last in Starred too; the tab row's line became an inset shadow, as the accent rule 1px below it made the row scroll (a stray scrollbar on phones, the channel tabs too).

## Review

- Part A (c96b81f): DB v12 with stored reaction and thread items, the Activity feed and routes, levels with their defaults and `PATCH …/me { notifyLevel }`, `notificationCreated`, hooks and live refresh.
- Part B (2638101): `/w/:ws/activity` with tabs, Unread only, Mark all read, unread then Earlier, row links that mark read; the sidebar row counts unread Activity; the sf `Tabs` primitive.
- Part C: the channel bell menu (levels and Mute; Mute left the ⋮ menu), sidebar counts by level, muted rows last, the contract section, and the tab row's stray scrollbar.
- Verified: 1101 tests (unit and browser, axe in light and dark for the view and the bell, a 390px fit check), tsc, lint, `build:prototype`; in the app, as Nour a reaction and a thread reply reached Youssef's Activity (count 2), opening a row jumped to the message and marked it read, Nothing hid #general's mention, Mute moved #general last, Unread only and Mark all read ended at "You’re all caught up.", at 375px in light and dark.
- Not pushed.

## Fresh review (slice 3) — 0 critical, 3 important, 10 minor

Fixed, test first:
- [x] Activity listed stored items from a private channel I left (its text as edited later) and kept storing reactions there → read check when the list is read, and no reaction item without read access.
- [x] The 50-mention window was cut before the workspace and Nothing filters, so a busy channel at Nothing (or another workspace) emptied the bell and Activity's mentions, and Mark read dropped older ids → filter first; Activity takes its own 100; Mark read accepts any of my mentions.
- [x] Mention or thread row was chosen at post time, by name only → every reading follower gets the thread item; a reply that mentions me as it reads now (`@all`, edits) shows once, as the mention.
- [x] The contract named `GET /api/mentions/me`; the route is `GET /api/mentions` (re-graded up: it would mislead the .NET team). Contract rules updated for the three fixes.
- [x] `text-sf-error` failed 4.5:1 in dark (2.94:1): the `error` token is red-400 in dark, as accent ("Same as Spark Red"), in the design file, its CSS and the app tokens; error joins the contrast pairs test; Activity's error is `text-sf-error` again.

Deferred minors, then fixed test first:
- [x] Mark read with ids ignores the route's workspace.
- [x] `channelChanged` (leave, removal) doesn't refresh Activity or the bell until the poll.
- [x] A reaction row reads "Omar Hassan Shipped the fix", as if he wrote my message.
- [x] A channel at All announces its count as mentions (DMs already did).
- [x] Activity's "3h ago" doesn't tick while the page stays open (`useNow`).
- [x] The header bell's name doesn't say muted or Nothing.
- [x] Activity's switch (20px) and Mark all read (28px) are under 44px on phones, and tapping "Unread only" does nothing (re-graded: the header's star and bell are under 44px too).
- [x] Activity refetches on every new message anywhere (until the server sends `notification.created` for mentions).
- [x] Dead `unreadMentions().total`, a stale test comment, `excerptOf` copied twice, mentions.ts and activityFeed.ts import each other.

How each was fixed: Mark read with ids keeps to the route's workspace; `channelChanged` refreshes the bell and Activity; a reaction's line names who reacted and its text is my message alone; `countNoun` reads a count at All as new messages; Activity's times tick with `useNow(60_000)`; the bell is named "Channel notifications: muted" or "…: nothing"; "Unread only" is a 44px label that flips the switch and Mark all read has a 44px touch area (`Button touch`); a new message or reply sends `notificationCreated` to whoever it mentions, so Activity no longer refreshes on every message; `unreadMentions` keeps only `byChannel`, `excerptOf` lives in `shared.ts`, and the channel state rules moved to `membership.ts` (no import cycle).


# Flow chat — Phase 2 slice 4: Channel details (spec 6.10, 6.1, §9) — 2026-10-28

Approved with my picks: part A (data and routes), part B (the Channel details modal and Add people), part C (Who can post in the channel), with the contract updated.

## Plan

Part A — data and routes
- [x] Channel `description` (≤ 250, '') and `whoCanPost` ('everyone' | 'admins', 'everyone'); mock DB v13 with its migration; seed and new channels get the defaults.
- [x] `PATCH /api/channels/:id` takes `description`; `whoCanPost` admins only (403); no more `memberIds` (the members routes replace it).
- [x] `POST /api/channels/:id/members { userIds }` and `DELETE /api/channels/:id/members/:userId`: members and admins, workspace people only, not yourself (Leave), not a project's channel or a DM; system messages "added …" and "removed … from the channel."; `channelChanged`.
- [x] At "Only admins", a non-admin's message or reply is refused (403 "Only admins can post in #x."); reactions still work.
- [x] http, hooks, query keys; tests first.

Part B — the Channel details modal
- [x] One levels menu shared by the header bell and the details header.
- [x] Modal: `# name` (lock when private), star, level button, ×; tabs About, Members (count), Settings (managers).
- [x] About: Channel name, Topic, Description cards with Edit in place (Save, Cancel, errors near the field); a project's channel shows its project read-only with Open project; Copy channel link ("Link copied"); Leave channel.
- [x] Members: Find members, rows (avatar, presence, name, title, "you"), Remove for managers; Add people (workspace people only, "Add N people"); a project's channel says its people follow the project.
- [x] Settings: Who can post (admins change it), Archive channel, the private note.
- [x] Entry points: the name (About, for everyone who can read), the members button (Members), Add a topic (Topic open), ⋮ "Channel details". The old drawer stays for New channel only.
- [x] Phones: 16px gutters, content scrolls, 44px targets; light and dark; axe.

Part C — Who can post in the channel
- [x] At "Only admins" a non-admin sees "Only admins can post in #x." instead of the composer, in the channel and the thread.

- [x] Contract section for slice 4. Tests first throughout; app check.

Rulings approved with the plan: linked project read-only (no linking for other channels yet); Add people takes workspace people only (emails and guests in slice 5); "Only admins" means workspace admins and covers thread replies; no details for DMs, no Tabs or Integrations tabs, no Start a call, no system message for the description.

Rulings while building: posting rules live in `can()` (`channel.restrictPosting`, `channel.post`); edits, deletes and reactions still work at Only admins (only new posts are refused); a private channel may go down to just me through Remove (the "Add at least one person" rule is for a new channel); the old drawer is now New channel only; ChannelDetails is presentational and ChannelPage wires it to the API; Archive from Settings closes the details and asks its usual question; Add people answers a typed email with "Pick someone in Spark Systems. Inviting by email comes later."; every sf Modal was 508px wide on a 390px phone (its max width was a percentage of its own grid track), now `min(540px, 100vw - 32px)`; sf Tabs are 44px tall on phones and show a count ("Members 4"); `useCanWrite` gates the composer only (useCanPost still gates reactions, edits and deletes).

## Review

- Part A (cd7f358): `description` and `whoCanPost` on channels (DB v13), the members routes with "added" and "removed" system messages, the PATCH without members, Only admins refused for new posts; `can()` rules.
- Part B (33b2587): Channel details with About, Members and Settings, Add people, the shared levels menu, the four entry points; sf Modal fits phones, sf Tabs counts and 44px phone height.
- Part C: "Only admins can post in #x." in place of the channel and thread composers; the contract section for slice 4.
- Verified: 1150 tests (axe in light and dark on every tab, the level menu and Add people; a 390px fit and 44px touch check), tsc, lint, `build:prototype`; in the app as Youssef: description saved, Mariam added then removed (both system messages shown), Only admins set; as Nour the composer line shows; set back to Everyone.
- Not pushed.

## Fresh review (slice 4) — 0 critical, 3 important, 16 minor

Fixed, test first:
- [x] On Settings, losing the right to manage (archived elsewhere, or taken off a public channel) crashed the page (`tabs.find(...)!`) → the shown tab falls back to About; an open field closes when its right goes.
- [x] An archived channel could still be renamed, re-described, re-staffed and re-archived → 400 "This channel is archived." on the details and members routes; `detailsRights` makes the details read-only (no Edit, no Settings) while archived.
- [x] Esc in the Add people suggestions closed the whole dialog and dropped the picks → `useEscapeLayer` skips an Esc a field already used (`defaultPrevented`); tested with real key presses inside the Modal.
- [x] Esc in an open card closed the details and lost the draft (re-graded up from minor, same harm) → Esc cancels the edit only; a second Esc closes the details.

Deferred minors:
- Enter doesn't save an open field (Ctrl/⌘+Enter for the description).
- Several cards can be open at once: several red Save buttons.
- First focus lands on the level button; focus can drop to the page after the topic is added.
- "Add a topic" reopens the topic field on coming back to About; a tab switch drops open drafts.
- Remove has no confirmation; two quick removes share one pending state.
- A description's line breaks are shown as one line.
- The Who can post radio jumps back while saving.
- Star, level and mute errors from the details header show behind the modal.
- Add people's refusals aren't announced (no live region on the TokenInput error).
- Under 44px on phones: the Modal ×, Add people's footer buttons, a chip's ×, Open project, Find members.
- A removed person's open thread says "couldn't load" rather than "You're not in this channel."
- Contract: who receives `channel.updated` on add and remove; the 403 sentence for a non-member of a private channel.
- Bad stored values (`whoCanPost: 'owner'`, a number for the description) block every edit.
- A retried send that already arrived gets 403 after a switch to Only admins (the clientId lookup should come first).
- An admin not in a public channel can "add" themselves ("added Youssef Abdelrahman").
- An archived project's channel shows no Project card.


## Slice 4 review minors — plan (2026-10-28)

Fix all 16, test first, one commit. Not pushed.

Details window (`ChannelDetails.tsx`, `Modal.tsx`, `TokenInput.tsx`)
- [x] M1 Enter saves a name or topic; Ctrl/⌘+Enter saves the description.
- [x] M2 One card edits at a time: About holds which card is open; opening another closes the first.
- [x] M3 Modal focuses the first control after × (the selected tab), not the level button; on close, a gone opener falls back to the header's name button.
- [x] M4 About stays mounted (hidden) on other tabs: drafts survive a tab switch and "Add a topic" opens the field once.
- [x] M5 Remove asks first ("Remove Nour El-Sayed from #backend?", what it means for a private or public channel); the question holds its own pending state, so no two removes overlap.
- [x] M6 A description keeps its line breaks (`whitespace-pre-line`).
- [x] M7 Who can post shows the picked choice while it saves, until the channel changes; back on failure.
- [x] M8 Star, level and mute errors show under the details header while it's open (reset on open), not behind it.
- [x] M9 TokenInput's error is its own `role="alert"` node, so Add people's refusals are announced.
- [x] M10 44px phone targets: Modal ×, Add people's footer buttons, chip ×, Open project, Find members; the phone test checks them.
- [x] M15 Add people doesn't suggest me; the server answers adding myself with 400 "Join the channel instead."

Page and thread
- [x] M11 A thread whose channel answers 403 says "You're not in this channel."
- [x] M16 An archived project's channel shows its Project card (archived projects looked up as in `useChannelRights`).

Mock and contract
- [x] M13 Migration 12 → 13 normalises bad values (`whoCanPost` not 'admins' → 'everyone', a non-string description → ''); `whoCanPost` is checked only when the patch sends it.
- [x] M14 A retried send finds its stored `clientId` before the rights check.
- [x] M12 Contract: `channel.updated` goes to the members and to whoever was added or removed; a private channel I'm not in answers 403 "You're not in this channel."; add myself → 400.

Rulings: Remove asks first in every channel, and the question holds the pending state (no per-row set needed); opening a second card closes the first and drops its draft; About stays mounted behind other tabs and `focusables` skips `[hidden]` parts; adding myself is 400 "Join the channel instead." and the UI never suggests me; the ChannelTop wiring (header errors reset on open, focus back to the name, archived project lookup) is covered by tests of its parts plus an app check, with no ChannelTop test.

## Review — slice 4 minors

- All 16 fixed, each test first (watched RED, then GREEN); the phone-size fixes made before their browser test were each undone once to see it fail.
- New tests: ChannelActions.test.tsx (`useChannelProject`), ThreadInspector.test.tsx (403 channel); more in ChannelDetails.test.tsx, layers.test.tsx, channelDetails.test.ts, migrations.test.ts, a11y.browser.test.tsx.
- Verified: 1182 tests, tsc, lint, `build:prototype`; in the app, details open with focus on About, Remove asks "Remove Hossam Gaber from #backend?" with Cancel focused, and closing gives focus back to the channel's name.
- Not pushed.


# Flow chat — Phase 2 slice 5: Add people with email invites (spec 6.10, §7 Invitation, §8) — 2026-10-28

Approved with my picks: part A (invitations data and routes), part B (Add people with emails, teams and the default-channel switch), part C (Invited in Members, with Revoke), with the contract updated. Guests (accepting, the guest role, what guests see) get their own slice.

## Plan

Part A — data and routes
- [x] `Invitation` { id, workspaceId, channelId, email (lowercased), role 'guest', invitedBy, status pending | accepted | revoked, createdAt }; channel `isDefault` (false; #general true in the seed); mock DB v14 with its migration.
- [x] `POST /api/channels/:id/members { userIds, emails? }`: emails trimmed and lowercased, valid ("x isn't an email address."), at most 20; an email of someone in Spark Systems adds that person; already in or already invited are skipped; nothing new → 400 "Everyone you picked is already in #x or invited."; email invites Admins only (403 "Only admins can invite people by email."); no system message for an invite.
- [x] `GET /api/channels/:id/invitations` (pending, for whoever may manage it) and `DELETE /api/invitations/:id` (whoever invited, or an Admin).
- [x] `PATCH /api/channels/:id { isDefault }`: Admins only, public channels only (a project's channel is refused already).
- [x] `can()`: `channel.inviteByEmail`, `channel.setDefault` (Admins). Invite and revoke send `channelChanged`, which refreshes the Invited list. http, hooks, query keys; tests first.

Part B — Add people (spec 6.10)
- [x] TokenInput chips by kind: person (avatar), email (mail icon, Guest tag), group in suggestions (team icon).
- [x] Suggestions: people by name or email, teams ("Backend · 4 people", adds those not in yet), and the typed email ("Invite as a guest", Admins); refusals near the field for anything else.
- [x] Helper text for email chips (one, or several); "Add N people" counts people and emails.
- [x] Admin-only block (eye icon, "Only admins can see this setting") with "When new people join Spark Systems, add them to #x", saving at once; public channels only.

Part C — Invited in Members
- [x] "Invited · N" under the members: mail icon, email, Guest tag, "Invited by X · 3h ago", Revoke (whoever invited, or an Admin); Find members narrows it too.

- [x] Contract section for slice 5; axe in both themes, 390px and 44px checks, real key presses for Enter and comma; app check.

Rulings while building: `addMembers(id, userIds, emails?)` keeps its slice 4 shape and adds emails, so one Add is one write; a team suggestion turns into a chip for each of its people not in yet (the server takes people only); a typed email matches a person from the start of their address (a shared domain would match everyone); the Members tab, Add people and the Remove question moved to `ChannelMembers.tsx` (ChannelDetails had grown past 600 lines), with `usePicked` shared by Who can post and the default switch; TokenInput chips and suggestions have a `kind` (person, email, group) instead of `person: true`; typed text no suggestion matches says why ("No one in Spark Systems matches “zed”.", "x isn't an email address.", "x is already invited to #backend.", "Nour El-Sayed is already in #backend.", "Only admins can invite people by email.").

## Review

- Part A (b7cbb0f): Invitation and `isDefault` (DB v14), email invites in the members route, the Invited and Revoke routes, the default-channel rule, `can()` actions, http and hooks.
- Parts B and C: Add people with emails, teams and the admin-only switch; Invited under the members with Revoke; the contract section for slice 5.
- Verified: 1210 tests (axe in light and dark on Add people with a guest chip, a team suggestion and the switch, and on the Invited list; 44px on a 390px phone for Revoke and the switch; Enter and comma with real key presses), tsc, lint, `build:prototype`. In the app as Youssef: invited sam@client.com and the Frontend team in one Add (2 people added, "added Mariam Fathy and Dina Mansour."), Invited · 1 shown, Revoke removed it live; #backend's members put back.
- Not pushed.

## Fresh review (slice 5) — 0 critical, 2 important, 5 minor

Re-graded by effect: M1 (a pasted "sam@client.com;" stored as an undeliverable invite beside the real one; a pasted list refused) and M3 (an email typed and not yet a chip silently dropped by Add, the slice's main path) up to Important.

Fixed, test first:
- [x] I1: a name already in the channel, mine, or a team all in said "No one in Spark Systems matches" → typed text is resolved by email, name and team: "Nour El-Sayed is already in #backend.", "Join the channel instead.", "Everyone in Backend is already in #backend.", "Everyone matching “a” is already in #backend.".
- [x] I2: Revoke, the default switch and Who can post dropped keyboard focus to the page while saving (a disabled control loses focus) → they stay enabled and focused while saving (Revoke is aria-disabled, a second press waits); after a revoke, focus goes to the next Revoke, else the one before, else Find members. Tested with real key presses in Chromium.
- [x] M1 → Important: emails allow letters, digits and . _ % + ' - before the @ and letters, digits and hyphens in the domain; a pasted list (commas, semicolons) becomes a chip each, and what can't be added stays typed with why. Contract updated.
- [x] M3 → Important: what's typed and not yet a chip goes with Add (and counts in "Add N people", with the guest helper text); text that can't be added stops the Add and says why.

Verified: 1217 tests, tsc, lint, `build:prototype`.

Minors, fixed afterwards on request (test first):
- [x] An error stayed after its cause was gone and hid the guest helper text → removing a chip or typing again clears it.
- [x] An archived channel could show a cached Invited list with a working Revoke → `useInvitations` shows none while it isn't enabled, and the mock's revoke answers 400 "This channel is archived." (contract updated).
- [x] A long email chip overflowed the field on a 390px phone → chips shorten with an ellipsis (the × keeps the full address), checked in Chromium at 390px.

Verified: 1222 tests, tsc, lint, `build:prototype`. Not pushed.


# Flow chat — Phase 2 slice 6: Files (spec 6.8 Attach menu, 6.9, §7 File, §8 files) — 2026-10-29

Approved with my picks: part A (files data and routes), part B (tray and upload), part C (file card, previews, menu, Share), part D (File details panel), with the contract updated. Not pushed.

## Plan

Part A — files data and routes
- [x] One file record for chat, comments and project files: today's `Attachment` plus uploadedBy, title, description, scanStatus (pending | clean | blocked), thumbUrl/previewUrl (backend), deletedAt; mock DB v15.
- [x] Upload in three steps: `POST /api/files/upload-url { channelId, name, size, mimeType }` → `{ file, uploadUrl }`; PUT the bytes (progress, cancel); `POST /api/files/:id/complete` → the file. One `api.files` call runs them; the mock simulates progress.
- [x] send and reply take `fileIds` (≤ 10, mine, complete, clean, uploaded for this channel); idempotent by clientId.
- [x] `GET /api/files/:id` serves chat files to whoever reads a channel they're in; `GET /api/files/:id/details`; `PATCH /api/files/:id { title?, description? }` and `DELETE /api/files/:id` (uploader or Admin; "This file was deleted." where it was); `POST /api/files/:id/share { channelId, content? }`.
- [x] Project-file removal moves to `DELETE /api/projects/:projectId/files/:fileId`.
- [x] Security review of part A: Share is for whoever uploaded the file or an Admin (nobody else carries it to a wider channel); Edit file details and Delete file are refused while a project or channel the file is in is archived.
- [x] Events: shared, updated, deleted refresh the messages, threads and details that show the file. http, hooks, query keys; tests first.

Part B — Attach menu, tray, upload
- [x] + opens the Attach menu ("Upload from your computer ⌘U") and turns into ×; ⌘U; drop onto the channel or thread; paste an image ("Pasted image …").
- [x] Tray: 232px cards (thumbnail or type icon, name, 4px progress or "PNG · 412 KB", ×); errors on the card with Retry.
- [x] Send waits for uploads ("Uploading 2 files…"); text and files as one message through the send queue; the thread composer too. 10 a message, size limit a setting (25 MB in the prototype).

Rulings while building: chat takes the same file types as the rest of the app (`fileTypes.ts`, Ahmed's list of 9 Oct, which the API checks too), not any type: widening uploads is a security call, and a one-line change if wanted; ⌘/Ctrl+U uploads in the channel and thread boxes (spec 6.8), so Underline there is its button only, and ⌘U still underlines in an edit; a drop anywhere on the messages pane or the thread's box adds files, and the box shows "Drop to add files" while they're over it.

Part C — file card, previews, menu, Share
- [x] Card: type label ("PDF ▾", collapses), 380px, title, "PDF · 184 KB", hover pill Download / Share / Details / More (phones: ⋯); "Checking for viruses…", "This file was blocked.", "This file was deleted.".
- [x] Previews: images and video inline (≤ 420px); PDF and text in the viewer (PDF frame sandboxed); office/RTF through the backend's preview, else download.
- [x] Menu: Copy link to file, Create task from file (project channels), Edit file details, Delete file (confirm; uploader or Admin).
- [x] Share: a channel or DM I can post in, an optional message.

Part D — File details panel
- [x] Right panel (full screen on phones), `?file=<id>`: preview, title, type and size, Download / Share / Open, Uploaded by, Uploaded, Shared in, Access, Description (Edit file details).

Rulings while building (C, D): the PDF preview frame stays unsandboxed: Chrome blocks PDFs in sandboxed frames, and the risk is covered by the `%PDF-` check, the application/pdf blob, the browser's own isolated viewer, and HTML/SVG not being uploadable at all; Share (and so its button) is for whoever uploaded the file or an Admin, after the security review; Create task from file is for channel messages, not thread replies; on a phone the card's ⋯ is always shown and holds Download, Share and Details too; the panel's address `?file=` closes a thread or ticket panel, one panel at a time.

- [x] Contract section for slice 6; axe in both themes, 390px and 44px, real key presses for ⌘U, drop and paste; app check.

Waits: Save for later (Saved, Phase 3); Add to folder and Add from Flow files (Files tab, Phase 3); Text snippet and code highlighting (Phase 3); voice and video (Phase 4); "Add to section" (OPEN).

## Review

- Part A (e06915e, then 3847cec after the security review): one file record (DB v15), the three-step upload, send and reply with files, details, Edit file details, Delete file, Share, project-file removal moved; Share is uploader or Admin, and files in an archived project or channel can't be edited or deleted.
- Part B (99af28f): + Attach menu, Cmd/Ctrl+U, paste, drop, the tray, Send waiting for uploads, the send queue and thread replies with files.
- Parts C and D (d1c6ec2): the file card, its pill and menu, the scan and deleted states, Edit file details, Delete file and Share windows, Create task from file, the File details panel.
- Checks: axe in light and dark on the tray, a card with its open menu, the three windows and the panel (it caught the card's open-button name, now "Open" + what it shows); on a 390px phone the tray's ×, the card's ⋯ (always shown) and the panel's buttons answer a 44px touch (it caught the tray clipping the ×'s touch area); the size limit reads VITE_MAX_FILE_MB.
- Verified: 1270 tests, tsc, lint, `build:prototype`. In the app as Youssef: dropped release-scope.pdf on #backend ("Uploading 1 file…", then "PDF · 1 KB"), sent it with text, opened Details (Uploaded by, Shared in, Access), renamed it (card and panel updated live), shared it to #general (Shared in updated live), deleted it ("This file was deleted." in both); the two test messages were deleted after.
- Seen in the app, not fixed: after Details from the card's ⋯ menu its tooltip can stay over the panel's ×; deleting a message whose file is already deleted still says "Its files are deleted with it."
- Not pushed.

## Fresh review (slice 6) — 0 critical, 5 important, 14 minor

Re-graded by effect: M5 (the file pill invisible but tappable on touch tablets, so Share, Details, Edit and Delete can't be found there; the message toolbar already handles no-hover screens) up to Important.

Fixed, test first:
- [x] I1: a paste from Word or Excel (text plus a picture of it) added a "Pasted image" and dropped the text → only a paste of files alone goes to the tray, as Lexical decides; tested with a real paste in Chromium.
- [x] I2: a file the scan blocked came back ready, so the send failed for good and the other files left the tray → only a clean file is ready; a blocked one says "This file was blocked." with only ×, and Send waits ("Remove the files that were blocked."); a still-checking one can be tried again.
- [x] I3: an office file's viewer saved the converted PDF under the .docx name (or left the app for a storage address) → the viewer shows the preview but Download saves the file itself under its own name.
- [x] I4: File details said "People on <project>" for a file in a project's channel, which the whole workspace can read → Access goes by the channel's own audience; "People on X" only for a project's own files.
- [x] I5: "Delete message?" said "Its files are deleted with it." (false since files can be in several places) and asked when every file was deleted already → it asks only for files not deleted, and says "Its files go from this message but stay wherever else they're shared."; contract updated.
- [x] M5 → Important: on a screen without hover the pill is always shown, and everywhere it stays while its menu is open.

Deferred minors:
- Undo of a deleted message brings back stale file copies (a file deleted or renamed meanwhile).
- After Details or a ⋯ item by keyboard, focus stays on the card and its tooltip over the panel; after Delete file, focus can be lost (your observation a).
- Create task from file is offered on a reply's copy in the channel; every file action is offered on unsent rows.
- Edit file details and Delete file are offered in archived channels and projects, where they fail.
- The type label is named only "PDF" (which file?) and is 39px wide on a phone.
- The thread composer drops files added while a reply is still sending.
- The File details panel takes about 7s to say a file is gone (its query retries on 404).
- The mock opens files still being checked.
- The mock's "not sent yet" ignores thread replies, so an uploader keeps access after leaving a private channel.
- A message with files can't have its text edited away, though files alone can be sent.
- A blocked file in a message has no Details or Delete file for its uploader or Admins.
- The panel's Open ignores the office preview; the viewer fetches a preview with cookies (CORS on signed addresses, unverified).
- Upload progress re-renders the whole channel page (not measured).

Verified: 1278 tests, tsc, lint, `build:prototype`. Not pushed.
