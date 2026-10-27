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
- **Roles & permissions**: roles are `admin`, `sales`, `pm`, `member`; whoever a project names as manager has PM rights on it. `src/lib/permissions.ts` `can()` is the one rule table (spec §4.3): the mock refuses with 403 by it and the UI hides by it (`usePermission`). "View as" (user menu) is demo only.
- **Derived values**: `src/mocks/derive.ts` works out loggedHours, overdue (past due, or more hours than estimated; never when done), progress, expectedFinish, currentPhaseId and cost (admin only) on every read; nothing derived is stored. Pages take them from `TaskView` / `ProjectSummary`; `src/lib/hours.ts` `entryHours` is the one hours rule both sides use.
- **Time**: the rules (one check-in per local day, one running timer per person, manual entries can't overlap / be in the future / exceed 12 h, check-out stops the timer) live in `src/mocks/time.ts`; each write publishes `timeLogged`. A running clock is always `elapsedMs(startedAt, now)` with `useNow`, never a counter; durations show through `formatClock` / `formatHours`.
- **Mentions & comments**: the mention syntax (`@all`, `@[Name](userId)` from the composer's autocomplete, `@KEY-n`, `@KEY`) and its parser and `segments` live in `src/lib/mentions.ts`, shared by the mock and the pages; chips are built from parsed ids of people, tasks and projects that exist, everything else renders as plain text (never HTML). A task comment or bug also posts a card (`commentId`) in its project's chat; mentions of me feed the bell and Home (`mentionReads`, DB_VERSION 3).
- **Dashboard & Time and cost**: their figures come from the mock (`src/mocks/dashboard.ts`, `src/mocks/report.ts` with `derive`/`hours`), never from the page. `dashboard.view`: Admin and Sales see every project, a PM the ones they manage; "Checked in now" goes to Admin (everyone) and PMs (people on their projects). Cost and rates only with `cost.view` / `timeCost.view` (Admin). Report weeks start on Sunday; "last 7 days" is rolling.
- **Files**: every file `src`/`href` goes through `safeFileUrl`; PDFs preview only after the `%PDF-` check.
- When unsure how something should look, find the closest Spark CRM screen in `design/screenshots/` or pattern in `design/04-page-patterns.md` and match it.

## Commands

- `npm run dev`
- `npm run build:prototype`: the demo build gate, `tsc -b && vite build --mode prototype`
- `npm run build`: production build; fails unless `VITE_BACKEND=on` and `VITE_API_URL` are set. With the backend on, requests send cookies (`credentials: 'include'`); a 401 shows "You're signed out." with a link to `${VITE_API_URL}/signin?returnTo=<url>` (an assumption to agree with the .NET team)
- `npm run lint`
- `npm test`: unit tests (Node / jsdom) and browser tests (`*.browser.test.tsx`, headless Chromium through Playwright, for what needs real layout such as scrolling). Once per machine: `npx playwright install chromium-headless-shell`. One side only: `npx vitest run --project unit` or `--project browser`
- `npx vitest run <file>`
- `npm run preview:prototype`

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
- **Feature flag**: sidebar sections whose data lands in a later phase hide behind `chatRedesign` in `src/lib/features.ts`.
- Don't build anything marked OPEN in the spec's section 13.
