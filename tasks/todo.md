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
