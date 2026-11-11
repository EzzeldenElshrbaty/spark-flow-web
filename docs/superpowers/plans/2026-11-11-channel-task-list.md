# Channel Task List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every channel one task list of real Flow tasks: a Task list tab with live status, assignee and due date, a checkbox that moves a task to Done and back, New task and Add an existing task, the + menu's "Task list · Pro", and tasks made in the channel joining it.

**Architecture:** A list is rows (`channelTasks`, DB v36) that point at tasks; `api.taskLists` reads them with each task's live fields and adds or removes rows. `addNew` makes the task through `createTicket` and adds its row in the same write. The tab is an sf view inside the channel page; ticking uses today's `tasks.moveTo` and permission rule. No new live event: list writes publish `channelChanged`, and `ticketUpdated` refreshes every list.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 (sf tokens), TanStack Query, Tabler icons via `components/sf/Icon`, sf primitives, Vitest (node, jsdom, Chromium through Playwright).

**Spec:** `docs/superpowers/specs/2026-11-11-channel-task-list-design.md` (read it with this plan; section numbers below are the spec's).

## Global Constraints

- `DB_VERSION = 36` ("36: channel task lists"); the migration's key is 35. A list holds at most 200 tasks.
- Every sentence a person reads is verbatim from spec §4.2, §5 and §7 (curly apostrophes; `src/copy.test.ts` checks).
- Chat screens: sf primitives (`components/sf/*`: `Button`, `IconButton`, `Checkbox` in `Toggle.tsx`, `Menu`, `Modal`, `Tag` in `Badge.tsx`), sf tokens, Tabler icons through `Icon`, Readex; logical direction classes only (`src/rtl.test.ts`); a 44 px touch on phones (`max-md:touch-target` or `touch`); no spinners, no toasts; `announce()` once per change.
- Data access: components import hooks from `@/api/*`, never `@/mocks`; every new `Api` method is listed in `src/mocks/audit.test.ts`.
- Status changes go only through `tasks.moveTo` with `firstOf(project, 'done' | 'todo')` from `lib/boardColumns.ts`; the rule is today's (`task.manage`, or `task.updateOwnStatus` for the assignee).
- Commands that run vitest or tsc need the sandbox off.

## Review Focus

1. **A project with its own board** (Done renamed or not first, an extra Done column): ticking must move to `firstOf(project, 'done')`, unticking to `firstOf(project, 'todo')`, never a hard-coded `'done'`/`'todo'` id. Test in Task 3.
2. **A task on the list archived, restored or deleted for good** while the tab is open: archived → it leaves the list (and its count), restored → it comes back in its place, deleted for good → its row is gone from the store. Test in Task 1.
3. **A double pick or double click:** the same task picked twice quickly in Add an existing task, or the checkbox clicked twice. Expect one row (the second gets "That task is already on this list." under the search field, not a crash) and one move (the checkbox is disabled while it saves). Tests in Task 3 and Task 4.
4. **A channel archived, or a reader who can't post (Only admins):** no New task, no Add an existing task, no Remove from list; the checkboxes still follow each task's own rights. Test in Task 3.
5. **A long title or name on a 390 px phone:** the title wraps (at most two lines), the meta line truncates, nothing scrolls sideways. Test in Task 3.

---

### Task 1: Task list data and API

**Files:**
- Create: `src/mocks/taskLists.ts`, `src/mocks/taskLists.test.ts`, `src/api/taskLists.ts`
- Modify: `src/api/types.ts`, `src/api/queryKeys.ts` (+ `queryKeys.test.ts`), `src/mocks/{db,migrations,seed,index,archive}.ts`, `src/mocks/migrations.test.ts`, `src/mocks/archive.test.ts`, `src/mocks/audit.test.ts`, `src/lib/http.ts` (+ `http.test.ts`), `docs/flow-chat/api-contract.md`

**Interfaces:**
- Produces:
  - `api/types.ts`: `ChannelTask`, `TaskListTask`, `TaskListEntry`, `TaskList` (spec §4.1); `Api.taskLists` with `get`, `add`, `remove` (Task 2 adds `addNew`).
  - `api/taskLists.ts`: `useTaskList(channelId: string | undefined)`, `useAddToTaskList()` (`{ channelId, taskKey }`), `useRemoveFromTaskList()` (`{ channelId, taskKey }`).
  - `qk.taskList(channelId) = ['chat', 'taskList', channelId]`.
  - `DbData.channelTasks: ChannelTask[]`.

- [ ] **Step 1: Write the failing tests**
  - `taskLists.test.ts` (built as `bookmarks.test.ts` builds its api; the actor is the seed's default unless `db.actAs` says):
    - `get('c-frontend')` returns NEX-106, NEX-105, NEX-103 and MOB-103 in the order added, each with `task.key`, `statusLabel`, `category`, `projectKey`, `assigneeId`, `dueAt`, `overdue` (MOB-103 `overdue: true`, NEX-103 `category: 'done'`).
    - `add('c-frontend', 'NEX-110')` as Mariam (`u-3`) returns an entry with `addedBy: 'u-3'`; `get` lists it last; an event `{ type: 'channelChanged', channelId: 'c-frontend' }` was published.
    - Refusals, each by `detail`: a DM (`c-dm-1`) → "Task lists are for channels."; an unknown key → "That task no longer exists."; an archived task → "This task is archived. Restore it first."; a task of another workspace's project → "That task is in another workspace."; NEX-106 again → 409 "That task is already on this list."; 200 rows already → "A task list holds up to 200 tasks."; an archived channel → "This channel is archived."; a non-member of a private channel → today's refusal.
    - `remove('c-frontend', 'NEX-105')` drops the row and leaves the task; removing it again → 404 "That task isn’t on this list."
    - An archived task is left out of `get`; restored, it is back at its place.
  - `migrations.test.ts`: a v35 doc with a task linked to `c-frontend` and one linked to a DM comes out with one `channelTasks` row (`addedBy` = reporter, `addedAt` = `createdAt`); a doc that already has `channelTasks` keeps it.
  - `archive.test.ts`: deleting an archived task for good drops its rows; deleting a project for good drops its tasks' rows.
  - `queryKeys.test.ts`: `channelChanged` for `c-frontend` includes `qk.taskList('c-frontend')`; `ticketUpdated` includes `['chat', 'taskList']`.
  - `http.test.ts`: `taskLists.get('c-1')` → `GET /api/channels/c-1/task-list`; `add('c-1', 'NEX-1')` → `POST …/task-list` `{ taskKey: 'NEX-1' }`; `remove` → `DELETE …/task-list/NEX-1`.
  - `audit.test.ts`: `'taskLists.get': READ`; `'taskLists.add'` and `'taskLists.remove'`: "a channel’s task list is its content, as pins and bookmarks are".

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project unit src/mocks/taskLists.test.ts src/mocks/migrations.test.ts src/mocks/archive.test.ts src/api/queryKeys.test.ts src/lib/http.test.ts src/mocks/audit.test.ts`
Expected: FAIL (`taskLists` undefined, no migration 35, no key).

- [ ] **Step 3: Implement**
  - Types and `Api.taskLists` in `api/types.ts` as spec §4.1.
  - `db.ts`: `DB_VERSION = 36` with its changelog line; `channelTasks` in `DbData` and `COLLECTIONS`.
  - `migrations.ts` key 35: `channelTasksFrom(doc)` (exported from `mocks/taskLists.ts`, also used by the seed): one row per live task whose `linkedChannelId` is a `kind: 'channel'` channel of the task's project's workspace; `id: 'ct-' + taskId`.
  - `seed.ts`: `channelTasks` = `channelTasksFrom` plus NEX-105, NEX-103 and MOB-103 on `c-frontend`, `addedBy: 'u-3'`, `addedAt` an hour apart after NEX-106's.
  - `mocks/taskLists.ts`: `taskListsApi(db: MockDb, hub: MockHub, now: () => Date): Api['taskLists']`, each write one `db.update`, checks in the order of spec §4.2; the entry's task fields as `tickets.resolve` builds them plus `id`, `projectId`, `dueAt` and `overdue` from `derive.ts`. Wire it in `createMockApi`.
  - `archive.ts` `deleteForGood`: drop `channelTasks` rows of the task, or of every task of the project.
  - `queryKeys.ts`: `qk.taskList`; `channelChanged` and `ticketUpdated` as Step 1.
  - `api/taskLists.ts` hooks, as `api/bookmarks.ts`.
  - `http.ts`: `get`, `add`, `remove`.
  - `api-contract.md`: "Phase 4 · Slice TL" (spec §4.3), all four calls.

- [ ] **Step 4: Run them to see them pass**

Run: the Step 2 command.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api src/mocks src/lib/http.ts src/lib/http.test.ts docs/flow-chat/api-contract.md
git commit -m "feat(chat): channel task lists in the mock and API (DB v36)"
```

### Task 2: Tasks made in a channel join its list

**Files:**
- Modify: `src/api/types.ts`, `src/mocks/tickets.ts`, `src/mocks/taskLists.ts`, `src/mocks/taskLists.test.ts`, `src/mocks/audit.test.ts`, `src/lib/http.ts` (+ `http.test.ts`), `src/api/taskLists.ts`, `src/pages/projects/TaskSheet.tsx` (+ `TaskSheet.test.tsx`), `src/pages/chat/useTaskFromMessage.tsx` (+ `useTaskFromMessage.test.tsx`), `src/pages/chat/ChannelPage.tsx`

**Interfaces:**
- Consumes: Task 1's `taskListsApi`, `ChannelTask`, `qk.taskList`.
- Produces:
  - `tickets.ts`: `checkNewTask(data: DbData, input: NewTicket): void` (today's `tasks.create` check, moved out unchanged) and `createTicket(db, hub, input, clock?, check?, then?: (data: DbData, created: Ticket) => void)`; `then` runs inside the write, after the task is pushed.
  - `Api.taskLists.addNew(channelId: string, input: NewTicket): Promise<TaskView>`; `http.ts` `POST /api/channels/{id}/task-list/new`; hook `useAddNewToTaskList()` (`{ channelId, input }`).
  - `TaskSheet` prop `onto?: { channelId: string }`.
  - `useTaskFromMessage(channelId, workspaceId, listed: boolean)` returns, besides today's fields, `newTask?: () => void` (the sheet with an empty draft: the project channel's project, else `useTaskProjects`' first with the Project field). `listed` is `channel.kind === 'channel'`.

- [ ] **Step 1: Write the failing tests**
  - `taskLists.test.ts`:
    - As Youssef (`u-1`, the Admin, in #frontend-dev), `addNew('c-frontend', { projectId: 'p-nex', title: 'Ship the list', … })` returns a task with `linkedChannelId: 'c-frontend'`; `get('c-frontend')` ends with it; one audit entry "created" for the task.
    - As Mariam (`u-3`, not a manager), `addNew` → today's `task.manage` refusal, and the store has no new task and no new row.
    - With 200 rows on the list, `addNew` → "A task list holds up to 200 tasks." and no new task (the counter isn't spent).
    - `addNew` from a message: `linkedMessageId` of a message in `c-p-nex` into `c-p-nex` works; one in `c-frontend` → "This message isn’t in the project’s chat." (today's rule).
  - `TaskSheet.test.tsx`: with `onto={{ channelId: 'c-frontend' }}`, saving calls `taskLists.addNew('c-frontend', …)` and not `tasks.create`; the announcement is "Task NEX-111 created and added to the task list."
  - `http.test.ts`: `addNew('c-1', input)` → `POST /api/channels/c-1/task-list/new` with the input.
  - `audit.test.ts`: `'taskLists.addNew'` recorded as a task created, with a call `a.taskLists.addNew('c-p-nex', newTask)`.
  - `useTaskFromMessage.test.tsx`: with `listed: true`, /task's sheet and Create task's sheet get `onto`; with `listed: false` (a DM), neither does; `newTask` exists only where `fromCommand` does, and its sheet doesn't post "Created KEY" or open the panel.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/mocks/taskLists.test.ts src/pages/projects/TaskSheet.test.tsx src/pages/chat/useTaskFromMessage.test.tsx src/mocks/audit.test.ts src/lib/http.test.ts`
Expected: FAIL (no `addNew`, no `onto`, no `newTask`).

- [ ] **Step 3: Implement**
  - `tickets.ts`: move the body of `tasks.create`'s check into `checkNewTask`; add `then` to `createTicket`.
  - `taskLists.addNew`: `createTicket(db, hub, { ...input, linkedChannelId: channelId }, now, check, then)` where `check` = readable channel, not a DM, `checkCanWrite`, `checkNewTask`, the 200 limit; and `then` pushes the row (`addedBy` = the actor). Publish `channelChanged`; return the `taskView`.
  - `TaskSheet`: with `onto`, `useAddNewToTaskList` instead of `useCreateTask`; the announcement per spec §5.
  - `useTaskFromMessage`: `onto` when `listed`; `newTask`; "Created KEY" stays /task's only.
  - `ChannelPage`: pass `channel.data?.kind === 'channel'`.

- [ ] **Step 4: Run them to see them pass**

Run: the Step 2 command, then `npx vitest run --project unit`.
Expected: PASS, all unit tests green.

- [ ] **Step 5: Commit**

```bash
git add src/mocks src/api src/lib/http.ts src/lib/http.test.ts src/pages/projects/TaskSheet.tsx src/pages/projects/TaskSheet.test.tsx src/pages/chat/useTaskFromMessage.tsx src/pages/chat/useTaskFromMessage.test.tsx src/pages/chat/ChannelPage.tsx
git commit -m "feat(chat): tasks made in a channel join its task list"
```

### Task 3: The Task list tab

**Files:**
- Create: `src/lib/taskList.ts` (+ `taskList.test.ts`), `src/pages/chat/tasks/ChannelTaskList.tsx`, `src/pages/chat/tasks/TaskListRow.tsx` (+ `TaskListRow.test.tsx`), `src/pages/chat/tasks/taskList.browser.test.tsx`
- Modify: `src/pages/chat/ChannelTabs.tsx`, `src/pages/chat/ChannelPage.tsx`, `src/pages/projects/ChatTab.tsx`, `src/pages/chat/MessageBody.tsx` (export `StatusDot`), `src/test/uxMatrix.ts`

**Interfaces:**
- Consumes: `useTaskList`, `useRemoveFromTaskList` (Task 1); `useTaskFromMessage(...).newTask` (Task 2); `useMoveTask`, `usePermission`, `useCanWrite`, `withInspector`, `firstOf`.
- Produces:
  - `lib/taskList.ts`: `orderTaskList(entries: TaskListEntry[]): { open: TaskListEntry[]; done: TaskListEntry[] }` (spec §2 Q5) and `listCounts(entries: TaskListEntry[]): { open: number; done: number }`.
  - `ChannelTab` gains `'tasks'`; `ChannelTabs` takes `taskCount?: number` and `showTasks: boolean`.
  - `ChannelTaskList({ channel, people, onNewTask, onAddExisting })`. `onAddExisting` is wired in Task 4; until then the button isn't drawn.

- [ ] **Step 1: Write the failing tests**
  - `taskList.test.ts`: open entries by due date (soonest first; no date last), ties by `addedAt` (oldest first); done entries after, by `addedAt`; `listCounts` → `{ open: 3, done: 1 }` for the seeded list.
  - `TaskListRow.test.tsx`:
    - The checkbox is named "Mark MOB-103 done" (open) and "Reopen NEX-103" (done); MOB-103's due reads "· late".
    - Without the right (a Member who isn't the assignee), the checkbox is disabled with the title "Only the project’s manager or the task’s assignee can change its status."
    - The ⋯ menu is "Task actions for NEX-105" with Open task, and Remove from list only when `canPost`.
  - `taskList.browser.test.tsx` (the whole app, `renderApp`; `api.db.reset()` in `beforeEach`):
    - #frontend-dev shows a "Task list" tab with count 3; it lists MOB-103, NEX-106, NEX-105, and "Done · 1" folded (`aria-expanded="false"`); the project key column shows (two projects).
    - Clicking MOB-103's title opens the task panel, and the address keeps `tab=tasks`.
    - As Nour (`u-2`, NEX's manager), ticking NEX-106 moves it to NEX's first Done column (`api.tickets.get('NEX-106')` category `done`) and it shows under Done; unticking puts it in the first To do column. With NEX's board changed (`api.projects.setBoard` so the first Done column has another label and order), ticking still lands in `firstOf(project, 'done')` (Review Focus 1).
    - Double-clicking the checkbox makes one move (Review Focus 3).
    - Remove from list on NEX-105 takes the row away; NEX-105 is still on NEX's board.
    - #backend (no rows) has no Task list tab; `?tab=tasks` there shows the tab and "No tasks on this list yet."
    - A reader who can't post (a channel set to Only admins, as Mariam) sees no New task and no Remove from list, and MOB-103's checkbox follows its own rule (Review Focus 4).
    - The project page's Chat tab (`/w/engineering/p/NEX/chat`) has no Task list tab.
    - Phone 390 px, dark: rows are two lines, a 400-character title wraps and the meta line truncates, `answersTouch` for the checkbox and ⋯, no sideways scroll (Review Focus 5); `axeProblems` is empty.
    - Keyboard only: Tab reaches the title link, the checkbox and ⋯ in that order; Space ticks.
  - `uxMatrix.ts`: `UX_PAGES` gains `'c/c-frontend?tab=tasks'`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/taskList.test.ts src/pages/chat/tasks`
Expected: FAIL (no module).

- [ ] **Step 3: Implement**
  - `lib/taskList.ts` as Interfaces.
  - `ChannelTabs`: the `tasks` item (label "Task list", `IconListCheck`, `count` = `taskCount` when above 0); `channelTabs` keeps it for `kind: 'channel'`; drawn only when `showTasks`.
  - `ChannelPage`: `ChannelTop` reads `useTaskList(channel.id)` (only for `kind: 'channel'`) and passes `showTasks = entries.length > 0 || tab === 'tasks'`; the `tasks` panel renders `ChannelTaskList` inside `<div className="sf flex min-h-0 flex-1 flex-col">`, as the Page tab does.
  - `ChatTab`: `hideTabs={['files', 'tasks']}`.
  - `ChannelTaskList` and `TaskListRow` per spec §5 (top row, rows, Done fold, checkbox, empty, loading, error, phone layout, announcements). The checkbox's right uses `usePermission()` with `task.manage` / `task.updateOwnStatus` on the row's project (from `useProjectSummaries`); it calls `useMoveTask` with `firstOf(project, 'done' | 'todo').id` and index 0, disabled while pending; a refusal shows as the row's sentence.
  - `MessageBody.tsx`: export `StatusDot`.

- [ ] **Step 4: Run them to see them pass**

Run: the Step 2 command, then `UX_MATRIX=full npx vitest run --project browser src/ux.browser.test.tsx -t "c-frontend\?tab=tasks"`
Expected: PASS; the new UX cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskList.ts src/lib/taskList.test.ts src/pages/chat src/pages/projects/ChatTab.tsx src/test/uxMatrix.ts
git commit -m "feat(chat): the channel's Task list tab"
```

### Task 4: Adding tasks, the + menu item, help and docs

**Files:**
- Create: `src/pages/chat/tasks/AddTaskDialog.tsx` (+ `AddTaskDialog.test.tsx`)
- Modify: `src/pages/chat/tasks/ChannelTaskList.tsx`, `src/pages/chat/tasks/taskList.browser.test.tsx`, `src/pages/chat/composer/RichComposer.tsx` (+ `RichComposer.browser.test.tsx`), `src/pages/chat/ChannelPage.tsx`, `src/layers.browser.test.tsx`, `src/help/chat.md`, `docs/flow-chat/FLOW_CHAT_REDESIGN.md`, `docs/flow-chat/AUDIT.md`, `CLAUDE.md`, `tasks/todo.md`

**Interfaces:**
- Consumes: `useAddToTaskList` (Task 1), `useTaskList`, `useMentionDirectory` and `mentionOptions` (today's), `ChannelTaskList`'s `onAddExisting` (Task 3).
- Produces: `AddTaskDialog({ channel, onClose })`; `RichComposer` prop `onTaskList?: () => void`.

- [ ] **Step 1: Write the failing tests**
  - `AddTaskDialog.test.tsx`:
    - Opening it shows "Add an existing task", the field "Find a task" (placeholder "Key or title") and "Assigned to you" with my open tasks (up to 8).
    - Typing "unread" lists NEX-106 marked "On the list" (not pickable); typing "csv" lists NEX-109; picking it calls `taskLists.add('c-frontend', 'NEX-109')`, marks it "On the list" and announces "NEX-109 added to the task list."
    - Typing "zzz" shows "No tasks match “zzz”."
    - A refusal shows its sentence under the field.
    - Done closes it.
  - `RichComposer.browser.test.tsx`: with `onTaskList`, the Attach menu has a separator then "Task list" with a "Pro" tag, and choosing it calls `onTaskList`; without the prop there is no item.
  - `taskList.browser.test.tsx`, more cases:
    - From #backend's + menu, Task list opens `?tab=tasks`.
    - Add an existing task: pick NEX-110, and it shows on the list; picking the same result twice quickly leaves one row (Review Focus 3).
    - As Youssef (`u-1`, the Admin, in #frontend-dev), New task on #frontend-dev saves through the sheet and the task shows on the list.
    - /task in #backend (as Youssef, a member) makes the tab appear with the new task.
  - `layers.browser.test.tsx`: `{ name: 'Add an existing task', path: '/w/engineering/c/c-frontend?tab=tasks', open: () => mainButton('Add an existing task'), kind: 'modal' }` and `{ name: 'New task from the task list', path: same, open: () => mainButton('New task'), kind: 'sheet', change: typeInto('Title'), question: 'Discard this new task?' }` (as an actor who may make tasks, as the existing New task layer does).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/chat/tasks src/pages/chat/composer/RichComposer.browser.test.tsx src/layers.browser.test.tsx`
Expected: FAIL (no dialog, no item).

- [ ] **Step 3: Implement**
  - `AddTaskDialog` per spec §6 (an sf `Modal`, no `dirty`; results from the mention directory's tasks, live ones only, matched by `mentionOptions`' word-start rule with a limit of 20; "Assigned to you" = my open tasks before typing).
  - `ChannelTaskList`: "Add an existing task" opens it; both buttons per spec §5.
  - `RichComposer`: the Attach menu item (`MenuSeparator`, `MenuItem icon={IconListCheck}` with `<Tag>Pro</Tag>`), in the channel composer only; `ChannelComposer` passes `onTaskList` for `kind: 'channel'` (setting `tab=tasks`).
  - Docs: `src/help/chat.md` "## Task lists" (what it holds, adding, ticking, who may); `FLOW_CHAT_REDESIGN.md` §6.14 a "Built (task list, …)" line; `AUDIT.md` rows 6.8-101, 6.8-102, 6.14-29 marked built; `CLAUDE.md` a "Task lists" rule (rows in `channelTasks`, `api.taskLists`, `addNew` one write, `useTaskFromMessage` `listed`, the tab's rule, Pro tag only); `tasks/todo.md` the section.

- [ ] **Step 4: Run the gates**

Run: `npm run lint && npx tsc -b && npm test && npm run build:prototype && npm run test:ux`
Expected: all pass (the 1,000 UX cases plus the new task list page's).

- [ ] **Step 5: Commit**

```bash
git add src docs CLAUDE.md tasks/todo.md
git commit -m "feat(chat): add tasks to a channel's list, and Task list in the + menu"
```
