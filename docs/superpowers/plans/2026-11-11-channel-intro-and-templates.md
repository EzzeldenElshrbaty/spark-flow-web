# New-channel intro and page templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A channel's history starts with an intro (who made it, when, how to set it up), and Pick a template fills the channel's page in one step.

**Architecture:**
- **Data:** a channel carries `createdAt` and `createdBy` (mock DB v34). Nothing else changes on the server side: templates save through `api.pages.save`, Link a project through `api.bookmarks.add`.
- **List:** the intro is a new `intro` row that `buildRows` puts first when the list holds the very start; `MessageList` draws whatever `intro` node it's given.
- **Screens:** `ChannelIntro` is a pure component (props in, no queries); `TemplatePicker` is an sf `Modal`; `ChannelPage`'s `ChannelView` wires them.

**Tech Stack:** React 19, TypeScript, TanStack Query, Tailwind v4 with sf tokens, Tabler icons, Vitest (unit, jsdom and Chromium).

**Spec:** `docs/superpowers/specs/2026-11-11-channel-intro-and-templates-design.md` (commit 54a8ae5). Chat rules: `docs/flow-chat/FLOW_CHAT_REDESIGN.md` §6.14; project rules: `CLAUDE.md`.

**Branch:** `feat/channel-intro`, from dev `f6dd880`, in `.worktrees/ux-phase-6`.

## Global Constraints

**Copy** (curly ’, sentence case, `…` for pending)
- Intro lines, exactly as the spec's §5.3 table:
  - "You created this channel today. This is the very beginning of #release-v2."
  - "Nour El-Sayed created this channel on 3 Oct 2026. This is the very beginning of #release-v2."
  - "This is the very beginning of #release-v2."
  - "This is the very beginning of #nexus-core, Nexus Core’s chat."
  - "This is the very beginning of your conversation with Nour El-Sayed." (two others: "Nour El-Sayed and Mariam Fathy"; three or more: "A, B and C")
  - The day: "today", "yesterday", or "on 3 Oct 2026" (`formatDate`), by the viewer's local day.
- Intro controls: "Edit description" / "Add a description", "Add people", "Pick a template", "Link a project".
- Picker: title "Pick a template"; description "It fills the channel’s page. You can change everything after."; cards "Project kickoff" ("Goals, scope, who’s who and a kickoff checklist."), "Incident" ("A summary, a timeline and action items."), "Release" ("Scope, a release checklist and how to roll back."); buttons "Cancel", "Use template" ("Adding…"); the question "Replace the channel’s page? The current one stays in History." with "Keep the page" and "Replace".
- Announcements: "Template added to the page." and "Nexus Core linked." (the project's name).

**Screens**
- Chat's sf primitives, Tabler icons through `sf/Icon`, sf tokens, Readex. No primary button in the intro. The intro's heading is an `h2` (display type, 28/36, 600); the screen's `h1` stays the channel name.
- Every intro button: sf `Button` with `touch`. No buttons in an archived channel or a DM; a project's channel has none either (rights already say so for Add people and Edit description).
- Light, dark, 390 px phones (no sideways scroll), RTL logical classes, axe serious/critical clean.

**Data**
- `Channel.createdAt?: string | null`, `Channel.createdBy?: string | null` (optional, so the many test fixtures that build channels stand; the UI reads undefined as null).
- Components import `@/api/*` only.

## Where this plan departs from the spec (rulings)

- **Optional fields:** the spec's §4 types the two fields as `string | null`; they're optional here (`?:`) so fixtures needn't change. Cost if wrong: none at runtime.
- **The layers check** opens the picker in `#design` (`/w/design/c/c-design`, 6 messages), where the intro is on screen at load; in `#general` it's above the fold of a virtual list.

## Review Focus

1. **A jump to an old date in a long channel** shows no intro until the list really reaches the start (`hasOlder` false). Task 2 test.
2. **A channel made before v34** (no creator) reads "This is the very beginning of #x." with no "created" sentence. Task 3 test.
3. **Every project already linked:** Link a project isn't shown, rather than opening an empty menu. Task 3 test.
4. **Picking a template while someone else holds the page:** the picker stays open with the server's sentence, read out, and the page is unchanged. Task 4 test.
5. **Only Flow's own addresses open in place:** another origin, another port, or a non-http address keeps `target="_blank"` (or isn't a bookmark at all). Task 5 test.

---

### Task 1: Who made a channel, and when (DB v34)

**Files:**
- Modify:
  - `src/api/types.ts` (`Channel`: the two fields, with a comment).
  - `src/mocks/db.ts`: `DB_VERSION = 34`, comment "34: who made each channel, and when".
  - `src/mocks/migrations.ts`: key 33.
  - `src/mocks/seed.ts`: every seeded channel.
  - `src/mocks/chat.ts`: `createChannel`, `openDm`.
  - `src/mocks/projects.ts`: the project's channel (around line 249).
- Test: `src/mocks/migrations.test.ts`, `src/mocks/chat.test.ts`, `src/mocks/seed.test.ts`.

**Interfaces:**
- Produces: `Channel.createdAt?: string | null` (ISO), `Channel.createdBy?: string | null` (a user id).

- [ ] **Step 1: Write the failing tests**
  - `migrations.test.ts`, `describe('33 → 34 (who made a channel)')`, `'a channel is dated by its first message; the creator is unknown'`: `migrate({ version: 33, channels: [{ id: 'c1' }, { id: 'c2' }], messages: [{ channelId: 'c1', createdAt: '2026-10-02T09:00:00.000Z' }, { channelId: 'c1', createdAt: '2026-10-01T09:00:00.000Z' }] }, 34)` gives `c1` `createdAt: '2026-10-01T09:00:00.000Z', createdBy: null` and `c2` `createdAt: null, createdBy: null`.
  - `chat.test.ts`, `'a new channel and a new conversation say who made them, and when'`: as u-1, `createChannel` and `openDm('ws-eng', ['u-3', 'u-4'])` both return `createdBy: 'u-1'` and a `createdAt` within the last minute; opening the same conversation again keeps its first `createdAt`.
  - `seed.test.ts`, `'every seeded channel says who made it and when'`: each channel has a `createdBy` among its `memberIds` and a `createdAt` no later than its first message.
- [ ] **Step 2: Run:** `npx vitest run --project unit src/mocks/migrations.test.ts src/mocks/chat.test.ts src/mocks/seed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The seed: `createdBy` is the channel's first member; `createdAt` is its first message's `createdAt`, else the seed's `now` less 60 days.
  - `createChannel` and `openDm` use `new Date().toISOString()` (as the module's other writes do) and `me.id`; the project's channel uses the project module's `now()` and its creator.
- [ ] **Step 4: Run:** `npx vitest run --project unit src/mocks` and `npx tsc -b`. Expected: PASS, no errors.
- [ ] **Step 5: Commit** `feat(chat): a channel says who made it and when (DB v34)`

### Task 2: The intro row in the message list

**Files:**
- Modify: `src/pages/chat/messageRows.ts` (+ `messageRows.test.ts`), `src/pages/chat/MessageList.tsx` (+ `MessageList.browser.test.tsx`).

**Interfaces:**
- Produces:
  - `MessageListRow` gains `{ kind: 'intro'; key: 'intro' }`.
  - `buildRows(messages, { newAfterSeq, meId, now, hasOlder, intro })`, where `intro?: boolean` defaults to false (so `ChannelFeed` and other callers are unchanged). With `intro && !hasOlder`, the intro row comes first.
  - `MessageList` prop `intro?: ReactNode`: drawn as the intro row (estimate 160 px). With no messages, the list shows `intro` in a scrolling box in place of "No messages here yet." (which stays when `intro` is absent).

- [ ] **Step 1: Write the failing tests**
  - `messageRows.test.ts`, `'the intro comes first, and only at the very start'`:
    - Two messages with `intro: true` and no `hasOlder`: kinds are `['intro', 'day', 'message', 'message']`.
    - The same with `hasOlder: true`, or with `intro` left out: no `intro` row (Review Focus 1).
  - `MessageList.browser.test.tsx` (its existing helpers):
    - `'an empty channel shows the intro, not "No messages here yet."'`: no messages, `intro={<p>Intro</p>}`, so `Intro` shows and the old line doesn't.
    - `'the intro sits above the first day divider'`: one page of messages; the `Intro` element's bottom is at or above the first day divider's top.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.** Every narrowing on `row.kind` (estimate, sticky day, jumps) handles `intro`; `npx tsc -b` lists any missed.
- [ ] **Step 4: Run** both files, then `npx vitest run --project browser src/pages/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): the message list starts with an intro row`

### Task 3: The intro (`ChannelIntro`)

**Files:**
- Create: `src/pages/chat/ChannelIntro.tsx`, `src/pages/chat/ChannelIntro.test.tsx` (jsdom).

**Interfaces:**
- Consumes: `Channel` (Task 1), `formatDate`, `channelLabel`'s people, sf `Button`, `Menu`, `MenuItem`, `Icon`.
- Produces:
  - `introText({ channel, people, me, project, now }: { channel: Channel; people: User[]; me: string; project: { name: string } | null; now: Date }): string`, which gives the Global Constraints' lines.
  - `ChannelIntro(props: { channel: Channel; people: User[]; me: string; project: { name: string } | null; can: { addPeople: boolean; template: boolean; editDescription: boolean }; linkable: { key: string; name: string }[]; onAddPeople(): void; onEditDescription(): void; onPickTemplate(): void; onLinkProject(project: { key: string; name: string }): Promise<unknown> })`.
- Layout:
  - Root `div` with `sf-intro`'s spacing (`px-4 pt-8 pb-4 md:px-6`).
  - `h2` with `IconHash` or `IconLock` (a private channel) and the name (DMs: no icon, the people's names).
  - The line, then the description as its own `p` when set, then Edit description (a link-style `button`) after the line.
  - Buttons in `flex flex-wrap gap-2 pt-4`.
  - Link a project is an sf `Menu` "Link a project" whose items are `linkable`. It's shown only when `linkable` isn't empty. A refusal shows its sentence under it, in `text-sf-error`, and is announced.

- [ ] **Step 1: Write the failing tests** (`now` fixed at `2026-11-11T10:00:00` local):
  - `introText` gives each line of the copy for: me, made today; Nour, made `2026-10-03`; made yesterday; no creator (Review Focus 2); a project's channel; a DM with u-2; a group with u-2 and u-3; a group with three others.
  - `'buttons follow what I may do'`: with all `can` true and two `linkable`, the three buttons show; with all false and `linkable: []`, none do, and neither does Edit description (Review Focus 3).
  - `'an archived channel shows the words only'`: `archivedAt` set and all `can` true: no buttons.
  - `'a description reads under the line; Add a description when there is none'`.
  - `'Link a project lists the projects and links the one picked'`: open the menu, choose "Nexus Core", and `onLinkProject` gets `{ key: 'NEX', name: 'Nexus Core' }`.
  - `'the heading is an h2 and a private channel shows the lock'`.
- [ ] **Step 2: Run:** `npx vitest run --project unit src/pages/chat/ChannelIntro.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, plus `src/rtl.test.ts src/copy.test.ts src/a11y.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): the new-channel intro`

### Task 4: Templates and the picker

**Files:**
- Create: `src/lib/pageTemplates.ts` (+ `.test.ts`), `src/pages/chat/page/TemplatePicker.tsx` (+ `TemplatePicker.test.tsx`, jsdom).

**Interfaces:**
- Consumes: `validPage`, `PageBody` (`lib/pageBody.ts`); `useLatestPage`, `useSavePage` (`@/api/pages`); `announce`; sf `Modal`, `ModalCancelButton`, `Button`.
- Produces:
  - `type PageTemplate = { id: 'kickoff' | 'incident' | 'release'; name: string; summary: string; body: PageBody }`.
  - `PAGE_TEMPLATES: PageTemplate[]`, in the order Project kickoff, Incident, Release. The content is exactly the spec's §7.
  - `TemplatePicker({ channelId, onClose, onAdded }: { channelId: string; onClose(): void; onAdded(): void })`.
- Behaviour:
  - The cards are native radio inputs inside labels (a radio group named "Templates"; arrow keys come free), with the first one chosen. They stack on phones and sit three in a row from 768 px (`grid gap-2 md:grid-cols-3`), each at least 44 px tall.
  - Use template reads the page (`useLatestPage`):
    - An empty body saves at once with its `version`.
    - Otherwise the footer turns into the question.
  - Success: `onAdded()`, `onClose()`, then `announce('Template added to the page.')`.
  - A refusal: the footer shows `ApiError.detail` and `announce`s it.

- [ ] **Step 1: Write the failing tests**
  - `pageTemplates.test.ts`:
    - `'every template is a valid page'`: each `validPage(t.body)` equals `t.body`.
    - `'names and summaries'`: they equal the copy.
    - `'Release has its checklist'`: the check items are `['Freeze the scope', 'QA sign-off', 'Write the release notes', 'Deploy', 'Check it in production', 'Tell the team']`.
  - `TemplatePicker.test.tsx` (spy `api.pages.get` and `api.pages.save`):
    - `'an empty page takes the template at once'`: `save` is called with `('c-general', { body: release, baseVersion: 0 })` after choosing Release; `onAdded` is called; the status reads "Template added to the page."
    - `'a page with text asks first; Keep the page goes back'`: `get` returns version 3 with a paragraph. The question shows and `save` isn't called. Keep the page brings back Use template.
    - `'Replace saves it as the newest version'`: `save` gets `baseVersion: 3`.
    - `'a refusal stays in the picker, read out'`: `save` rejects 409 "Nour El-Sayed started editing first. Your last changes aren’t saved." The sentence shows and is announced, and `onClose` isn't called (Review Focus 4).
- [ ] **Step 2: Run** both. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): page templates and the template picker`

### Task 5: Wiring, Edit description, in-app bookmarks

**Files:**
- Create:
  - `src/lib/appLink.ts` (+ `.test.ts`).
  - `src/pages/chat/ChannelIntro.browser.test.tsx`.
- Modify:
  - `src/pages/chat/ChannelPage.tsx`:
    - `OpenDetails` gains `editDescription?: boolean`.
    - `ChannelView` builds the intro and passes it through `PaneFeed` to `MessageList`.
    - It also owns the picker and switches to the Page tab on `onAdded`.
  - `src/pages/chat/ChannelDetails.tsx`: prop `editDescription?: boolean`; About starts editing the description.
  - `src/pages/chat/ChannelTabs.tsx`: in-app bookmarks.
  - `src/layers.browser.test.tsx`: `{ name: 'Pick a template', path: '/w/design/c/c-design', open: () => anyButton('Pick a template'), kind: 'modal' }`.
- Test: `src/pages/chat/ChannelDetails.test.tsx`, `src/pages/chat/ChannelTabs.browser.test.tsx`.

**Interfaces:**
- Consumes: Tasks 1–4; `useChannelRights`, `detailsRights`, `useChannelProject`, `useProjectSummaries`, `useBookmarks`, `useAddBookmark`, `useCanWrite`, `isArchived`, `paths`.
- Produces: `appPath(url: string, origin?: string): string | null`. It returns the path, search and hash when the URL is http(s) on `origin` (default `window.location.origin`), else null.
- Wiring rules (`ChannelView`):
  - `can.addPeople = can.editDescription = rights.manage && !isArchived` (`useChannelRights`, as `ChannelTop`). This is already false for a project's channel and DMs.
  - `can.template = canWrite === true && !isArchived && kind === 'channel' && !project`.
  - `linkable`: when `mayBookmark && kind === 'channel' && !project`, the workspace's projects whose `paths.project(ws, key)` isn't the `appPath` of any bookmark; otherwise `[]`.
  - Add people opens details on `members`; Edit description on `about` with `editDescription`.
  - Linking: `addBookmark({ channelId, bookmark: { title: name, url: origin + paths.project(ws, key) } })`, then announce "Nexus Core linked.".

- [ ] **Step 1: Write the failing tests**
  - `appLink.test.ts`, `'only Flow’s own addresses are app paths'`, with origin `https://flow.spark-sys.com`:
    - `https://flow.spark-sys.com/w/engineering/p/NEX/overview?x=1#y` gives `'/w/engineering/p/NEX/overview?x=1#y'`.
    - `https://wiki.spark-sys.com/a`, `https://flow.spark-sys.com:8443/w`, `http://flow.spark-sys.com/w` (another scheme), `javascript:alert(1)` and `not a url` give `null` (Review Focus 5).
  - `ChannelDetails.test.tsx`, `'opens with the description being edited'`: with `editDescription`, the About tab shows the description's textbox focused.
  - `ChannelTabs.browser.test.tsx`, `'a bookmark to Flow opens in Flow; others in a new tab'`: a bookmark at `location.origin + '/w/engineering/p/NEX/overview'` is a link without `target`, whose `href` ends with that path. A wiki bookmark keeps `target="_blank"`.
  - `ChannelIntro.browser.test.tsx` (whole app, `renderApp`, db reset in `beforeEach` as in `ChannelPageTab.browser.test.tsx`):
    - `'a new channel starts with the intro and its three buttons'`: `api.chat.createChannel` "launch-week", then open it. Expect `getByRole('heading', { level: 2, name: /launch-week/ })`, "You created this channel today. This is the very beginning of #launch-week.", and Add people, Pick a template, Link a project.
    - `'Pick a template fills the page and opens it'`: Release, then Use template. The tab is Page, a level-3 heading "Release checklist" shows, and so does the checkbox "Freeze the scope".
    - `'Link a project adds a bookmark that opens the project in Flow'`: pick Nexus Core. A link "Nexus Core" is in the Bookmarks list; clicking it goes to `/w/engineering/p/NEX/overview` in the same router.
    - `'Edit description opens About editing it'`.
    - `'a project’s channel and a DM say where they begin, with no buttons'`: `c-p-nex` (on `/w/engineering/p/NEX/chat`) and `c-dm-1` (`/w/engineering/c/c-dm-1`).
    - `'on a phone the intro’s buttons answer touch and nothing scrolls sideways'` (`answersTouch`, `sidewaysScroll`).
    - `'axe finds no serious problems'` in light and dark.
- [ ] **Step 2: Run** the five files (and `npx vitest run --project browser src/layers.browser.test.tsx`). Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them again, plus `npx vitest run --project browser src/pages/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): the intro in channels: templates, Link a project, Edit description`

### Task 6: Help, docs, gates

**Files:**
- Modify:
  - `src/help/chat.md`: section "A new channel": the intro, Pick a template (the three, and that replacing keeps the old page in History), Link a project.
  - `docs/flow-chat/api-contract.md`: section `## Phase 4 · Slice CI: channel intro (spec 6.14)`, with the two `Channel` fields and "no new routes: templates use `PUT /api/channels/:id/page`, Link a project `POST /api/channels/:id/bookmarks`".
  - `docs/flow-chat/FLOW_CHAT_REDESIGN.md` §6.14: "Built (channel intro, 11 Nov 2026): …".
  - `CLAUDE.md`: a **Channel intro** rule (`ChannelIntro` pure, `buildRows` `intro`, `lib/pageTemplates.ts`, `appPath` for in-app bookmarks, DB v34).
  - `tasks/todo.md`: this plan's section and its review.
- [ ] **Step 1: Run** `npx vitest run --project unit src/help src/lib/pageHelp.test.ts src/copy.test.ts`. Expected: PASS.
- [ ] **Step 2: Gates:** `npm run lint`, `npx tsc -b`, `npm test`, `npm run test:ux` (background, about 8 min), `npm run build:prototype`. Expected: all green. Fix a failing count in `src/test/uxMatrix.test.ts` only if `UX_PAGES` changed (this plan doesn't change it).
- [ ] **Step 3: Commit** `docs(chat): the channel intro in help, the API contract and the rules`

Then one final review of the branch on the most capable model, and one fix pass.
