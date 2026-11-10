# Channel Page tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every channel's Page tab is a shared page. Whoever may post edits it, one person at a time, with autosave, live reading, history and restore, mentions that notify, and Copy link.

**Architecture:**
- **Content:** a new `PageBody` (chat's `Block`s plus headings, checklists and tables) is validated by one shared function.
- **Data:** the mock adds `pages`, `pageVersions` and `pageMentions` (DB v33) behind `api.pages`, with a stored 60 s hold and a version check. Live events invalidate queries.
- **Screens:**
  - The tab is a Lexical editor built on chat's conversions (`bodyEditor.ts`), plus `@lexical/table` and check lists.
  - There is a read-only view on `MessageBody`'s inline chips.
  - History is an sf `Modal`.

**Tech Stack:** React 19, TypeScript, TanStack Query, Lexical 0.52 (`@lexical/rich-text`, `@lexical/list`, `@lexical/table`, `@lexical/markdown`, `@lexical/react`), Tailwind v4 with sf tokens, Tabler icons, Vitest (unit + Chromium browser project).

**Spec:** `docs/superpowers/specs/2026-11-10-channel-page-tab-design.md` (commit 965a041). Chat rules: `docs/flow-chat/FLOW_CHAT_REDESIGN.md` §6.14, project rules in `CLAUDE.md`.

**Branch:** `feat/channel-page`, from dev `b6b6804`, in `.worktrees/ux-phase-6`.

## Global Constraints

**Limits and rules**
- Limits are in `lib/pageBody.ts`:
  - `MAX_PAGE_TEXT = 50_000` characters
  - `MAX_PAGE_BLOCKS = 2_000`
  - `MAX_TABLE_COLUMNS = 10`
  - `MAX_TABLE_ROWS = 100`
- Timings are in the same file:
  - `PAGE_HOLD_MS = 60_000`
  - `PAGE_RUN_MS = 600_000`
  - `PAGE_VERSIONS_KEPT = 100`
  - `PAGE_SAVE_AFTER_MS = 1_000`
  - `PAGE_CLAIM_EVERY_MS = 5_000`
- Pages never hold `all` or `here` inlines.
- Who may edit: whoever passes the mock's `checkCanWrite` (UI: `useCanWrite(channel) === true && !isArchived(channel)`). Reading the page and its history follows `readableChannel`.

**Copy** (curly ’, sentence case, `…` for pending)
- Page bar: "Saving…", "Saved", "Saved 3h ago by Nour El-Sayed" (with "by you" for me), "Nour El-Sayed is editing".
- Empty page: placeholder "Start the channel’s page…"; for readers "No page yet." and "People who can post here can start it."
- Buttons: "Copy my changes", "Load the latest", "Try again", "Copy link", "History".
- The mock's refusals (`ApiError.detail`, shown as they come):
  - "Nour El-Sayed started editing first. Your last changes aren’t saved." (409)
  - "Nour El-Sayed saved changes before you. Your last changes aren’t saved." (409)
  - "You changed this page in another tab. Your last changes here aren’t saved." (409)
  - "Nour El-Sayed is editing. Try again when they’re done." (409, restore)
  - "This page is too long. Shorten it to save." (400)
  - "Something on this page can’t be saved." (400)
  - "This channel is archived." (400, existing)

**Screens**
- Chat screens use sf primitives only (`components/sf/*`), Tabler icons through `sf/Icon`, the Readex font and sf tokens. No `components/ui/*` inside the tab.
- No spinners, no toasts, and no red primary on the tab.
- Errors are sentences in the page bar. `announce()` only errors, "{Name} is editing", and "Version restored." in History.
- RTL: logical classes only. Phones: 44 px touch, no sideways page scroll. Light and dark.
- Headings in a page render as `h2`/`h3`/`h4`: the screen's `h1` is the channel name.

**Data**
- Components import `@/api/*` only.
- Every new `Api` method is listed in `src/mocks/audit.test.ts` `NOT_RECORDED` with "a channel’s page is its content; its history is its record".

## Where this plan departs from the spec (rulings)

- **Archived channels:** the spec's §8 expects 403. The mock's existing `checkCanWrite` answers 400 "This channel is archived.", and pages follow it, because one rule serves the whole channel. Cost if wrong: one status code in the contract.
- **409 shape:** the spec's §5.3 and §9 give `{ code, by }`. `ApiError` carries only `title`, `status` and `detail`, so a 409's `detail` is the whole sentence and the client offers the same two buttons for any 409. Cost if wrong: the .NET team returns the sentence instead of a code.
- **Mentions:** the spec's §5.5 says "an ActivityItem". Chat mentions are worked out on read (`mentionsFor`), so a save stores `pageMentions` records, which `mentionsFor` reads as `source: 'page'`. Cost if wrong: none for people; one more collection.
- **Read-only component name:** the spec's §6.6 calls it `PageView`, which clashes with the `PageView` data type, so the component is `PageReader`.

## Review Focus

1. **My own two tabs.** The hold is per person, so both of my tabs may edit. The stale one must get "You changed this page in another tab…", not my own name. Task 2 test.
2. **Holds that changed while I was idle.** I stop typing for over 60 s, someone else claims the page, and I type again. My editor must turn read-only with their name before my next save. Nothing may be overwritten and my text stays. Task 7 test.
3. **A 400 must not loop.** A refused save (too long, archived) is shown once and not retried on every pause. The next save happens only after I change something. Task 7 test.
4. **A mention of someone who has since left the channel** stops showing in their Activity and bell. It's checked on read with `canRead`. Task 4 test.
5. **Restoring while a newer save lands.** The History dialog stays open and shows the 409 sentence in its footer; it doesn't close or announce. Task 8 test.

---

### Task 1: Page content (`lib/pageBody.ts`)

**Files:**
- Create: `src/lib/pageBody.ts`, `src/lib/pageBody.test.ts`
- Modify: `src/lib/messageBody.ts`. Export the existing `validInline`, `validBlock`, `type Budget` and `spend`. Make the budget's text limit a parameter, so `validPage` can pass `MAX_PAGE_TEXT` while messages keep `MAX_TEXT = 40_000`.

**Interfaces:**
- Produces:
  - `type PageBlock = Block | { type: 'h1' | 'h2' | 'h3'; children: Inline[] } | { type: 'check'; items: { checked: boolean; children: Inline[] }[] } | { type: 'table'; rows: Inline[][][] }`
  - `type PageBody = PageBlock[]`
  - `validPage(value: unknown): PageBody | null`
  - `pageTooLong(value: unknown): boolean` (true when the only problem is a limit, so the mock picks its sentence)
  - `pageText(body: PageBody): string` (blocks joined by `\n`; table cells by tab, rows by `\n`; check items prefixed "☐ " or "☑ ")
  - `pageMentions(body: PageBody): string[]` (distinct user ids, document order)
  - `blockText(block: PageBlock): string`
  - The Global Constraints' constants.

- [ ] **Step 1: Write the failing tests** (`pageBody.test.ts`):
  - `'accepts every block type'`: a body with `p`, `quote`, `ul`, `ol`, `code`, `h1`, `h2`, `h3`, `check` (one checked, one not) and a 2 × 2 `table` round-trips: `validPage(b)` equals `b`.
  - `'refuses @channel and @here on a page'`: a `p` with `{ type: 'all' }` gives `null`, and so does one with `{ type: 'here' }`.
  - `'refuses a ragged, empty or oversized table'`: rows of 2 and 3 cells; `rows: []`; 11 columns; 101 rows. Each gives `null`, and only the last two give `pageTooLong === true`.
  - `'refuses past the limits'`: 2,001 `p` blocks, and one `p` of 50,001 characters, give `null` with `pageTooLong` true. 50,000 characters pass.
  - `'pageText reads every block'`: `pageText` of a heading, a check item and a table equals `'Plan\n☑ Ship it\nA\tB\nC\tD'`.
  - `'pageMentions lists people once, in order'`: user `u-2`, then `u-1`, then `u-2` again, inside a table cell, gives `['u-2', 'u-1']`.

- [ ] **Step 2: Run:** `npx vitest run src/lib/pageBody.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** in `pageBody.ts`. Each new block validates its inlines with `validInline`, sharing one `Budget`. All other blocks go through `validBlock`. Reject `all` and `here` after `validInline`.
- [ ] **Step 4: Run:** `npx vitest run src/lib/pageBody.test.ts src/lib/messageBody.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): page content and its rules`

### Task 2: Pages in the mock (DB v33, `api.pages`)

**Files:**
- Modify:
  - `src/api/types.ts`: the types below, `Api['pages']`, and `MentionItem.source` plus `'page'`.
  - `src/mocks/db.ts`: `DB_VERSION = 33` with the comment "33: channel pages, their versions and mentions"; `DbData`; `COLLECTIONS`.
  - `src/mocks/migrations.ts` (key 32 → 33 adds three empty arrays).
  - `src/mocks/seed.ts`, `src/mocks/db.test.ts` `emptyData()`, `src/mocks/shared.ts` (`Thing` plus `'Page'`).
  - `src/mocks/index.ts` (`pages: pagesApi(db, hub, now)`).
  - `src/lib/api.ts` (`get pages()`).
  - `src/mocks/audit.test.ts` (7 `NOT_RECORDED` entries).
  - `src/mocks/migrations.test.ts` (`describe('32 → 33 (channel pages)')`).
- Create: `src/mocks/pages.ts`, `src/mocks/pages.test.ts`

**Interfaces:**
- Consumes (Task 1): `validPage`, `pageTooLong`, `pageMentions`, `blockText`, the constants.
- Produces (types in `api/types.ts`):
  - `type PageHold = { userId: string; until: string }`
  - `type StoredPage = { id; channelId; workspaceId; body: PageBody; version: number; createdAt; createdBy; updatedAt: string | null; updatedBy: string | null; editing: PageHold | null }`
  - `type PageVersion = { id; pageId; version: number; body: PageBody; savedBy; firstSavedAt; savedAt }`
  - `type StoredPageMention = { id; pageId; channelId; workspaceId; userId; authorId; excerpt; createdAt }`
  - `type PageView = { channelId; body; version; updatedAt: string | null; updatedBy: string | null; editors: string[]; editing: PageHold | null }`
  - `type PageVersionSummary = { id; version; savedAt; savedBy }`
  - `type PageVersionDetail = PageVersionSummary & { body: PageBody }`
- `Api['pages']`:
  - `get(channelId): Promise<PageView>`
  - `editing(channelId): Promise<{ editing: PageHold | null }>`
  - `stopEditing(channelId): Promise<void>`
  - `save(channelId, input: { body: PageBody; baseVersion: number }): Promise<PageView>`
  - `history(channelId): Promise<PageVersionSummary[]>`
  - `version(channelId, versionId): Promise<PageVersionDetail>`
  - `restore(channelId, input: { versionId: string; baseVersion: number }): Promise<PageView>`
- `pagesApi(db: MockDb, hub: MockHub, now: () => Date): Api['pages']`. Events (`hub.publish`):
  - `{ type: 'pageSaved', channelId, version, userId }`
  - `{ type: 'pageEditing', channelId, userId: string | null, until: string | null }`
  - `{ type: 'notificationCreated', userId }` for each new mention

  (The union itself is added in Task 3; until then type-check with the publish calls in place.)

- [ ] **Step 1: Write the failing tests** (`pages.test.ts`). Set it up like `time.test.ts`: `latency.min = latency.max = 0`, a movable `now`, and `createMockApi(db, hub, () => now)`. Act as Admin u-1, PM u-2 and Member u-3 on `c-general` through `asActor`.
  - `'a channel without a page reads as version 0, empty'`
  - `'a reader who can’t post can read but not save'`: Expect 403 from `checkCanWrite` (for a channel with `whoCanPost` admins only, a Member).
  - `'an archived channel refuses with its sentence'`: 400 "This channel is archived."
  - `'save writes version + 1 and publishes pageSaved'`
  - `'a stale baseVersion is refused with who saved'`: 409, detail "Nour El-Sayed saved changes before you. Your last changes aren’t saved."
  - `'my own stale tab hears about another tab'`: 409, detail "You changed this page in another tab. Your last changes here aren’t saved." (Review Focus 1)
  - `'typing claims the page for 60 s; others are refused while it holds'`:
    - u-2 `editing`, then u-1 `save` gives 409 "… started editing first …".
    - u-1 `editing` returns u-2's hold and changes nothing.
    - After `now + 60_001` ms, u-1 can save.
  - `'stopEditing lets the page go at once'`: also publishes `pageEditing` with null.
  - `'saves in one 10-minute run are one version; another person or a later save starts a new one'`
  - `'keeps the newest 100 versions'`: after 101 runs, `history` has 100 entries and the oldest is gone.
  - `'restore saves the old body as a new version and keeps the newer ones'`
  - `'restore while someone else holds the page is refused'`: 409 "Nour El-Sayed is editing. Try again when they’re done."
  - `'a page that’s too long, or holds @channel, is refused with its sentence'`: 400, each sentence.
  - `'the same body again saves no new version'`
  - `'new mentions are stored for readable, active, other people only'`:
    - Mention u-2, u-1 (the saver), a deactivated person, and someone who isn't in a private channel. Only u-2 gets a `pageMentions` record and a `notificationCreated`.
    - Saving again with u-2 still mentioned adds nothing.
  - `'editors lists distinct savers, newest first'`

  And in `migrations.test.ts`: `'32 → 33 adds pages, pageVersions and pageMentions'`.

- [ ] **Step 2: Run:** `npx vitest run src/mocks/pages.test.ts src/mocks/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, DB v33, the migration, seed, `pagesApi` and its registration, and the 7 audit entries.
  - Every write is one `db.update`; publish after it.
  - A hold counts only while `until > now()`.
  - Version runs: the newest version is reused when `savedBy` is the caller and `now - firstSavedAt < PAGE_RUN_MS`.
  - `get` creates no record; `editing` and `save` create the record when missing.
  - Mentions use `canRead` (`mocks/membership.ts`) and the user's `active`.
- [ ] **Step 4: Run:** `npx vitest run src/mocks`. Expected: PASS (`audit.test.ts` included).
- [ ] **Step 5: Commit** `feat(chat): channel pages in the mock backend (DB v33)`

### Task 3: Transport, live events and hooks

**Files:**
- Modify:
  - `src/lib/http.ts` (the spec §9 routes, under `pages`).
  - `src/lib/realtime.ts`: union plus `onPageSaved` / `onPageEditing`, and noops in the unconnected client.
  - `src/mocks/realtime.ts` (mock client).
  - `src/layout/RealtimeBridge.tsx`.
  - `src/api/queryKeys.ts`: `qk.page(channelId) = ['chat','page',channelId]`, `qk.pageHistory(channelId) = ['chat','page',channelId,'history']`, `qk.pageVersion(channelId, versionId)`; `keysForEvent` for both events.
- Create: `src/api/pages.ts`
- Test: `src/api/queryKeys.test.ts`, `src/lib/http.test.ts` (or the file where bookmarks' routes are tested), `src/mocks/realtime.test.ts`

**Interfaces:**
- Consumes (Task 2): `Api['pages']`, the event shapes.
- Produces these hooks:
  - `usePage(channelId)`: `useQuery`, with `retry` as `useBookmarks`.
  - `usePageHistory(channelId, enabled)`
  - `usePageVersion(channelId, versionId | null)`
  - `useSavePage()`: `mutationFn: ({ channelId, body, baseVersion })`, with `meta: { invalidate: false }` (see Step 3).
  - `useRestorePage()`
  - `useClaimPage()`
  - `useReleasePage()`

- [ ] **Step 1: Write the failing tests:**
  - `keysForEvent({ type: 'pageSaved', channelId: 'c1', version: 2, userId: 'u-1' })` contains `qk.page('c1')` and `qk.pageHistory('c1')`. `pageEditing` contains `qk.page('c1')` only.
  - The http routes match spec §9 (verb plus path for each of the 7 methods).
  - The mock realtime client delivers `pageSaved` to `onPageSaved`.
- [ ] **Step 2: Run:** `npx vitest run src/api/queryKeys.test.ts src/mocks/realtime.test.ts src/lib/http.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Autosave must not refetch everything on each save (one save a second would invalidate every query).
  - `queryClient.ts`'s global `MutationCache.onSuccess` skips invalidation when `mutation.meta?.invalidate === false`.
  - `useSavePage` and `useClaimPage` set that meta and write `qk.page` with `setQueryData` from the answer.
  - Restore keeps the global invalidation.
  - Add a test in `src/lib/queryClient.test.ts`: `'a mutation with meta.invalidate false invalidates nothing'`.
- [ ] **Step 4: Run** the three test files plus `src/lib/queryClient.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): page routes, live events and hooks`

### Task 4: Page mentions in Activity and the bell

**Files:**
- Modify:
  - `src/mocks/mentions.ts`: `mentionsFor` also yields `source: 'page'` items from `data.pageMentions`, where `userId` is me and `canRead(data, channelId, me)`, with `messageId: null`, `taskKey: null`, `projectId: null`.
  - `src/mocks/activityFeed.ts` (kind `'mention'`, `page: true`).
  - `src/api/types.ts` (`ActivityItem.page?: true`).
  - `src/pages/chat/activityRows.ts` (`activityLink`, `activityKind`).
  - `src/lib/mentionLink.ts` (`mentionLink`, `notificationLine`).
- Test: `src/mocks/mentions.test.ts`, `src/pages/chat/activityRows.test.ts`, `src/lib/mentionLink.test.ts`

**Interfaces:**
- Consumes (Task 2): `StoredPageMention`, `pageMentions` in `DbData`.
- Produces: a page mention opens `/w/:ws/c/:channelId?tab=page`. Build it with the existing channel path helper in `lib/paths.ts` plus `?tab=page`. Its line reads "mentioned you on the page" where a message mention reads "mentioned you".

- [ ] **Step 1: Write the failing tests:**
  - `'a page mention reaches the person, opens the page, and shares the read state'`
  - `'a page mention stops showing once the person can’t read the channel'` (Review Focus 4)
  - `activityLink` and `mentionLink` for `source: 'page'` equal `'/w/engineering/c/c-general?tab=page'`.
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run:** `npx vitest run src/mocks src/pages/chat/activityRows.test.ts src/lib/mentionLink.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): mentions on a page reach Activity and the bell`

### Task 5: Read-only page (`PageReader`)

**Files:**
- Modify: `src/pages/chat/MessageBody.tsx`. Export `Inlines` (and `Blocks` if `PageReader` reuses it for chat blocks) with no change to how they render.
- Create: `src/pages/chat/page/PageReader.tsx`, `src/pages/chat/page/PageReader.test.tsx`

**Interfaces:**
- Consumes: `PageBody` (Task 1); `BodyContext` and `useBodyContext` from chat; `Inlines`.
- Produces: `PageReader({ body, ctx }: { body: PageBody; ctx: BodyContext })` (the spec's §6.6 "PageView", renamed so it doesn't clash with the `PageView` data type).
  - It renders elements, never HTML.
  - Headings render as `h2`/`h3`/`h4` with `sf-title` / `sf-heading` / `sf-body-strong`.
  - Checklists render as a `ul` of `li` items, each with `<span role="checkbox" aria-checked aria-readonly>`.
  - Tables render inside `<div className="overflow-x-auto">` with a `table`, `th` cells in the first row and `td` cells after.
  - The column is `mx-auto max-w-[760px]`.

- [ ] **Step 1: Write the failing jsdom tests:**
  - `'headings sit under the channel’s h1'`: an `h1` block renders `getByRole('heading', { level: 2 })`.
  - `'a checklist reads its state'`: two items, `aria-checked` `'true'` / `'false'`.
  - `'a table has a header row'`: `getAllByRole('columnheader')` has 2 items, `getAllByRole('cell')` has 2.
  - `'chips render as in messages'`: a user inline shows the person's name; an unknown task key renders as plain text.
  - `'text is never HTML'`: a `p` with `<b>x</b>` as text renders the literal characters.
- [ ] **Step 2–4:** Run `npx vitest run src/pages/chat/page/PageReader.test.tsx src/pages/chat/MessageBody.test.tsx`: FAIL, then PASS.
- [ ] **Step 5: Commit** `feat(chat): read-only channel page`

### Task 6: Editor content and conversions (`pageNodes.ts`)

**Files:**
- Modify:
  - `package.json`: add `"@lexical/table": "^0.52.0"` to dependencies. Update the lock file with `npm install --package-lock-only` (network: registry.npmjs.org; `node_modules` already has 0.52.0).
  - `src/pages/chat/composer/bodyEditor.ts`: export `CHAT_READER` and the inline helpers that `$blockOf` uses for a paragraph's children (`$inlinesOf(node, read)`, or the existing name).
- Create: `src/pages/chat/page/pageNodes.ts`, `src/pages/chat/page/pageNodes.test.ts`

**Interfaces:**
- Consumes: `PageBody` (Task 1); `COMPOSER_NODES`, `EntityNode`, `$appendBlock`, `$blockOf`, `CHAT_READER` from `bodyEditor.ts`.
- Produces:
  - `PAGE_NODES = [...COMPOSER_NODES, TableNode, TableRowNode, TableCellNode]`
  - `$pageFromEditor(): PageBody`
  - `$editorFromPage(body: PageBody): void`
  - `PAGE_TRANSFORMERS = [HEADING, CHECK_LIST, ...COMPOSER_TRANSFORMERS]` (from `@lexical/markdown`)
- Mapping:
  - `HeadingNode` h1–h3 maps to `h1`–`h3`.
  - A `ListNode` with `getListType() === 'check'` maps to `check` (`ListItemNode.getChecked()`).
  - A `TableNode` maps to `table`: the first row's cells are header cells (`TableCellHeaderStates.ROW`), and each cell's paragraphs are joined with line breaks into one `Inline[]`.
  - Everything else goes through `$blockOf` / `$appendBlock`.

- [ ] **Step 1: Write the failing headless round-trip tests** (`createHeadlessEditor({ nodes: PAGE_NODES })`, as `bodyEditor.test.ts` does):
  - `'every page block survives the editor'`: the Task 1 "accepts every block type" body, then `$editorFromPage`, then `$pageFromEditor`, equals the original.
  - `'a check item keeps its state'`.
  - `'a table cell with two paragraphs becomes one cell with a line break'`.
  - `'markdown shortcuts make headings and checklists'`: `$convertFromMarkdownString('## Plan\n- [x] Ship', PAGE_TRANSFORMERS)` gives `[{ type: 'h2', … }, { type: 'check', items: [{ checked: true, … }] }]`.
- [ ] **Step 2–4:** `npx vitest run src/pages/chat/page/pageNodes.test.ts src/pages/chat/composer/bodyEditor.test.ts`: FAIL, then PASS.
- [ ] **Step 5: Commit** `feat(chat): page content in the editor (headings, checklists, tables)`

### Task 7: The tab (`ChannelPageTab`, editor, toolbar, saving)

**Files:**
- Create:
  - `src/pages/chat/page/PageEditor.tsx`
  - `src/pages/chat/page/PageToolbar.tsx`
  - `src/pages/chat/page/PageBar.tsx`
  - `src/pages/chat/page/ChannelPageTab.tsx`
  - `src/pages/chat/page/usePageSaving.ts`
  - `src/pages/chat/page/ChannelPageTab.browser.test.tsx`
  - `src/pages/chat/page/usePageSaving.test.ts`
- Modify:
  - `src/pages/chat/composer/AutocompletePlugin.tsx`: new props `groups?: boolean` (default true; false drops @channel/@here) and `onlyTasks?: RefObject<boolean>` (while true, choices are tasks only; reset when the menu closes).
  - `src/lib/mentionQuery.ts`, if `mentionOptions` needs a `kinds` option for these.
  - `src/pages/chat/ChannelPage.tsx`: the `page` tab renders `<ChannelPageTab channel={current} people={people} me={persona.id} />` in place of `TabStub`.
  - `src/pages/chat/ChannelTabs.tsx`: `TabStub` and `STUBS` go.

**Interfaces:**
- Consumes: Tasks 1, 3, 5 and 6; `useCanWrite`, `isArchived`, `useCopyLink(link)`, `useComposerDirectory`, `useUnsavedChanges(dirty, 'page', ask)`, `announce`, `timeAgo`, `Avatar`, sf `Button`/`IconButton`/`Menu`/`MenuItem`/`Modal`.
- Produces:
  - `usePageSaving({ channelId, view, mayEdit }) → { state: 'idle' | 'saving' | 'saved' | 'refused' | 'failed' | 'held', error: string | null, change(body: PageBody): void, flush(): Promise<void>, loadLatest(): void, myText(): string }`
    - The pure timing (debounce `PAGE_SAVE_AFTER_MS`, claim at most every `PAGE_CLAIM_EVERY_MS`, no retry after a 400) is in a reducer tested in `usePageSaving.test.ts` with fake timers.
  - `ChannelPageTab({ channel, people, me })`. The tab panel id stays as `ChannelPage` sets it.
  - `PageToolbar`:
    - `role="toolbar"`, `aria-label="Formatting"`, with roving arrow keys as in `MessageToolbar.tsx:209-220`.
    - Controls: Text style `Menu` (Normal text, Heading 1, Heading 2, Heading 3, Bulleted list, Numbered list), Bold, Italic, Checklist, Table (inserts 3 × 3 with a header row; inside a table a "Table" `Menu` offers Add row above, Add row below, Add column before, Add column after, Delete row, Delete column, Delete table), and Link a task (inserts `@` and sets `onlyTasks`).
    - Buttons are sf `IconButton` with `touch` (44 px on phones), and the row scrolls sideways on phones.
  - `PageBar`: the save state or holder, the error with its buttons, the faces (up to 3 `Avatar` 24, decorative, plus "+N", with sr-only text "Edited by A, B and 2 more"), Copy link (`useCopyLink`), and History (opens Task 8's dialog; until then the button is not rendered).

- [ ] **Step 1: Write the failing tests:**
  - `usePageSaving.test.ts` (fake timers, mocked api):
    - `'saves 1 s after the last change, not on every key'`
    - `'claims on the first change and at most every 5 s while typing'`
    - `'a 400 shows its sentence and isn’t retried until the next change'` (Review Focus 3)
    - `'a 409 keeps my text, stops saving and offers both buttons'`
    - `'a network failure retries at the next pause'`
    - `'flush saves at once'`
  - `ChannelPageTab.browser.test.tsx` (Chromium, sf CSS, QueryClient with the mock api, acting as u-1 on `c-general`):
    - `'while it loads, the tab shows pulse lines and no spinner'`
    - `'typing autosaves; the bar says Saving… then Saved'`
    - `'someone else’s hold makes the page read-only with their name, and their saves show'`: u-2 claims and saves through the api while u-1 looks.
    - `'after my idle minute, someone else’s claim turns my editor read-only before I save'` (Review Focus 2)
    - `'Load the latest replaces my text; Copy my changes puts it on the clipboard'`
    - `'## and [ ] make a heading and a checklist; Tab moves through table cells'`
    - `'a reader who can’t post sees the view and No page yet.'`
    - `'leaving the channel with an unsaved change asks first'`
    - `'on a phone the page doesn’t scroll sideways and toolbar buttons are 44 px'` (390 × 844, using `answersTouch` from `src/test/touch.ts`)
    - `'axe finds no serious problems'` (`axeProblems`)
  - `AutocompletePlugin`: `'groups false offers no @channel or @here; onlyTasks offers tasks only'` (in its existing test file).
- [ ] **Step 2: Run** these files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The editor's theme uses sf classes:
    - Headings: `sf-title` / `sf-heading` / `sf-body-strong`.
    - Paragraphs: `sf-body`.
    - Lists: `ps-6`.
    - Check items: a 20 px box drawn with `before:`, using logical classes.
    - Table cells: `border border-sf-line px-2 py-1`.
  - `ChannelPageTab` releases the hold on unmount and on `pagehide`, and adds a `beforeunload` prompt while a save is pending or failed.
- [ ] **Step 4: Run** the same files, plus `npx vitest run src/pages/chat src/a11y.test.ts src/rtl.test.ts src/copy.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): the channel Page tab: editing, autosave and the page bar`

### Task 8: Page history

**Files:**
- Create: `src/pages/chat/page/PageHistory.tsx`, `src/pages/chat/page/PageHistory.test.tsx`
- Modify: `PageBar.tsx` (the History button), `src/layers.browser.test.tsx`: add `{ name: 'Page history', path: '/w/engineering/c/c-general?tab=page', open: () => anyButton('History'), kind: 'modal' }`.

**Interfaces:**
- Consumes: `usePageHistory`, `usePageVersion`, `useRestorePage` (Task 3); `PageReader` (Task 5); sf `Modal`, `Button`.
- Produces: `PageHistory({ channelId, ctx, mayEdit, currentVersion, onClose })`.
  - The sf `Modal` is titled "Page history", `wide`.
  - The list rows read "Today 2:00 PM · Nour El-Sayed" (`formatWhen`); the newest one is marked "Current".
  - The selected version shows in a read-only `PageReader`.
  - The footer has `ModalCancelButton` "Close" and, for editors on a non-current version, `Button variant="primary"` "Restore this version" (pending: "Restoring…").
  - On phones the list comes first, and picking a version shows it with a Back button.
  - After a successful restore, `announce('Version restored.')`, close, and focus returns to History.

- [ ] **Step 1: Write the failing tests:**
  - `'lists versions newest first and marks the current one'`
  - `'shows a version read-only; readers see no Restore'`
  - `'restore saves it as a new version and closes'`
  - `'a 409 while restoring stays in the dialog with its sentence'` (Review Focus 5)
- [ ] **Step 2–4:** `npx vitest run src/pages/chat/page/PageHistory.test.tsx`, then `npx vitest run --project browser src/layers.browser.test.tsx`: FAIL, then PASS.
- [ ] **Step 5: Commit** `feat(chat): page history and restore`

### Task 9: Whole app, help and docs

**Files:**
- Modify:
  - `src/test/uxMatrix.ts`: add `'c/c-general?tab=page'` to `UX_PAGES`.
  - `src/journeys.browser.test.tsx`: in the PM walkthrough, write "## Launch checklist" and a "[ ] " item on `c-general`'s page. In the Member walkthrough (same seed, after the PM run's save, or seeded through `api.pages.save` as u-2 in its own `beforeEach` step), read it on the Page tab.
  - `src/help/chat.md`: section "The channel’s page" with who edits, one at a time, autosave, history and restore, Copy link. Run `src/help/chapters.test.ts`.
  - `docs/flow-chat/api-contract.md`: section `## Phase 4 · Slice PG: channel page (spec 6.14)` with a routes table and Rules bullets (Records, Hold, Versions, Mentions, **Events:** `page.saved` (`pageSaved`), `page.editing` (`pageEditing`)), and rows in the realtime event table (around line 350).
  - `docs/flow-chat/FLOW_CHAT_REDESIGN.md` §6.14: "Built (channel page, 10 Nov 2026): …" in the style of §6.1's "Built" line.
  - `docs/superpowers/specs/2026-11-10-channel-page-tab-design.md`: an "As built" note listing the four rulings below ("Where this plan departs from the spec").
  - `CLAUDE.md`: a **Channel page** rule: `lib/pageBody.ts`, `api.pages` (DB v33), the one-holder 60 s rule, the version check, mentions as `pageMentions`, files under `pages/chat/page/`.
  - `tasks/todo.md`: this plan's section and its review.

- [ ] **Step 1: Run** `npx vitest run --project browser src/ux.browser.test.tsx src/journeys.browser.test.tsx`. Expected: the new UX page and walkthrough steps PASS; fix what fails at its cause.
- [ ] **Step 2: Gates:** `npm run lint`, `npx tsc -b`, `npm test`, `npm run test:ux` (in the background, about 7 min), `npm run build:prototype`. Expected: all green.
- [ ] **Step 3: Commit** `docs(chat): channel page in help, the API contract and the rules`

Then one final review of the branch on the most capable model, and one fix pass.
