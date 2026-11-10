# UX Phase 6: Checks in the test suite, role walkthroughs and polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the audit's checks run in `npm test` for every page, role, theme and screen size. Every sheet and dialog is checked from the keyboard. Each role's walkthrough is a test. The help, specs and polish items the audit left open are done, and so are the earlier phases' deferred minors that a person can notice. This covers audit items 6.1–6.4.

**Architecture:**
- **One harness.** The browser test project renders the whole app: the real routes in a memory router, the real query client, and the mock backend with no fake network time. A case picks a person by the mock's session, a theme by the theme key, and a size by the viewport. It waits until the page has settled, then runs one set of checks.
- **Two sizes of matrix.** `npm test` runs a pairwise set (every page as every role, each page in both themes and all four sizes; 122 loads, about 30 s). `npm run test:ux` runs the whole matrix (968 loads, about 4–5 min) before a phase lands.
- **The same harness** drives the keyboard test of every sheet and dialog and the four role walkthroughs.
- **Polish** fixes the open items from 6.3 and 6.4, and 28 of the earlier phases' deferred minors, each with its test first.

**Tech Stack:** React 19, TypeScript, React Router 8 (`createMemoryRouter`), TanStack Query, Vitest 5 browser project (Playwright Chromium), axe-core 4.14.

**Spec:** `spark-flow-web/docs/ux-audit/2026-11-09-ui-ux-audit.md` (main checkout, untracked), Phase 6, lines 733–775. Its section 6 row for Phase 6 reads: "The UX check runs in `npm test`; role walkthroughs pass; help and rules updated." Section 9A lists the checks the audit ran and what they found.

## Global Constraints

- **Hard rules in `CLAUDE.md`:**
  - semantic tokens only;
  - no toasts (except Undo after a delete), spinners or overlays;
  - sentence case and curly ’ (`src/copy.test.ts`);
  - logical direction classes (`src/rtl.test.ts`);
  - light, dark and 390 px;
  - one primary red button per view.
- **Product code changes only where a decision below says so.** The harness needs two small exports: `appRoutes` from `src/router.tsx`, and `createQueryClient` moved out of `src/main.tsx`. Everything else in Tasks 1–6 is test code.
- **No new dependencies.** axe-core, Playwright and Vitest's browser project are already installed.
- **Tests come first in every task.** A matrix or walkthrough failure that the task fixes is that fix's failing test.
- **Gates:**
  - `npx tsc -b`, `npm run lint`, `npm test` and `npm run build:prototype`;
  - from Task 4 on, `npm run test:ux` too.
  - vitest runs outside the sandbox here.
- **Branch:** `feat/ux-phase-6` in `Spark_Flow/.worktrees/ux-phase-6`, from `origin/dev` at 9b96ac1 (Phase 5B landed). One commit per task. No push or merge; the user decides.

## What a planning spike measured (10 Nov, deleted afterwards)

A throwaway browser test rendered the whole app this way for 9 pages, as Admin (1440, light) and as Member (390, dark).
- **Speed:** 18 loads, with axe on each, took 4.0 s in all. That is about 50–470 ms to settle and 15–140 ms for axe.
- **Clean:** there were no console errors and no sideways scroll.
- **axe found serious contrast problems** at 1440 in light:
  - Projects, Board and Users had 18–42 nodes each, and Time & cost and Help had 3 each;
  - they were on the sidebar's rows, the Start-timer button and the Projects row's project chip.
  - The Phase 5B sweep found none of these.
  - Some are likely axe measuring during the 150 ms fade-in, because the harness did not yet wait for animations. Task 1's settle rule waits for them, and Task 4 sorts out the rest.

## Questions for the user (recommended answer first)

- **Q1. How much of the matrix runs in `npm test`?**
  - **Pairwise (recommended):** every page as every role, with each page in both themes and all four sizes. That is 122 loads, about 30 s added. The whole matrix (968 loads, about 4–5 min) runs as `npm run test:ux` before each phase lands.
  - The alternative is the whole matrix in `npm test`, which adds about 4–5 min to every full run.
- **Q2. What happens to what the first full run finds?**
  - **Recommended:** small fixes are made in Task 4. A finding that needs a design call goes into `UX_KNOWN` with its reason and is reported to you, and an entry fails once it stops happening.
  - The alternative is to fix everything in this phase, whatever the size, which has an open-ended cost.
- **Q3. Role walkthroughs (6.2):**
  - **Recommended:** four automated walkthroughs, each at desktop light and phone dark (8 tests), that rerun with every `npm test`.
  - The alternative is a manual checklist run once and noted in `tasks/todo.md`.
- **Q4. Which deferred minors does this phase fix?**
  - **Recommended:** the audit's open 6.4 items, the Phase 5B minors, the 24 noticeable minors from Phases 1, 3, 4 and 5A, and 4 cheap internal ones. Left out: the mentions scan cost (backend) and one old test flake (watched).
  - The alternative is the audit's own 6.4 list and the 5B minors only, with the 24 left in a backlog.
  - Either way, the roughly 190 minors deferred by feature slices before the audit stay out of scope.
- **Q5. Specs and the kit's docs:**
  - **Recommended:** update the company spec §5 and `FLOW_CHAT_REDESIGN.md` to the Dashboard-start and My work ruling. Leave `design/` (the CRM kit) as it is; Flow's exceptions stay in `CLAUDE.md`.
- **Q6. How is it run?**
  - **Native (recommended),** as in earlier phases: I build all 11 tasks, then one Opus review of the whole branch, then one fix pass.

## Decisions

**D1. The harness** (6.1). It lives in `src/test/app.tsx`.
- **Routes and query client:**
  - `src/router.tsx` exports `appRoutes: RouteObject[]`, which is the array it gives `createBrowserRouter`.
  - `src/lib/queryClient.ts` exports `createQueryClient(): QueryClient`. It holds the options and the 401 and mutation cache handlers that are in `main.tsx` today, and `main.tsx` uses it.
- **`renderApp({ path, as, theme, size }): Promise<AppHandle>`** does the following:
  - Sets the mock's `latency` to 0, and clears `localStorage` and `sessionStorage`.
  - Sets `spark-flow.session`: Admin is `u-1` Youssef, PM is `u-2` Nour, Member is `u-3` Mariam, and Sales is `u-9` Karim. A `null` role removes the key, which means signed out.
  - Sets `spark-flow.theme` to the theme, and calls `page.viewport(w, h)` with the size.
  - Renders `QueryClientProvider` › `LoadingBar` › `ThemeProvider` › `RouterProvider` with `createMemoryRouter(appRoutes, { initialEntries: [path] })`, the same tree as `main.tsx`.
  - Returns `{ router, queryClient, consoleErrors: string[], settled(): Promise<void> }`.
- **`settled()`** waits for all of the following, then two animation frames. It times out after 10 s with "The page didn't settle: …":
  - an `h1` with text;
  - `queryClient.isFetching() + isMutating() === 0`;
  - no `[aria-busy="true"]`;
  - every animation with a finite iteration count finished (`document.getAnimations()`).
- **Console errors:** `console.error`, `error` events and `unhandledrejection` events are collected from the moment of render.
- **Sizes:**
  - desktop 1440 × 900;
  - laptop 1280 × 720;
  - tablet 768 × 1024;
  - phone 390 × 844.
  - These are the audit's four.

**D2. The checks** (6.1). `src/test/uxChecks.ts` exports `pageProblems(handle): Promise<string[]>`, where each problem is one line such as "sideways scroll: 412 px wider than the window". It checks the following:
- **Sideways scroll:** `documentElement.scrollWidth - innerWidth > 1`.
- **More than one primary button:** count the visible `button, a, [role=button]` elements that are wider than 40 px and whose computed background equals the computed `--color-brand-500`. More than one is a problem, named by each element's accessible name.
- **Spinners:** any visible `.animate-spin` element.
- **Console errors:** anything in `handle.consoleErrors`.
- **Missing `h1`:** no `h1` in the document.
- **axe:** `axeProblems(document, { tags: AUDIT_TAGS })` reports serious and critical problems.
  - `AUDIT_TAGS` is `['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']`, the audit's set.
  - The set includes `target-size`, which is the audit's "phone targets under 24 px".
  - `axeProblems` gains `opts.tags`, passed to axe as `runOnly`.

**D3. The matrix** (6.1). It is defined in `src/test/uxMatrix.ts` and run by `src/ux.browser.test.tsx`.
- **`UX_PAGES` (30 pages, under `/w/engineering/`):**
  - `dashboard`, `''` (My work), `projects`, `teams`, `time`;
  - `p/NEX/` plus `overview`, `tasks`, `tasks?ticket=NEX-101` (the task panel), `chat`, `time`, `history` and `files`;
  - `c/c-general`, `activity`, `threads`, `search?q=login`, `preferences`, `saved`, `drafts`;
  - `settings` plus `/users`, `/roles`, `/audit`, `/archived`, `/attendance`, `/rates` and `/database`;
  - `help`, `help/tasks`;
  - and `/nowhere` (Not found, outside the workspace).
  - Sign in (`/signin`, signed out) is a separate case with no role.
  - A page a role can't open is still loaded: its "no access" page is checked like any other.
- **`uxCases(mode: 'pairwise' | 'full'): UxCase[]`**, where `UxCase = { id, path, as, theme, size }` and the `id` reads "Member · dark · 390 · /settings/users".
  - **`full`** is every page × 4 roles × 2 themes × 4 sizes, plus Sign in × 2 × 4: 968 cases.
  - **`pairwise`** is every page × every role once (120), plus Sign in at desktop light and phone dark: 122 cases.
    - For page `p` and role `r`, the size is `SIZES[(p + r) % 4]` and the theme is `THEMES[((p + r) % 4 + Math.floor(r / 2)) % 2]`.
    - So each page gets all four sizes and both themes, and each size appears in both themes.
- **The mode comes from the environment:**
  - `vite.config.ts`'s browser project has `provide: { uxMatrix: process.env.UX_MATRIX === 'full' ? 'full' : 'pairwise' }`, and the test reads it with `inject('uxMatrix')`, typed through a `ProvidedContext` augmentation.
  - `package.json` gets `"test:ux": "UX_MATRIX=full vitest run --project browser src/ux.browser.test.tsx"`.
- **One `it` per case**, so a failure names its page, role, theme and size.

**D4. Known problems** (6.1, Q2).
- `src/test/uxKnown.ts` exports `UX_KNOWN: { match: Partial<Pick<UxCase,'path'|'as'|'theme'|'size'>>; problem: string; why: string }[]`.
- A case's problems that start with a matching entry's `problem` are set aside. What is left must be `[]`.
- An entry that matches a case but finds nothing there fails with "Known problem no longer happens — remove it from uxKnown.ts". The list can't go stale.
- **Task 4 runs the full matrix once.** Each finding that a small change fixes is fixed in that task.
  - Small means a class or prop change in one or two files.
  - The failing case is the fix's test.
- A finding that needs a design call goes into `UX_KNOWN` with its reason, and is reported to the user. The list starts empty.

**D5. Every sheet and dialog from the keyboard** (6.1). `src/layers.browser.test.tsx` has one table entry per layer: `{ name, path, as, open: (screen) => Promise<HTMLElement> /* clicks the opener, returns it */, field: string /* label of a text field to change */, kind: 'sheet' | 'modal' }`. Each layer is opened as Admin at 1440 light. Each entry checks the following:
1. **Focus is inside** the dialog when it opens.
2. **Tab stays inside:** Tab, pressed (number of focusables + 2) times, never leaves it, and Shift+Tab from the first focusable reaches the last.
3. **axe:** `axeProblems(dialog, { tags: AUDIT_TAGS, skip: ['region'] })` is `[]`.
4. **Type** "x" into `field`. Then Esc:
   - a kit `sheet` stays open with the text kept. A form sheet doesn't close on Esc; that is the kit's rule ("doesn't close by accident").
   - a `modal` asks its discard question.
5. **✕ asks "Discard …?"** Keep editing leaves the dialog open, with the text and with focus inside it.
6. **Cancel**, then the discard button, closes it, and focus is back on the opener.

Layers with no form (plain sf Modals) skip steps 4–5. For them, Esc closes the dialog and focus returns to the opener. The table covers these layers:
- **Kit sheets:**
  - New task and Edit task;
  - New project and Edit project;
  - Deliverable;
  - Manage phases;
  - Add column and Edit column;
  - Add time;
  - Add person and Edit person;
  - New team and Rename team;
  - New role and Rename role;
  - Archived records' retention;
  - Attendance's work hours.
- **sf Modals with a form:** New channel and New message.
- **sf Modals without one:**
  - Start timer;
  - Add a bookmark;
  - New folder;
  - Jump to date.

**D6. Role walkthroughs as tests** (6.2, Q3). `src/journeys.browser.test.tsx` has one `describe` per role. Each walkthrough runs twice: at desktop light and at phone dark. Before each run the mock is reset (`api.db.reset()`). Each step asserts what a person would see, and the walkthrough fails at the first step that doesn't work.
- **Member (Mariam):**
  - signs in from `/signin` through the demo list and lands on the Dashboard;
  - starts the timer on NEX-106 (hers, To do) from Start timer, and the pill or bar shows the key;
  - comments on NEX-106 with a file attached (`userEvent.upload`), and the comment and file show;
  - moves NEX-106 to In progress in the panel;
  - stops the timer;
  - on the project's Time tab, edits one of her earlier entries, moving its start 30 minutes later, and the list shows the shorter length.
- **PM (Nour):**
  - New task with a description and an attachment;
  - Cancel asks "Discard …?", and Keep editing keeps the text;
  - creates the task, and "Task NEX-… created." is announced;
  - assigns it to Mariam;
  - adds 1 h for Mariam on the project's Time tab, and the list says "Added by Nour El-Sayed";
  - the Dashboard shows the project card.
- **Admin (Youssef):**
  - adds a person and a team with that person;
  - gives the person the PM role;
  - Attendance shows Days, and Time & cost shows totals;
  - archives a project with a reason;
  - deletes it for good from Archived records, typing its name, and Delete stays disabled until the name matches.
- **Sales (Karim):**
  - creates a project;
  - the Dashboard lists it;
  - its Overview opens.

**D7. Help and specs** (6.3, Q5).
- **Help:**
  - `src/help/getting-started.md` says My work, not Home, under More.
  - `src/help/archived.md` says that Delete for good asks you to type the record's key. Today it says "It asks first" (deferred minor #5).
  - A short "Unsaved changes" section in `getting-started.md` says that Cancel, ✕ and Back ask "Discard …?" before throwing typed work away, and that Esc doesn't close a form.
- **Specs:**
  - The company spec's §5 (`docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md`, lines 442–463) and `docs/flow-chat/FLOW_CHAT_REDESIGN.md` (lines 29, 232, 249, 253) now carry the Phase 2 ruling: the Dashboard is everyone's start and `/`, My work is Home and My tasks in one, and the phone bar is Dashboard · Projects · Chat · More.
  - `design/` (the CRM kit) stays as it is. Flow's exceptions live in `CLAUDE.md`.
- **Pictures:** `npm run help:shots` is rerun if Task 7 or 8 changes a pictured page.

**D8. Polish** (6.4, Q4). Each item gets a test first.
- **Undo that fails:** the toast's action may return a promise.
  - While it runs, the button reads "Undoing…".
  - If it fails, the same toast shows the error sentence and stays until dismissed.
  - `MessageActions` passes `() => restore.mutateAsync(target)`. There is no second toast.
- **Manage phases** announces "Phase added." and "Phases saved.", as 5A's D9 planned.
- **Start timer, "Log on the project only":** Start stays enabled. Pressing it with no project picked says "Pick a project." under the picker, following the Phase 4 form rule.
- **Arrow keys don't fill Back:**
  - `SegmentedControl` and sf `Tabs` call `onChange(value, { keys: true })` when an arrow key moves the choice.
  - The address-bound pages pass `{ replace: true }` then: TasksTab's view, Time & cost's period, and Activity, Saved, Drafts and Search's tabs.
  - A click still adds a history entry.
- **Phase 5B's minors:**
  - The stuck project name truncates: an inner `truncate` span inside the flex span.
  - The channel name stays tappable beside the star: the name button gets `relative z-[1]`.
  - The bookmark strip doesn't scroll by itself: "Add a bookmark" is `max-md:size-11` instead of a `touch-target`.
  - "3 Oct 2026 · late" stays on one line: the Due cell gets `whitespace-nowrap`.
  - Sticky headers don't hide focus: `scroll-padding-top` matches the sticky stack. That is `7.5rem` on the document below `lg` (top bar plus one sticky row), and `4rem` on the page column from `lg`.
- **Earlier phases' deferred minors:** see D9.

**D9. Earlier phases' deferred minors** (Q4).
- **Where the list came from:** the final reviews of Phases 1, 3, 4 and 5A deferred 33 minors. A read of the code at 9b96ac1 found 3 fixed, 29 still open and 1 unsure.
- **In scope:** the 24 open items a person can notice, and 4 cheap internal ones (a, b, c, d below).
- **Out of scope** (reasons given in the final report):
  - #10, the mentions scan with `find()` on every poll. That cost belongs to the backend.
  - #33, the one-time RichComposer flake. The matrix runs will show whether it comes back.
- **Forms and sheets:**
  - **#3:** Column, Deliverable and Project sheets compare against the values as opened, not live props. A change from another tab doesn't make an untouched sheet ask "Discard …?".
  - **#6:** Deactivate… in a changed Edit person sheet asks the sheet's discard question first.
  - **#8:** saving a person right after a team was removed succeeds. A team id that no longer exists is left out, not sent.
  - **#28:** each invalid project link input is described by the links error.
- **Lists, tables and pages:**
  - **#9:** the mock caps mentions and task news separately (50 each), so My work's Mentions never comes up empty because task news filled the cap.
  - **#13:** DataTable's resize handles never draw over the sticky first header, the scroll arrow or the sticky FilterBar. The handles drop below them in the stacking order.
  - **#14:** an unknown `?assignee=` or `?who=` is removed from the address (replace) and reads as Anyone. History's empty text names the person filter: "Nothing by Mariam Fathy here yet."
  - **#15:** no count shows 0 before it is known.
    - The Tasks tab's FilterBar count and Projects' "N archived projects" wait for their data.
    - My work's tiles show "—" with the page's error sentence after a failed load.
  - **#17:** a remembered phase or sprint is written into the address on arrival (replace), so Back undoes a pick.
  - **#19:** ColumnStrip measures columns only. Add column being out of view doesn't make it say "Columns 1–3 of 3".
  - **#20:** Time & cost's missing-rate line dims with the report it describes. The empty text names the period on screen.
  - **#21:** DataTable never drops the column it is sorted by.
  - **#23:** after a failed background refetch, Files keeps its rows and says "These files may be out of date." with Try again above them.
- **Timer and navigation:**
  - **#11:** Help is a valid Projects place (`PLACE` in `lib/paths.ts`), so G then P on Help stays on Help and the earlier place isn't lost.
  - **#16:** Start timer shows pulse rows while tasks load, and "Your tasks didn’t load." with Try again if they fail. "No open tasks of yours yet" only shows when there are none.
  - **#18:** a pick that the search hides is cleared, so Start can't start a task that isn't on screen.
- **Screen readers and focus:**
  - **#24:** the composer's count status is always mounted, and empty until it has text.
  - **#26:** an upload's status line is a keyed node, as in `Announcer`, so a second "notes.pdf uploaded." is read.
  - **#27:** the board's column button isn't described by the task drag instructions.
  - **#29:** focus on `<main>` itself, after Skip to content, doesn't count as "in the page". A move from the navigation then focuses the new `h1`.
  - **#30:** tab titles:
    - Not found wins over its parent page's title;
    - a help chapter reads "Tasks · Help centre · Spark Flow";
    - a loading page reads "Spark Flow" instead of keeping the previous page's name.
  - **#31:** the panel focuses its title once the title has loaded, never the skeleton.
- **Tidy (internal):**
  - a: the doc comments in `PhasesSheet` (DoneButton), `archivedView.ts` and `uploadQueue.ts` are moved or removed, and `RecordHeader` is re-indented;
  - b: `goesWith` is either documented or folded into its test;
  - c: `CLAUDE.md`'s Tables line names Phase among the columns Projects drops;
  - d: `src/a11y.test.ts`'s `aria-label` scan pattern is no longer cut short by an `=>`.

## Review Focus

1. **A page that keeps fetching** (a poll or a live refetch loop) never settles. The 10 s timeout must name the page, and `settled()` must not wait on `refetchInterval` polls. Test: the dashboard, which polls "Working now", settles in the matrix.
2. **State left behind by one case** (`spark-flow.ui` last places, recent timers, View as in `sessionStorage`, an open timer from a walkthrough) changes the next case. Test: two loads of My work in a row, one as Admin and one as Member, show each person's own name in the top bar.
3. **A primary-button count fooled by hover or focus styles.** Hover can give a row a red background, so the count reads computed styles with the pointer moved away first. Test: Task 2's fixture with one red button under the pointer counts 1.
4. **Not-found and no-access pages** must still have an `h1` and pass. Test: the matrix's `/nowhere` and Member's `/settings/users` cases.
5. **A walkthrough on a phone** must use the phone's way in (More, the bottom bar, Details), not a desktop-only control. Test: the phone-dark run of each walkthrough fails if it clicks something that is hidden (`userEvent` refuses hidden elements).

---

### Task 1: The app harness

**Files:**
- Modify: `src/router.tsx` (export `appRoutes`), `src/main.tsx` (use `createQueryClient`)
- Create: `src/lib/queryClient.ts`, `src/test/app.tsx`, `src/test/app.browser.test.tsx`

**Interfaces:**
- Produces:
  - `appRoutes: RouteObject[]`;
  - `createQueryClient(): QueryClient`;
  - `type Role = 'admin' | 'pm' | 'member' | 'sales'`;
  - `ROLE_USER: Record<Role, { id: string; name: string }>`;
  - `type Size = 'desktop' | 'laptop' | 'tablet' | 'phone'` and `SIZE: Record<Size, [number, number]>`;
  - `renderApp(opts: { path: string; as: Role | null; theme: 'light' | 'dark'; size: Size }): Promise<AppHandle>`;
  - `AppHandle = { router; queryClient; consoleErrors: string[]; settled(): Promise<void> }`.

- [ ] **Step 1: Write the failing tests** in `src/test/app.browser.test.tsx`:
  - `it('opens a page as the chosen person, in the chosen theme and size')`: `/w/engineering/projects` as `member`, `dark`, `phone` → `h1` "Projects"; `documentElement.classList.contains('dark')`; `innerWidth === 390`; the top bar's avatar button is named "Mariam Fathy" (or whatever the user menu's label shows for her).
  - `it('starts each load from clean storage')`: My work as `admin`, then as `member` → each shows its own person in the user menu (Review Focus 2).
  - `it('collects console errors')`: render a route whose component calls `console.error('boom')` (a test-only route appended to a copy of `appRoutes`) → `consoleErrors` contains "boom".
  - `it('settles on a page that polls')`: `/w/engineering/dashboard` as `admin` → `settled()` resolves within 10 s (Review Focus 1).
  - `it('signed out opens Sign in')`: `/w/engineering/dashboard` with `as: null` → `h1` "Sign in".
- [ ] **Step 2: Run them.** `npx vitest run src/test/app.browser.test.tsx`. Expected: FAIL, because `@/test/app` doesn't exist.
- [ ] **Step 3: Implement** the exports in D1. `settled()` uses `expect.poll`-style polling every 50 ms. For animations it waits for each `animation.finished` whose `effect.getTiming().iterations` is finite. Move `main.tsx`'s client setup into `createQueryClient` unchanged.
- [ ] **Step 4: Run them.** Same command. Expected: PASS (5).
- [ ] **Step 5: Commit** with the message "test(ux): render the whole app in the browser project".

### Task 2: The page checks

**Files:**
- Modify: `src/test/axe.ts` (`opts.tags`)
- Create: `src/test/uxChecks.ts`, `src/test/uxChecks.browser.test.tsx`

**Interfaces:**
- Consumes: `AppHandle` (Task 1).
- Produces:
  - `AUDIT_TAGS: string[]`;
  - `pageProblems(handle: Pick<AppHandle,'consoleErrors'>): Promise<string[]>`;
  - and, for reuse, `sidewaysScroll(): string | null`, `primaryButtons(): string[]`, `spinners(): number` and `missingH1(): boolean`.

- [ ] **Step 1: Write the failing tests**, one per check, on small fixtures rendered at 390 and 1440:
  - a 600 px-wide box at 390 gives "sideways scroll: 210 px …";
  - two `bg-brand-500` buttons give 2 primaries, and one gives none;
  - one red button with the pointer over a `hover:bg-brand-500` row still counts 1 (Review Focus 3);
  - an `.animate-spin` element is reported;
  - a fixture with no `h1` gives "missing h1";
  - a 16 × 16 button beside another one at 390 gives a `target-size` axe problem with `AUDIT_TAGS`;
  - `consoleErrors: ['x']` is reported.
- [ ] **Step 2: Run them.** `npx vitest run src/test/uxChecks.browser.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** D2. `pageProblems` moves the pointer to (0, 0) with `userEvent.hover(document.body)` first.
- [ ] **Step 4: Run them.** Expected: PASS. Also run `npx vitest run src/test/axe.browser.test.tsx`. Expected: PASS (the old behaviour is kept when there are no `tags`).
- [ ] **Step 5: Commit** with the message "test(ux): the audit's page checks as helpers".

### Task 3: The matrix

**Files:**
- Create: `src/test/uxMatrix.ts`, `src/test/uxMatrix.test.ts`, `src/test/uxKnown.ts`, `src/ux.browser.test.tsx`
- Modify: `vite.config.ts` (`provide`), `package.json` (`test:ux`), `src/vitest.d.ts` or the nearest `.d.ts` (`ProvidedContext`)

**Interfaces:**
- Consumes: `renderApp`, `Role`, `Size` (Task 1); `pageProblems` (Task 2).
- Produces:
  - `UX_PAGES: string[]`, `THEMES`, `SIZES`;
  - `uxCases(mode): UxCase[]`;
  - `UX_KNOWN` and `sortKnown(case, problems): { left: string[]; stale: string[] }`.

- [ ] **Step 1: Write the failing unit tests** in `src/test/uxMatrix.test.ts`:
  - `uxCases('full').length === 968`;
  - `uxCases('pairwise').length === 122`;
  - pairwise: every page × role pair appears exactly once;
  - pairwise: each page has both themes and all four sizes;
  - pairwise: each size appears with both themes, and each role has both themes and all four sizes;
  - ids are unique;
  - `sortKnown`: a matching entry sets aside its problem, a matching entry with no problem is `stale`, and a non-matching one does nothing.
- [ ] **Step 2: Run them.** `npx vitest run src/test/uxMatrix.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** D3 and D4, then `src/ux.browser.test.tsx`: `for (const c of uxCases(inject('uxMatrix'))) it(c.id, …)`. Each case runs `renderApp`, then `settled()`, then `pageProblems`, then `sortKnown`, and expects `left` and `stale` both to be `[]`. The per-test timeout is 20 s.
- [ ] **Step 4: Run** the unit tests. Expected: PASS. Then run `npx vitest run src/ux.browser.test.tsx`. Expected: it runs 122 cases. Write down the failures; they are Task 4's input, and this task does not fix them.
- [ ] **Step 5: Commit** with the message "test(ux): the page × role × theme × size matrix". `UX_KNOWN` is empty, and the pairwise run may be red at this commit. The ledger notes how many cases fail and why.

### Task 4: The first full run, fixed

**Files:** decided by the findings (D4). `src/test/uxKnown.ts` gets entries only for findings that need a design call.

- [ ] **Step 1: Run the whole matrix.** `npm run test:ux > <workspace>/ux-full.log`. Expected: some failures. Group them by problem line, then by page.
- [ ] **Step 2: Fix each group that a small change fixes** (D4), most cases first. For each group: name the failing case ids (RED), change the code, then rerun those ids with `-t` (GREEN).
  - **Contrast found while an animation runs** is a harness problem, not a page problem. Fix it in `settled()` and say so in the ledger.
  - **Real contrast findings** follow the Phase 5B rules: fix the class where the colour is used, and leave tokens alone.
- [ ] **Step 3: Put each remaining group in `UX_KNOWN`**, with a `why` that names the decision it needs.
- [ ] **Step 4: Run** `npm run test:ux` and `npx vitest run src/ux.browser.test.tsx`. Expected: both PASS.
- [ ] **Step 5: Commit** with the message "fix(ux): what the first full matrix run found". The ledger lists every fix and every known entry.

### Task 5: Every sheet and dialog from the keyboard

**Files:**
- Create: `src/layers.browser.test.tsx`
- Modify: whatever a failing entry needs, under D5's rules.

**Interfaces:**
- Consumes: `renderApp` (Task 1), `axeProblems` and `AUDIT_TAGS` (Task 2).

- [ ] **Step 1: Write the table and the checks** from D5: 23 entries, each `it(name)`.
- [ ] **Step 2: Run them.** `npx vitest run src/layers.browser.test.tsx`. Expected: every entry runs. Failures are real findings, and the ledger lists them.
- [ ] **Step 3: Fix each finding.** If a fix isn't small, the entry gets `it.fails` with a comment naming the finding, and the finding goes in the ledger and the final report.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "test(a11y): every sheet and dialog from the keyboard".

### Task 6: Role walkthroughs

**Files:**
- Create: `src/journeys.browser.test.tsx`
- Modify: whatever a failing step needs.

**Interfaces:**
- Consumes: `renderApp` (Task 1).

- [ ] **Step 1: Write the four walkthroughs** from D6, each run twice (`describe.each([['desktop','light'],['phone','dark']])`), with the assertions D6 names at every step.
- [ ] **Step 2: Run them.** `npx vitest run src/journeys.browser.test.tsx`. Expected: 8 tests run. Failures are findings.
- [ ] **Step 3: Fix each finding** (RED is the failing step). If a fix isn't small, it gets the same `it.fails` treatment as Task 5.
- [ ] **Step 4: Run them again.** Expected: PASS (8).
- [ ] **Step 5: Commit** with the message "test(ux): the four role walkthroughs".

### Task 7: Help and specs

**Files:**
- Modify: `src/help/getting-started.md`, `docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md` (§5), `docs/flow-chat/FLOW_CHAT_REDESIGN.md`
- Test: `src/lib/helpMarkdown.test.ts` or a new `src/help/help.test.ts`

- [ ] **Step 1: Write the failing test.**
  - The getting-started chapter mentions "My work" under More, and has no "Home is in More".
  - It has a section whose text includes "Discard" and "Esc".
  - `archived.md` mentions typing the key, and doesn't say "asks first".
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Edit the chapter and both specs** per D7, in the chapter's voice and with curly ’.
- [ ] **Step 4: Run it, and `npx vitest run src/copy.test.ts src/lib/pageHelp.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "docs(help): My work, unsaved changes; specs follow the start-page ruling".

### Task 8: Polish

**Files:**
- `src/components/sf/Toast.tsx`, `src/pages/chat/MessageActions.tsx`, `src/pages/projects/PhasesSheet.tsx`, `src/layout/StartTimerDialog.tsx`, `src/components/ui/SegmentedControl.tsx`, `src/components/sf/Tabs.tsx` and the pages D8 names;
- `src/pages/projects/ProjectTabs.tsx`, `src/pages/chat/ChannelHeader.tsx`, `src/pages/chat/ChannelTabs.tsx`, `src/pages/projects/ProjectsPage.tsx`, `src/index.css` / `layout/AppLayout.tsx`;
- plus the deferred-minor files listed below.

- [ ] **Step 1: Write one failing test per item:**
  - Toast: an action that rejects with "Too late to undo." leaves one toast reading it, with no Undo, and a second toast never appears.
  - PhasesSheet: adding a phase announces "Phase added.".
  - Start timer: Start with no project picked shows "Pick a project.".
  - SegmentedControl and Tabs: ArrowRight calls `onChange(v, { keys: true })`, and a click calls `onChange(v)`. On TasksTab, ArrowRight leaves `router.state` history length unchanged (through `renderApp`).
  - Stuck name: at 390 a 60-character name ends in an ellipsis (`scrollWidth > clientWidth` on the inner span).
  - Channel header: at 390 `elementFromPoint` 2 px inside the name button's end edge is the name button.
  - Bookmark strip: at 390, with no bookmarks, its `scrollWidth === clientWidth`.
  - Due cell: the late due text's box is one line high in a 120 px column.
  - Focus not hidden: at 390 on Projects, scroll a row's link under the sticky filter bar and Tab to it; its top is ≥ the filter bar's bottom.
- [ ] **Step 2: Run them.** Expected: each FAILs for its reason.
- [ ] **Step 3: Implement D8.**
- [ ] **Step 4: Run them, then the whole suite.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "fix(ux): Phase 6 polish backlog".

### Task 9: Earlier phases' minors — forms, lists, timer and navigation

**Files:** the ones D9 names for #3, #6, #8, #9, #11, #13, #14, #15, #16, #17, #18, #19, #20, #21, #23 and #28, and tidy item c.

- [ ] **Step 1: Write one failing test per item.** Each asserts the behaviour D9 gives it. Use a mock unit test where the rule lives in the mock (#8, #9), and jsdom or the browser where it is layout (#13, #19). For example:
  - #3: rerendering an untouched ColumnSheet with a renamed column, then ✕, closes without asking;
  - #9: 60 task-news items plus 1 mention, and My work's Mentions lists the mention;
  - #13: at the overlap, `elementFromPoint` is the sticky header, not a resize handle;
  - #17: pick sprint A, pick sprint B, Back, and the select shows A;
  - #21: sorting Projects by Client at a width that drops Client keeps the Client column.
- [ ] **Step 2: Run them.** Expected: each FAILs for its reason.
- [ ] **Step 3: Implement D9's items for this task.**
- [ ] **Step 4: Run them, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "fix(ux): earlier phases' minors — forms, lists, timer, navigation".

### Task 10: Earlier phases' minors — screen readers, focus and tidy-ups

**Files:** the ones D9 names for #24, #26, #27, #29, #30 and #31, and tidy items a, b and d.

- [ ] **Step 1: Write one failing test per item.** For example:
  - #24: the composer has one `role="status"` node before any text, and it is the same node after;
  - #26: two uploads of "notes.pdf" give two different status nodes;
  - #29: Skip to content, then a sidebar link, focuses the new `h1`;
  - #30: `/w/engineering/p/NOPE/overview` titles "Not found · Spark Flow", and `/help/tasks` titles "Tasks · Help centre · Spark Flow";
  - #31: while the task loads, focus isn't on an `aria-hidden` node, and once it loads it is on the title;
  - d: the scan catches `<span onClick={() => x} aria-label="y">`.
- [ ] **Step 2: Run them.** Expected: each FAILs for its reason.
- [ ] **Step 3: Implement D9's items for this task.**
- [ ] **Step 4: Run them, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "fix(a11y): earlier phases' minors — screen readers, focus, tidy-ups".

### Task 11: Rules, notes and the gate

**Files:** `CLAUDE.md`, `tasks/todo.md`

- [ ] **Step 1: Add a "UX checks (UX Phase 6)" line to `CLAUDE.md`'s hard rules.** It says:
  - a new page joins `UX_PAGES`, and a new sheet or dialog joins `src/layers.browser.test.tsx`;
  - `npm run test:ux` runs before a phase lands;
  - `UX_KNOWN` entries need a reason and fail when they go stale.
  - Add `npm run test:ux` to Commands.
- [ ] **Step 2: Run every gate:** `npx tsc -b`, `npm run lint`, `npm test`, `npm run test:ux` and `npm run build:prototype`. Expected: all clean.
- [ ] **Step 3: If a pictured page changed, run `npm run help:shots`** and look at the pictures.
- [ ] **Step 4: Tick the Phase 6 section in `tasks/todo.md`,** and add "Review — UX Phase 6" with each suite's case count and time.
- [ ] **Step 5: Commit** with the message "docs(ux): Phase 6 rules and review".
