# Spark Flow — instructions for Claude

Spark Flow is a sister product of **Spark CRM** (Spark Systems). The two apps must look and behave like **one product**. The full design system, extracted from Spark CRM, is in `design/` (this kit). Read it before building any UI.

## Read first (every new session)

1. `design/README.md`
2. `design/01-foundations.md` — stack, tokens, dark mode, type, motion
3. `design/02-app-shell.md` — layout, sidebar, top bar, menus, search, loader
4. `design/03-components.md` — buttons, inputs, sheets, tabs, tables, charts
5. `design/04-page-patterns.md` — list / detail / dashboard / board / form / settings pages
6. `design/05-ux-rules.md` — behavior, phone rules, microcopy, do/don't
7. Look at `design/screenshots/` for the visual target.

## Hard rules

- **Stack**: React 19 + TypeScript + Vite, Tailwind CSS v4 (tokens in `src/index.css` `@theme`, no tailwind.config), lucide-react, clsx, TanStack Query, React Router. Inter font.
- **Copy, don't reinvent**: start from `design/reference-code/` — `src/index.css`, `index.html` (theme script, PWA meta), `components/ui/*`, `components/charts/*`, `layout/*`, `lib/{ThemeProvider,useTheme,loading,format}.ts`. Adapt imports; keep class strings identical. Remove CRM-only features (market switcher, View as, presales…) unless Spark Flow needs them.
- **Colors**: only semantic tokens (`bg-canvas`, `bg-surface`, `bg-surface-sunken/muted/strong`, `border-line(-subtle/-strong)`, `text-fg(-secondary/-tertiary/-muted/-subtle)`, `text-accent`, `bg-accent-soft`) and `brand-*`. Never raw `white`/`slate`/`gray` for surfaces or text. Status colors use `bg-{c}-50 text-{c}-700 dark:bg-{c}-500/15 dark:text-{c}-300`.
- **Every screen must work in light and dark** and **on a 390px phone**.
- **Shell**: dark ink sidebar with grouped nav, content as a floating rounded panel on desktop, sticky blurred top bar with search + round icon buttons + avatar, phone bottom nav + drawer. Logo lockup = white Spark logo + divider + `FLOW`.
- **Loader**: only the 2px red top `LoadingBar` + pulse skeletons. No spinners, no overlays.
- **Modals**: only `Sheet` (dialog / drawer, full-screen on phones, doesn't close by accident). Menus: only `MenuPanel` (dropdown → bottom sheet on phones).
- **Feedback**: no toasts; invalidate all queries after a mutation and close the sheet. Errors as sentences near the cause.
- **Microcopy**: English, sentence case, verb-first buttons, `…` for pending ("Saving…"), ` · ` separators, `—` for empty.
- **Formatting**: use `lib/format.ts` (money "EGP 1.2M", "3h ago", "Today 2:00 PM", "3 Oct 2026"). `tabular-nums` for numbers.
- **One primary (red) button per view.**
- **RTL-ready**: logical direction classes only (`ms-/me-/ps-/pe-/start-/end-/text-start/border-s…`); directional icons get `rtl:-scale-x-100`. `src/rtl.test.ts` enforces it.
- **Voice** (from `spark-design-system.md`): specific, numbers over adjectives, no buzzwords, short active sentences, Western digits.
- **Charts**: red for the key series plus greys, max 4 series, the takeaway in the title, no other hues.
- **Data**: components import hooks from `@/api/*` only, never `@/mocks`. `src/api/*` holds hooks plus `types.ts` contracts; `src/lib/api.ts` + `src/lib/http.ts` + `src/lib/realtime.ts` are the only transport switch points; `src/mocks/*` is the mock backend: one document in IndexedDB (`spark-flow.mock`), each write one transaction (`src/mocks/store`), memory when IndexedDB is blocked. `src/layout/RealtimeBridge.tsx` turns live events into query invalidations.
- **Roles & permissions**: roles are records an Admin edits on Settings → Roles and permissions (`api.roles`, DB v24); a person holds one or more (`roleIds`) and gets every permission of each (`grantsOf`; `me` carries `grants`). The built-in `admin`, `sales`, `pm`, `member` start with the old rights and can't be deleted. `src/lib/permissions.ts` holds the permission list (`PERMISSION_GROUPS`) and `can()`, the one rule table (spec §4.3): grants plus record rules (whoever a project names as manager has PM rights on it, authors, channel members). The mock refuses with 403 by it and the UI hides by it (`usePermission`); never check a role id. "View as" (user menu) is demo only.
- **Audit log** (Admin and help slice 2, spec §4.5): every recorded write appends a chained entry with `audit()` (`src/mocks/audit.ts`) inside its own `db.update`, never after it, and every 403 is recorded by the wrapper in `createMockApi`. A new `Api` method fails `src/mocks/audit.test.ts` until it's listed there as recorded (with a call that must log) or not recorded (with why). `lib/auditChain.ts` is the chain and the tamper check; nothing changes or removes an entry. Settings → Audit log needs `audit.view`; downloads and the Time and cost CSV are reported through `noteDownload` / `noteExport` from `@/api/audit`.
- **People** (Admin and help slice 3, spec §4.6): Settings → Users adds, edits, deactivates and reactivates people (`api.users`, `settings.manage`). A deactivated person keeps their name on what they did but leaves every picker: offer people through `pickable` / `isActive` in `lib/people.ts`, and the mock refuses adding them with `requireActive` in `src/mocks/shared.ts`. A person's `teamIds` and each team's `memberIds` change together.
- **Archived records** (Admin and help slice 4, spec §4.7): archiving asks "Why?" (`archiveReason`, `archivedBy`, set with `setArchivedFields` in `src/mocks/archive.ts`); Settings → Archived records (`api.archive`, `archive.manage`, DB v26 `settings.archiveRetentionDays`) lists them and deletes for good after the retention, never with time logged and never a channel.
- **Attendance** (Admin and help slice 5, spec §4.8): check-in and check-out store `inFrom`/`outFrom` (IP and device from the request, the browser's place from `lib/geo.ts`, sent by `useCheckIn`/`useCheckOut`); `layout/ActivityTracker.tsx` pings `api.attendance.ping` into visits. Settings → Attendance (`api.attendance`) shows them to yourself and, by `checkins.all` / `checkins.managed`, to others (`visibleTo` in `src/mocks/attendance.ts`). Late and early come from `lib/workHours.ts` with `settings.workHours` (DB v27), read in the hours' own time zone.
- **Help** (Admin and help slice 6, spec §4.9): chapters are `src/help/*.md` (front matter `title`, `group`, `order`, `summary`, `needs`), parsed by `lib/helpMarkdown.ts` and rendered as elements by `pages/help/HelpDoc.tsx`. A new page gets help in `lib/pageHelp.ts` (or a reason in `NO_HELP`); `lib/pageHelp.test.ts` fails otherwise. Rerun `npm run help:shots` when a pictured page changes.
- **Signing in** (slice AB, spec §4.10): `/signin` (`pages/signin/SignInPage.tsx`) is outside the shell; `api.auth` signs in and out, and every other call is a 401 while signed out (`guardRequests` in `src/mocks/index.ts`). The prototype's session is the browser's (`localSession` in `src/mocks/actor.ts`), so a first visit opens on Sign in; the demo list and `DEMO_PASSWORD` (`lib/demo.ts`) are prototype only. AppLayout sends a 401 to `/signin?returnTo=`.
- **Derived values**: `src/mocks/derive.ts` works out loggedHours, overdue (past due, or more hours than estimated; never when done), progress, expectedFinish, currentPhaseId and cost (admin only) on every read; nothing derived is stored. Pages take them from `TaskView` / `ProjectSummary`; `src/lib/hours.ts` `entryHours` is the one hours rule both sides use.
- **Time**: the rules (one check-in per local day, one running timer per person, manual entries can't overlap / be in the future / exceed 12 h, check-out stops the timer) live in `src/mocks/time.ts`; each write publishes `timeLogged`. A running clock is always `elapsedMs(startedAt, now)` with `useNow`, never a counter; durations show through `formatClock` / `formatHours`.
- **Timer** (timer slice 1, spec `2026-11-05-task-timer-and-dashboard-design.md`):
  - **Storage:** Pause closes the running entry with `endReason: 'paused'`, and Resume starts a new entry on the same
    target.
  - **Reading it:** `MyDay.timer` (`currentTimer` in `src/mocks/time.ts`) is worked out on read: my running entry, or
    a run paused today. `runMs` is the run's closed time, and the bar shows it with `timerClock` in
    `layout/TimerBar.tsx`.
  - **Flow's stops** (Done, archive, deactivate, the 12-hour limit) write `'flow'` through `endEntry` in
    `src/mocks/timers.ts`.
  - **Where it started from:** `startedFrom` (IP, device, place) stays in the store. Time reads leave it out
    (`shown`), so only Attendance shows it.
  - **Controls:** the top bar's Start timer, the pill, the phone bar, Home and the task panel all use
    `TimerControls`.
  - **Picking my timer:** "my newest entry" goes by when entries end, with a running one first, so an edited start
    can't reorder them.
  - **Timeout** (timer slice 2): `settings.timerTimeoutHours` (DB v29, 1–12, default 4, `timeoutProblem` in
    `lib/hours.ts`) is set on Settings → Attendance.
    - The scheduler's `timeoutTimers` ends a running entry at exactly `startedAt + timeout` as `'timeout'`.
    - `layout/StillWorkingDialog.tsx` then asks Continue or Keep paused, and remembers a Keep paused per entry in
      `sessionStorage` (`spark-flow.timeoutSeen`).
    - `__sparkFlowDev.ageTimer(hours)` ages my running timer for a check.
- **Mentions & comments**: the mention syntax (`@all`, `@[Name](userId)` from the composer's autocomplete, `@KEY-n`, `@KEY`) and its parser and `segments` live in `src/lib/mentions.ts`, shared by the mock and the pages; chips are built from parsed ids of people, tasks and projects that exist, everything else renders as plain text (never HTML). A task comment or bug also posts a card (`commentId`) in its project's chat; mentions of me feed the bell and Home (`mentionReads`, DB_VERSION 3).
- **Dashboard & Time and cost**: their figures come from the mock (`src/mocks/dashboard.ts`, `src/mocks/report.ts` with `derive`/`hours`), never from the page. `dashboard.view`: whoever holds `dashboard.all` (Admin, Sales) sees every project, anyone else the ones they manage; "Checked in now" shows everyone with `checkins.all` (Admin) and the people on projects they manage with `checkins.managed` (PM, Member). Cost and rates only with the `cost.view` and `rates.manage` permissions (Admin). Report weeks start on Sunday; "last 7 days" is rolling.
- **Message bodies**: messages and replies store `body`, structured rich text from `src/lib/messageBody.ts` (`parseBody`, shared by the mock and the pages); the channel renders it as elements in `pages/chat/MessageBody.tsx`, never as HTML. Task chips come from `api.tickets.resolve`.
- **Composer**: the channel's composer is Lexical (`pages/chat/composer/`): `bodyEditor.ts` converts the editor to and from a message body (round-trip tested headless), and the keys, autocomplete and drafts are tested in the browser project. Enter never sends while the autocomplete is open or an IME is composing. A thread replies with `ThreadComposer` (the rich composer, its formatting row hidden until Aa, plus Also send to #channel) and an edit uses the rich editor too; a project's Chat tab is the channel's own `ChannelView` (slice AA). The old textarea `Composer` serves task comments only. Browser tests type into an editor after `focusEditor` (`composer/focusEditor.testkit.ts`).
- **Files**: every file `src`/`href` goes through `safeFileUrl`; PDFs preview only after the `%PDF-` check.
- When unsure how something should look, find the closest Spark CRM screen in `design/screenshots/` or pattern in `design/04-page-patterns.md` and match it.

## Commands

- `npm run dev`
- `npm run build:prototype`: the demo build gate, `tsc -b && vite build --mode prototype`
- `npm run build`: production build; fails unless `VITE_BACKEND=on` and `VITE_API_URL` are set. With the backend on, requests send cookies (`credentials: 'include'`); a 401 opens Flow's own `/signin`, which posts to `/api/auth/sign-in` (spec §4.10, to agree with the .NET team)
- `npm run lint`
- `npm test`: unit tests (Node / jsdom) and browser tests (`*.browser.test.tsx`, headless Chromium through Playwright, for what needs real layout such as scrolling). Once per machine: `npx playwright install chromium-headless-shell`. One side only: `npx vitest run --project unit` or `--project browser`
- `npx vitest run <file>`
- `npm run preview:prototype`
- `npm run help:shots`: builds the prototype and retakes help's screenshots into `public/help/`

## Shared identity with Spark CRM

- Same theme storage key style (`spark-flow.theme`) and same Light/Dark choice; if both apps share sign-in later, the theme is saved on the account.
- Same roles vocabulary and the same tone of voice.
- Cross-links between the apps should feel like moving between sections of one app.

## Flow chat redesign (`docs/flow-chat/`)

The approved chat redesign (`docs/flow-chat/FLOW_CHAT_REDESIGN.md` + `design/`) overrides the rules above **inside the shell and chat only**:

- **Scope**: its tokens live in `src/styles/flow-tokens.css`, scoped to the `.sf` class (sidebar, top bar, chat pages, and the portals of `sf` primitives). Utilities are prefixed `sf-` (`bg-sf-surface`, `text-sf-text-muted`, `rounded-sf-md`…). Other modules keep the tokens above.
- **Font**: Readex Pro (self-hosted, `@fontsource-variable/readex-pro`), weights 300–600, never 700, inside `.sf`.
- **Icons**: Tabler through `src/components/sf/Icon.tsx` (stroke fixed at 1.5; 20 default, 18 dense rows, 16 chips). lucide stays in other modules.
- **Primitives**: `src/components/sf/*` (Button, IconButton, Avatar, Badge, Tag, Kbd, Tooltip, Menu, Modal, Toast, Toggle, Checkbox, TokenInput). Chat uses these, not `components/ui/*`. Toast is only for Undo after a delete; all other feedback rules still hold.
- **Names**: Call, Page, Task list, Automation, Saved, Create task.
- **Gallery**: `/dev/ui` (prototype build only) shows every primitive state in both themes; component tests are `*.test.tsx` in jsdom, and scrolling and layout tests are `*.browser.test.tsx` in Chromium.
- **Shortcuts and snippets** (spec 6.8, 6.9): the built-in `/` commands are data in `lib/slashCommands.ts`; the channel decides which it offers and what they do in `pages/chat/composer/useChannelCommands.ts`, through the same hooks as its menus; the composer only lists, parses and runs them (`slash` prop). A text snippet is a `.txt` chat file with `snippet.language`; `lib/codeTokens.ts` highlights it by ink weight only.
- **Pins, files, folders, bookmarks** (spec 6.1, 6.5, 6.9): Pin, Folder and Bookmark are mock records (DB v20) behind `api.pins`, `api.folders`, `api.bookmarks`; a message's `pin` is derived on read. File actions (Save for later, Add to folder) come through `FileActions` from the page's provider, so file cards need no query client. Web addresses go through `lib/webAddress.ts` (http and https only).
- **Workspaces** (spec 5.5): the sidebar shows one side at a time, Projects or Chat. The side comes from the address (`lib/workspaceMode.ts` `modeOf`; Settings and search keep the last side) and never from a stored flag; the switch under the logo (`layout/ModeSwitch.tsx`), G then P / G then C and the phone bar all go through `useGoToMode`, which reopens that side's last place (`uiStore.lastByMode`). A new page joins a side by matching `modeOf`'s patterns, with a test in `workspaceMode.test.ts`.
- **Link previews** (spec 6.3): any http/https link; one card per message, for its first link outside code (`lib/linkPreview.ts`). The card is `pages/chat/LinkPreviewCard.tsx`; the composer only picks the link, waits for a pause and keeps the × choice (`linkPreview` prop), which goes out as `noPreview` on the body's link. Images load only from the app's or the API's origin (`ownImage`); the card links to the message's own address.
- **Threads** (spec 6.12): `api.threads` lists followed threads as cards and reads them through Activity's read state (no second marker). The view is `pages/chat/threads/`: `ThreadCardView` is the card's layout, `ThreadsPage` keeps "N new", the order and unfollowed cards for as long as the view is open (`threadOrder.ts`), and `useSeen` reads a card after a second on screen. A thread I mute (`setThreadMuted`, slice AA) stays followed, but only mentions of me count or notify (`mutedThread` in `mocks/chat.ts`, `notifies`' `threadMuted`). A thread's reply box is `ThreadReplyBox`, shared with the panel.
- **Search** (spec 6.12): the address holds the query as typed; `lib/searchQuery.ts` parses it, rewrites it for the chips and matches and highlights, shared by the page and the mock index (`mocks/search.ts`, access per §9). The page turns names into ids (`resolveSearch`) and sends the §8 parameters. Ways in: the top bar box's last row or ⌘/Ctrl+Enter, the channel header's 🔍 and ⌘/Ctrl+F (`channelScope`), and `/search`; `lib/openSearch.ts` puts the caret in the box.
- **Sidebar order** (spec 5.1): my order of Starred, Channels and Projects is a server list of ids per workspace and section (`api.sidebar`, DB v22); `lib/sidebarOrder.ts` applies it (saved first, the rest in default order, muted last) and keeps a drop on its side of the muted line. `layout/SortableSideList.tsx` drags rows with the sensors the board uses (`lib/dragSensors.ts`); Space alone picks up, as Enter opens the row.
- **Preferences** (spec 6.11): one `Preferences` record per person (`api.preferences`, DB v23); a channel reports the level that applies and `notifyLevelOwn`. Keywords count as mentions in `mocks/mentions.ts`. What reaches me outside the app is `notifies` in `lib/notifyRules.ts`, with `dndState` for Do Not Disturb; `layout/DesktopNotifier.tsx` shows browser notifications from live events while no Flow tab is in front (`lib/flowInFront.ts`; reads go through `useNotifyLookups`). Saves are optimistic (`useUpdatePreferences`). The bell's way to Preferences is a `PreferencesLink` prop, so the menu stays free of queries.
- Don't build anything marked OPEN in the spec's section 13.
