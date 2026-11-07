# Project Files tab, task attachments and rich task description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project Files tab listing every project file, files on tasks (New task / Edit task, shown in the panel), and a rich task description that formats text and holds files.

**Architecture:** The description is chat's structured body (`lib/messageBody.ts`) plus a top-level file block, stored as `Ticket.descriptionBody` with the plain `description` worked out by the mock. A task's files upload first (`files.uploadForTask`, unlinked, uploader-only) and link on save (`attachmentIds`). The mock gathers a project's files from every place (`files.inProject`); the pages only render. The editor reuses chat's Lexical conversions through two small exports from `bodyEditor.ts` plus a `FileNode`.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 tokens, TanStack Query, React Router, Lexical 0.52, Vitest (unit = Node/jsdom, browser = Chromium).

**Spec:** `docs/superpowers/specs/2026-11-07-project-files-and-task-attachments-design.md`

## Global Constraints

- Work in the worktree `Spark_Flow/.worktrees/task-files`, branch `feat/task-files` (cut from `dev` 4d14af5). Never push unless the user says so.
- Run git, npm and vitest with the sandbox off; vitest as `npx vitest run … < /dev/null`. Never run `npx prettier`.
- Components import data only from `@/api/*`; every new `Api` method is listed in `src/mocks/audit.test.ts`.
- Semantic tokens only (`bg-surface`, `text-fg-muted`, `border-line`…), lucide icons, `components/ui/*` in project pages; logical direction classes only (`ms-`, `pe-`, `text-start`…; `src/rtl.test.ts`).
- Every file `src`/`href` goes through `safeFileUrl`; PDFs only through `FileViewer`.
- No toasts, no spinners, `Sheet` only; errors are sentences near the cause; `…` for pending; sentence case.
- Exact sentences (spec §4.2): "Attach up to 20 files to a task." · "You can only attach files you uploaded." · "Upload that file again to attach it here." · "{title} is still being checked." · "{title} was blocked." · "The description couldn't be read. Try again." · "Keep the description under 20,000 characters."
- Copy (spec §5): "Attachments", "Add files or drop them here", "Attach files", "Uploading…", "Try again", "Wait for the files to finish uploading.", "Files changed", "This file was removed.", "Being checked", "Blocked", "From", "Load more", "Clear filters", "No files yet. Files added to tasks, comments, chat and Overview show here.", "No files match these filters.", "Use a web address that starts with http:// or https://".
- Limits: 20 files a task; description text 20,000 characters (`descriptionText(body).length`); 50 rows a Files page.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Editing an old task saves nothing it didn't change.** A migrated plain description re-read by the sheet and saved untouched must not send `descriptionBody` (deep equality in `changedFields`). Test in Task 2.
2. **A removed attachment the description still shows.** Removing a file without sending a body (another tab, an API client) strips its blocks server-side; the panel shows "This file was removed." for any stale block. Tests in Task 5 and Task 11.
3. **A file in several places.** A project file later shared in chat, or a comment file whose chat card repeats it, lists once under its first place. Test in Task 6.
4. **Leaving the sheet mid-upload, or a failed upload.** Save stays disabled while any row is queued or uploading; a failed row can be retried or dismissed and is never sent. Test in Task 8.
5. **Pasting rich text or files into the description.** Paste inserts plain text only; pasted files upload and nothing else is inserted. Test in Task 10.

---

### Task 1: The description format

**Files:**
- Modify: `src/lib/messageBody.ts`
- Test: `src/lib/messageBody.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FileBlock = { type: 'file'; id: string }
  export type DescBlock = Block | FileBlock
  export type DescBody = DescBlock[]
  export const MAX_DESCRIPTION = 20_000
  export function validDescription(value: unknown, fileIds: ReadonlySet<string>): DescBody | null
  export function descriptionText(body: DescBody): string
  export function textBody(text: string): DescBody
  ```

- [ ] **Step 1: Write the failing tests** in a new `describe('description body (task description)')`:
  - `validDescription` returns an equal body for `[p(text b + link), quote[p], ul, ol, code, {type:'file', id:'a-1'}]` with `fileIds = new Set(['a-1'])`.
  - returns `null` for a paragraph holding each of `user`, `all`, `here`, `channel`, `task`, `project` inlines.
  - returns `null` for a file block whose id isn't in `fileIds`, a file block inside a quote, a file block with id `'../x'`, a `javascript:` link, 2,001 blocks.
  - `validBody([{ type: 'file', id: 'a-1' }])` is `null` (chat still refuses file blocks).
  - `descriptionText([p('a'), file, ul[['x'],['y']], code('c')])` is `'a\n\nx\ny\n\nc'`.
  - `textBody('a\nb\n\n\nc')` is `[{type:'p',children:[{type:'text',text:'a\nb'}]},{type:'p',children:[{type:'text',text:'c'}]}]`; `textBody('  \n ')` is `[]`; `textBody('*x* https://a.b NEX-1')` is one paragraph with that exact text, no marks, links or task inlines.
  - for `s = 'one\ntwo\n\nthree'`: `textBody(descriptionText(textBody(s)))` equals `textBody(s)`.
- [ ] **Step 2: Run** `npx vitest run src/lib/messageBody.test.ts < /dev/null` — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** in `messageBody.ts`. `validDescription`: budget and block count as `validBody`; each top-level item is either a file block (`ID.test(id) && fileIds.has(id)`) or `validBlock(b, false, budget)`; then every inline (`inlinesOf`, widened to `DescBody`) must be `text` or `link`. `descriptionText`: non-file blocks through `bodyText([b])`, joined with `'\n\n'`. `textBody`: `text.trim()` split on `/\n\s*\n/`, each chunk one `p` with a single plain `text` inline.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): description body format with file blocks`.

### Task 2: Tasks store `descriptionBody` (DB v31)

**Files:**
- Modify: `src/api/types.ts` (Ticket, NewTicket, TicketPatch), `src/mocks/db.ts` (`DB_VERSION = 31`), `src/mocks/migrations.ts`, `src/mocks/seed.ts` (`buildTickets`, one formatted seed description), `src/mocks/tickets.ts` (`TASK_FIELDS`, `checkTaskInput`, `createTicket`, `updateTicket`), `src/mocks/activity.ts` (`diffTask`), `src/pages/projects/taskForm.ts` (`changedFields`), `src/pages/projects/TaskSheet.tsx` (interim), `src/pages/chat/taskDraft.ts`, `src/pages/chat/useTaskFromMessage.tsx`, and every test fixture `tsc` flags.
- Test: `src/mocks/migrations.test.ts`, `src/mocks/tasks.test.ts`, `src/mocks/seed.test.ts`, `src/pages/projects/taskForm.test.ts`, `src/pages/chat/taskDraft.test.ts`

**Interfaces:**
- Consumes: Task 1 (`DescBody`, `validDescription`, `descriptionText`, `textBody`, `MAX_DESCRIPTION`).
- Produces: `Ticket.descriptionBody: DescBody`, `Ticket.attachmentIds: string[]`; `NewTicket` = old minus `description`, plus `descriptionBody?: DescBody` and `attachmentIds?: string[]`; `TicketPatch` = old minus `description`, plus `descriptionBody?: DescBody` and `attachmentIds?: string[]`; `TaskDraft = Pick<NewTicket, 'title' | 'descriptionBody'> & …` (rest unchanged).

- [ ] **Step 1: Write the failing tests:**
  - migrations `describe('30 → 31')`: `migrate({ version: 30, tickets: [{ id: 't1', description: 'a\n\nb' }] }, 31)` equals `{ version: 31, tickets: [{ id: 't1', description: 'a\n\nb', descriptionBody: [p('a'), p('b')], attachmentIds: [] }] }`.
  - seed: every seeded ticket has `attachmentIds` (array) and `description === descriptionText(descriptionBody)`; `NEX-105`'s body has a `ul` (the formatted seed description: keep its sentence, add a bulleted list "Pointer", "Touch", "Keyboard").
  - tasks: create with `descriptionBody: [{ type: 'p', children: [{ type: 'text', text: 'Ship it', marks: ['b'] }] }]` → the TaskView has that body and `description: 'Ship it'`; create with no `descriptionBody` → `[]` and `''`.
  - tasks (as `u-2`): a body with a `user` inline → `400` "The description couldn't be read. Try again."; a 20,001-character paragraph → `400` "Keep the description under 20,000 characters."
  - tasks: update `NEX-101` with only a formatting change (same text, now bold) → history for `NEX-101` gets a `task.changed` entry with field `description`.
  - taskForm: `changedFields(task, { descriptionBody: structuredClone(task.descriptionBody), attachmentIds: [...task.attachmentIds] })` is `{}`; a changed body is reported.
  - taskDraft: a message "Fix login\nsteps" gives `descriptionBody` equal to `textBody('Fix login\nsteps')`.
- [ ] **Step 2: Run** `npx vitest run src/mocks/migrations.test.ts src/mocks/tasks.test.ts src/mocks/seed.test.ts src/pages/projects/taskForm.test.ts src/pages/chat/taskDraft.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Migration step `30`: for each ticket, `descriptionBody = textBody(String(description ?? ''))`, `description = descriptionText(descriptionBody)`, `attachmentIds = []`.
  - Seed `buildTickets`: same derivation from `RawTicket.description`; `attachmentIds: []`.
  - `tickets.ts`: `TASK_FIELDS` swaps `'description'` for `'descriptionBody'` (attachments come in Task 5). `checkTaskInput(data, projectId, input, ticket?)` checks `input.descriptionBody` with `validDescription(body, new Set(ticket?.attachmentIds ?? []))` and `MAX_DESCRIPTION`, sentences above. `createTicket` stores `descriptionBody: input.descriptionBody ?? []`, `description: descriptionText(…)`, `attachmentIds: []`. `updateTicket` re-derives `description` after applying a patch that has `descriptionBody`.
  - `diffTask`: the `description` row compares `JSON.stringify(descriptionBody)` (still `from/to: null`).
  - `changedFields`: `descriptionBody` and `attachmentIds` compared with `JSON.stringify`.
  - TaskSheet (interim, replaced in Task 10): the textarea edits `task?.description ?? descriptionText(draft?.descriptionBody ?? [])`; save sends `descriptionBody: textBody(values.description)`.
  - `taskDraft` returns `descriptionBody: textBody(plain.trim())`; `/task` passes `descriptionBody: []`.
  - Run `npx tsc -b` and fix each flagged fixture: `description: 'x'` in a `NewTicket` → `descriptionBody: textBody('x')`; a full `Ticket` literal gains `descriptionBody: [], attachmentIds: []`.
- [ ] **Step 4: Run** the Step 2 command, then `npx tsc -b` — Expected: PASS, no errors.
- [ ] **Step 5: Commit** `feat(tasks): tasks store a description body (DB v31)`.

### Task 3: Task files on read, one "in use" rule, who may open

**Files:**
- Modify: `src/api/types.ts` (`TaskView`), `src/mocks/derive.ts` (`taskView`), `src/mocks/seed.ts` (a task file), `src/mocks/files.ts` (`fileInUse`, `placesOf`, `url`, `requireUnfrozen`, `removeFromProject`), `src/mocks/archive.ts` (`deleteForGood`, the `includes.files` count)
- Test: `src/mocks/derive.test.ts`, `src/mocks/seed.test.ts`, `src/mocks/files.test.ts`, `src/mocks/archive.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Ticket.attachmentIds`).
- Produces: `TaskView.attachments: Attachment[]`; seed file `a-nex-101-flow` on `NEX-101`; `export function fileInUse(data: DbData, fileId: string): boolean` in `mocks/files.ts`; `taskView(task, data: Pick<Source,'timeEntries'|'projects'> & Partial<Pick<Source,'attachments'>>, now, project?)`.

- [ ] **Step 1: Write the failing tests** (seed a task file with a `db.update` that pushes an attachment from `fileRecord`, sets `NEX-101.attachmentIds`, and `db.putFile`s its bytes):
  - derive: `attachments` follow `attachmentIds` order and leave out a deleted file and a missing id.
  - seed: `NEX-101` has one attachment, `a-nex-101-flow` (`token-rotation.pdf`, the `scopePdf` bytes, uploaded by `u-2`), and its body shows it as a file block.
  - files: `fileInUse` is true for a file in a message, a reply, a trash snapshot, a project file, a comment, a task; false for a fresh `uploadForChat` file that was never sent.
  - files: as `u-3` (on NEX) `details(id).taskKeys` contains `'NEX-101'` and `url(id)` opens; as `u-8` (not on NEX) `url(id)` rejects with 403 and `details` with 404.
  - files: `removeFromProject` of a project file that a task also has keeps the record and its bytes.
  - archive: deleting an archived task for good removes its attachment and its comment's file (records and bytes) but keeps a file that a project file also has; the row's `includes.files` counts them.
- [ ] **Step 2: Run** `npx vitest run src/mocks/derive.test.ts src/mocks/files.test.ts src/mocks/archive.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement.** `fileInUse` checks messages, replies, `trash[].snapshot.attachments`, `projectFiles`, `comments[].attachmentIds`, `tickets[].attachmentIds`. `placesOf.taskKeys` adds tickets that hold the file (`onProject`). `url` looks up a ticket's project after project files and comments. `requireUnfrozen` adds tickets' projects. `removeFromProject` and `deleteForGood` use `fileInUse`; `deleteForGood`'s candidates: project → its project files, its tasks' attachments and its comments' files; task → its attachments and its comments' files.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(files): task files count in access and cleanup`.

### Task 4: Uploading a task's file

**Files:**
- Modify: `src/api/types.ts` (`Api.files.uploadForTask`), `src/mocks/files.ts`, `src/lib/http.ts`, `src/api/files.ts`, `src/mocks/audit.test.ts`
- Test: `src/mocks/files.test.ts`, `src/lib/http.test.ts`

**Interfaces:**
- Produces: `uploadForTask(projectId: string, file: UploadFile, options?: UploadOptions): Promise<Attachment>` on `Api.files`; `export const uploadTaskFile = (projectId: string, file: UploadFile, options?: UploadOptions) => api.files.uploadForTask(projectId, file, options)` in `src/api/files.ts`.

- [ ] **Step 1: Write the failing tests:**
  - as `u-2` on NEX: the result has `uploadedBy: 'u-2'`, `scanStatus: 'clean'`; `onProgress` saw `[0.25, 0.5, 0.75, 1]`; `url` opens for `u-2`; as `u-3`, `url` rejects 404 (unlinked, not theirs).
  - as `u-3` (NEX member, not manager): rejects 403.
  - on an archived project: rejects 400 with `openProject`'s sentence.
  - an aborted signal rejects with `name: 'AbortError'` and stores no attachment; an empty file → 400 "That file is empty.".
  - audit.test: `'files.uploadForTask'` in `NOT_RECORDED`: `` `${MESSAGE}; a task's file is recorded when the task that names it is saved` ``.
  - http.test: `uploadForTask('p-nex', file)` posts `/api/files/upload-url` with `{ projectId: 'p-nex', name, size, mimeType }`, PUTs the bytes, posts `/complete`.
- [ ] **Step 2: Run** `npx vitest run src/mocks/files.test.ts src/lib/http.test.ts src/mocks/audit.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement.** Take the steps, `withSavedBytes` and cancel handling of `uploadForChat` into one private `uploadUnlinked(file, uploaderId, options, recheck: (data) => void)`; `uploadForTask` checks `requireCan(data, 'task.manage', openProject(data, projectId))` before and inside the write. HTTP: the chat three steps with `{ projectId }` in place of `{ channelId }`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(files): upload a task's file before the task is saved`.

### Task 5: Attaching files when a task is saved

**Files:**
- Modify: `src/mocks/tickets.ts`, `src/mocks/activity.ts` (`diffTask` field `attachments`), `src/lib/activityText.ts`
- Test: `src/mocks/tasks.test.ts`, `src/lib/activityText.test.ts`

**Interfaces:**
- Consumes: Task 3 (`fileInUse`), Task 4 (`uploadForTask` in tests).
- Produces: `create`/`update` accept `attachmentIds`; `filesChanged { projectId }` on a change of files.

- [ ] **Step 1: Write the failing tests** (as `u-2` on NEX, files from `uploadForTask('p-nex', …)`):
  - create with `attachmentIds: [f.id]` and a body holding `{ type: 'file', id: f.id }` → `attachments` is `[f]`, the body kept; `filesChanged` for `p-nex` published.
  - 21 ids → 400 "Attach up to 20 files to a task."; `[f.id, f.id]` stores `[f.id]`.
  - an unknown id → 404; `u-3`'s upload → 403 "You can only attach files you uploaded."; a seeded project file's id (`a-mob-scope` on a MOB task, as `u-4`) → 400 "Upload that file again to attach it here."; a file set to `scanStatus: 'pending'` → 400 "{title} is still being checked."; `'blocked'` → "{title} was blocked.".
  - a body naming a file not in `attachmentIds` → 400 "The description couldn't be read. Try again."
  - update with `attachmentIds: []` and no body: the stored body loses its file block, `description` re-derived, the file record and bytes are gone; the history entry has field `attachments`; the audit entry has a change with field `Files`, `from` the file's title, `to` null.
  - update that keeps a file someone else uploaded (already on the task) succeeds.
  - the assignee sending `{ attachmentIds: [] }` → 403.
  - activityText: a `task.changed` with field `attachments` reads "Files changed" and "{who} changed the files".
- [ ] **Step 2: Run** `npx vitest run src/mocks/tasks.test.ts src/lib/activityText.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement.** `TASK_FIELDS` adds `'attachmentIds'`. `checkAttachments(data, ticket: Ticket | undefined, ids: unknown, meId: string): string[]` (dedupe in order, then the spec §4.2 rows in order) runs in the create and update checks; `checkTaskInput` validates the body against the resulting ids. In `updateTicket`, when the patch has `attachmentIds` and no `descriptionBody`, filter the stored body's file blocks to the new ids; removed ids that `!fileInUse` leave `data.attachments` in the same write and their bytes are deleted after it; audit pushes `{ field: 'Files', from: titles(before) || null, to: titles(after) || null }` (titles joined with `, `); publish `filesChanged` when the ids changed (create: when non-empty).
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): attach files to a task on save`.

### Task 6: A project's files

**Files:**
- Modify: `src/api/types.ts` (`ProjectFileSource`, `ProjectFileRow`, `ProjectFileFilter`, `Api.files.inProject`), `src/mocks/files.ts`, `src/lib/http.ts`, `src/api/queryKeys.ts` (`projectFilesAll`, `keysForEvent`), `src/api/projects.ts`, `src/mocks/audit.test.ts`
- Test: `src/mocks/files.test.ts`, `src/api/queryKeys.test.ts`, `src/lib/http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ProjectFileSource = { kind: 'overview' } | { kind: 'task'; taskKey: string } | { kind: 'comment'; taskKey: string; commentId: string; bug: boolean } | { kind: 'chat'; messageId: string; replyId: string | null }
  export type ProjectFileRow = { file: Attachment; source: ProjectFileSource }
  export type ProjectFileFilter = { from?: ProjectFileSource['kind']; type?: FileKind; cursor?: string }
  inProject(projectId: string, filter: ProjectFileFilter): Promise<Page<ProjectFileRow>>   // Api.files
  qk.projectFilesAll(projectId: string, filter: Omit<ProjectFileFilter, 'cursor'>) => ['projects', 'files', projectId, 'all', filter]
  export function useAllProjectFiles(projectId: string | undefined, filter: Omit<ProjectFileFilter, 'cursor'>)   // useInfiniteQuery, as useChannelFiles
  ```

- [ ] **Step 1: Write the failing tests** (NEX as `u-2`: a project file via `files.upload`, a task file via `uploadForTask` + `tasks.update`, a comment with a file via `comments.create`, a chat message with a file via `uploadForChat('c-p-nex')` + `chat.send` with `fileIds`):
  - `inProject('p-nex', {})` holds those four with sources `overview`, `task{taskKey}`, `comment{taskKey, commentId, bug:false}`, `chat{messageId, replyId:null}`, plus the seeded `a-shot-105` as `comment{ taskKey: 'NEX-105', bug: true }`; the comment's chat card adds no row; newest first.
  - the project file shared into `c-p-nex` (`files.share`) still lists once, as `overview`.
  - `{ from: 'chat' }` keeps only chat rows; `{ type: 'pdf' }` only PDFs; a deleted file (`files.delete`) is gone.
  - 51 project files → first page 50 with `nextCursor: '50'`, the second page 1 (plus the others).
  - as `u-8` (not on NEX): chat rows only.
  - audit.test: `'files.inProject': READ`; http.test: `GET /api/projects/p-nex/all-files?from=chat&type=pdf&cursor=50`.
  - queryKeys.test: `commentAdded` includes `qk.files('p-nex')`; `messageReceived` with an attachment includes `['projects', 'files']`, without one it doesn't; `fileChanged` includes `['projects', 'files']`.
- [ ] **Step 2: Run** `npx vitest run src/mocks/files.test.ts src/api/queryKeys.test.ts src/lib/http.test.ts src/mocks/audit.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement `inProject`.** Collect places `{ fileId, at, rank, source }`: project files (`createdAt`, rank 0), the project's tickets' attachments (attachment `createdAt`, 1), its comments not deleted (`createdAt`, 2), messages in `project.channelId` without `commentId` and not deleted, and their replies not deleted (`createdAt`, 3). Keep the least `(at, rank)` per file; drop missing, deleted and not `visibleFile` (catch); apply `from` and `fileKind(file) === type`; sort `file.createdAt` desc then id desc; page by numeric cursor as `inChannel`. `findProject` first (404).
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(files): every file of a project in one list`.

### Task 7: One upload queue for Overview files and the task sheet

**Files:**
- Create: `src/pages/projects/useUploadQueue.ts`
- Modify: `src/pages/projects/uploadQueue.ts` (`UploadRow.progress?: number`, `UploadRow.tag?: string`, `rowLabel` "Uploading… 50%"), `src/pages/projects/ProjectFiles.tsx` (uses the hook; behaviour unchanged)
- Test: `src/pages/projects/useUploadQueue.test.tsx`, `src/pages/projects/uploadQueue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QueueUpload<T> = (file: File, opts: { signal: AbortSignal; onProgress: (p: number) => void }) => Promise<T>
  export function useUploadQueue<T>(upload: QueueUpload<T>, onDone: (result: T, row: UploadRow) => void): {
    rows: UploadRow[]; busy: boolean
    add(files: File[] | FileList | null, tag?: string): void
    cancel(id: string): void; retry(id: string): void; dismiss(id: string): void; canRetry(id: string): boolean
  }
  ```

- [ ] **Step 1: Write the failing tests** (`renderHook`, a fake `upload` resolving by hand):
  - two files upload one at a time, in order; each done row calls `onDone(result, row)` with its `tag` and leaves `rows`.
  - a refused type starts `failed` with `acceptFiles`' sentence and is never uploaded.
  - `cancel` → `cancelled`, `retry` → queued again and uploaded; a rejected upload → `failed` with its message; `busy` is true while one is queued or uploading.
  - `onProgress(0.5)` makes `rowLabel` read "Uploading… 50%".
- [ ] **Step 2: Run** `npx vitest run src/pages/projects/useUploadQueue.test.tsx src/pages/projects/uploadQueue.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement** the hook from `ProjectFiles.tsx`'s jobs/queue/pump code; `ProjectFiles` passes `(file, { signal }) => upload.mutateAsync({ projectId, file, signal })`.
- [ ] **Step 4: Run** the Step 2 command and `npx tsc -b` — Expected: PASS.
- [ ] **Step 5: Commit** `refactor(files): one upload queue hook`.

### Task 8: Attachments in the task sheet and the task panel

**Files:**
- Create: `src/pages/projects/TaskAttachments.tsx`
- Modify: `src/pages/projects/TaskSheet.tsx`, `src/pages/projects/TicketInspector.tsx`
- Test: `src/pages/projects/TaskAttachments.test.tsx`, `src/pages/projects/TaskSheet.test.tsx` (new; hooks mocked as in `src/layout/NewTaskButton.test.tsx`)

**Interfaces:**
- Consumes: Task 4 (`uploadTaskFile`), Task 7 (`useUploadQueue`).
- Produces: `TaskAttachments({ files: Attachment[]; rows: UploadRow[]; readOnly: boolean; onAdd(files: FileList | File[]): void; onRemove(id: string): void; onCancel(id: string): void; onRetry(id: string): void; onDismiss(id: string): void; canRetry(id: string): boolean })`. TaskSheet state `attachments: Attachment[]` (from `task.attachments`), the queue with `tag` `'attachments' | 'editor'` (the editor tag is used in Task 10).

- [ ] **Step 1: Write the failing tests:**
  - TaskAttachments: a row per file (title, size) and per upload row (`rowLabel`); × calls `onRemove`; a failed row has Try again (when `canRetry`) and dismiss; the drop zone reads "Add files or drop them here" with the allowed files hint and calls `onAdd` on drop and pick; `readOnly` shows the files without × or the drop zone.
  - TaskSheet: with a row uploading, Save task is disabled and "Wait for the files to finish uploading." shows; a new task's save sends `attachmentIds` in the order added; removing a file on an edit sends the shorter `attachmentIds`; an untouched edit sends no `attachmentIds`; a failed upload adds nothing to `attachmentIds`.
- [ ] **Step 2: Run** `npx vitest run src/pages/projects/TaskAttachments.test.tsx src/pages/projects/TaskSheet.test.tsx < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement.** The section sits under Description with the heading "Attachments" in the field label style; upload rows as `ProjectFiles` draws them. TicketInspector: after the description, when `t.attachments.length`, an "Attachments · N" heading (the Description heading's classes) and `<AttachmentView attachments={t.attachments} />`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): attachments in the task sheet and panel`.

### Task 9: Editor ⇄ description, with a file node

**Files:**
- Modify: `src/pages/chat/composer/bodyEditor.ts` (export `$blockOf`, `$appendBlock`; `$bodyFromEditor` / `$editorFromBody` use them; behaviour unchanged)
- Create: `src/pages/projects/description/FileNode.tsx`, `src/pages/projects/description/DescriptionFile.tsx`, `src/pages/projects/description/descriptionEditor.ts`
- Test: `src/pages/projects/description/descriptionEditor.test.ts` (headless, as `bodyEditor.test.ts`); existing `bodyEditor.test.ts` must stay green

**Interfaces:**
- Produces:
  ```ts
  // bodyEditor.ts
  export function $blockOf(node: LexicalNode): Block | null            // one root child as a block; null when empty
  export function $appendBlock(root: ElementNode, block: Block): void
  // FileNode.tsx — block DecoratorNode, type 'description-file'
  export type DescFile = Pick<Attachment, 'id' | 'title' | 'name' | 'mimeType' | 'size'>
  export class FileNode extends DecoratorNode<ReactNode> { getFile(): DescFile }
  export function $createFileNode(file: DescFile): FileNode
  export const $isFileNode: (node: LexicalNode | null | undefined) => node is FileNode
  // descriptionEditor.ts
  export const DESCRIPTION_NODES: Klass<LexicalNode>[]                  // COMPOSER_NODES minus EntityNode, plus FileNode
  export function $descriptionFromEditor(): DescBody                    // file nodes → file blocks; task inlines → text
  export function $editorFromDescription(body: DescBody, files: ReadonlyMap<string, DescFile>): void
  export function $insertFile(file: DescFile): void                     // at the selection, else at the end
  export function $removeFile(id: string): void                         // every node of that file
  ```
  ```ts
  // DescriptionFile.tsx — one file inside a description, in the editor and in the panel
  export function DescriptionFile({ file, onOpen }: { file: DescFile; onOpen?: () => void }): ReactNode
  ```
  An image (`fileKind(file) === 'image'`) is a picture through `useFileUrl` + `safeFileUrl` (`max-h-64 rounded-lg border border-line`); any other file is a chip: type icon, title, `sizeText`. With `onOpen` it is a button named after the title. `FileNode.decorate()` renders it without `onOpen`.

- [ ] **Step 1: Write the failing tests:**
  - round trip: `[p(b,i,u,s,code marks), link, ul, ol, quote, code, file a-1, p]` with `files` holding `a-1` comes back equal.
  - text "See NEX-101" reads back as plain text (no `task` inline).
  - a file block whose id isn't in `files` is dropped on load.
  - `$insertFile` with no selection appends a file block at the end; `$removeFile('a-1')` removes both copies of `a-1`.
- [ ] **Step 2: Run** `npx vitest run src/pages/projects/description/descriptionEditor.test.ts src/pages/chat/composer/bodyEditor.test.ts < /dev/null` — Expected: FAIL (new file), bodyEditor PASS.
- [ ] **Step 3: Implement.** `$descriptionFromEditor` walks root children: `$isFileNode` → `{ type: 'file', id }`; else `$blockOf`, then `task` inlines become `{ type: 'text', text: key }` (merged with `appendInlines`).
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): description editor conversions with files`.

### Task 10: The description editor in the task sheet

**Files:**
- Create: `src/pages/projects/description/DescriptionEditor.tsx` (default export, lazy-loaded), `src/pages/projects/description/DescriptionToolbar.tsx`
- Modify: `src/pages/projects/TaskSheet.tsx` (textarea out; `lazy(() => import('./description/DescriptionEditor'))` inside `Suspense` with a `h-32 animate-pulse rounded-lg bg-surface-muted` box)
- Test: `src/pages/projects/description/DescriptionEditor.browser.test.tsx`, `src/pages/projects/TaskSheet.test.tsx`

**Interfaces:**
- Consumes: Task 9 (all exports), Task 8 (TaskSheet queue and attachments state), chat's `markdown.ts` transformers, `lib/webAddress.ts`.
- Produces:
  ```ts
  export type DescriptionEditorHandle = { insertFile(file: Attachment): void; removeFile(id: string): void }
  type Props = { initial: DescBody; files: Attachment[]; readOnly: boolean; label: string
    onChange(body: DescBody): void; onFiles(files: File[]): void; onSubmit(): void }
  const DescriptionEditor: ForwardRefExoticComponent<Props & RefAttributes<DescriptionEditorHandle>>
  ```

- [ ] **Step 1: Write the failing browser tests** (`focusEditor` from `composer/focusEditor.testkit.ts`, `userEvent.keyboard`):
  - typing "hi", selecting it and pressing Mod+B → `onChange`'s last body is a bold `hi`; typing `- a` makes a `ul`.
  - Mod+Enter calls `onSubmit`; Enter adds a paragraph.
  - pasting `text/html` `<b>x</b>` inserts plain `x` (no mark); pasting a PNG file calls `onFiles([file])` and inserts no text.
  - `ref.insertFile(pdf)` shows a chip with the PDF's title and the body gets its file block; `ref.removeFile(pdf.id)` takes it out.
  - the Link button with a selection opens "Web address"; `javascript:x` shows "Use a web address that starts with http:// or https://"; `https://a.b` makes a link.
  - every toolbar button has a name and `aria-pressed`; `readOnly` makes the editor `contenteditable="false"` with no toolbar.
  - TaskSheet (jsdom, editor module mocked): removing an attachment calls `removeFile`; an upload with tag `'editor'` calls `insertFile` when done.
- [ ] **Step 2: Run** `npx vitest run --project browser src/pages/projects/description/DescriptionEditor.browser.test.tsx < /dev/null` and `npx vitest run src/pages/projects/TaskSheet.test.tsx < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement.** Plugins: RichText, History, List, Link (`validateUrl` = `lib/webAddress.ts`), MarkdownShortcut (chat's transformers), OnChange → `$descriptionFromEditor`, a small keys plugin (Mod+Enter submit, Mod+K link row, paste: files → `onFiles`, text → `$insertRawText` of `text/plain`), drop of files → `onFiles`. Toolbar: lucide Bold, Italic, Underline, Strikethrough, Link, List, ListOrdered, Quote, Code, SquareCode, Paperclip (hidden `input type=file multiple accept={acceptedFiles}`), `size-8` buttons, row `overflow-x-auto`. Box classes follow `inputClass`'s border and focus ring with `focus-within:`. TaskSheet keeps `descriptionBody` state, routes the editor's `onFiles` to `queue.add(files, 'editor')`, and on Save sends `descriptionBody` (deep-compared on edits).
- [ ] **Step 4: Run** the Step 2 commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): rich description editor in the task sheet`.

### Task 11: The description in the task panel

**Files:**
- Create: `src/pages/projects/description/DescriptionView.tsx`
- Modify: `src/pages/projects/TicketInspector.tsx` (replaces the plain `<p>`; opens a file in `FileViewer` through `openFile`, Download noted with `noteDownload`)
- Test: `src/pages/projects/description/DescriptionView.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`TaskView.attachments`), Task 9 (`DescriptionFile`).
- Produces: `DescriptionView({ body: DescBody; files: Attachment[]; onOpen(file: Attachment): void })`.

- [ ] **Step 1: Write the failing tests:**
  - renders a paragraph with a line break, bold/italic/underline/strike/code marks as `strong`/`em`/`u`/`s`/`code`, a `ul`, an `ol`, a quote, a code block.
  - a link opens in a new tab with `rel="noopener noreferrer"`; a `javascript:` link renders as text.
  - a PDF file block is a button named after its title that calls `onOpen(file)`; an image file block renders an `img` whose `src` is a blob URL (`useFileUrl` mocked).
  - a file block whose file isn't in `files` reads "This file was removed."; an empty body reads "—".
- [ ] **Step 2: Run** `npx vitest run src/pages/projects/description/DescriptionView.test.tsx < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement** with project tokens: `text-sm text-fg-secondary`, `space-y-2`, paragraphs `whitespace-pre-wrap break-words`, lists `ps-5 list-disc` / `list-decimal`, quote `border-s-2 border-line-strong ps-3 text-fg-muted`, inline code `rounded bg-surface-muted px-1 font-mono text-[13px]`, code block `overflow-x-auto rounded-lg bg-surface-sunken p-3 font-mono text-[13px]`, links `text-accent underline`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): formatted description with files in the task panel`.

### Task 12: The Files tab

**Files:**
- Create: `src/pages/projects/FilesTab.tsx`, `src/pages/projects/filesTab.ts`
- Modify: `src/lib/paths.ts` (`projectTabs` ends with `'files'`), `src/pages/projects/ProjectPage.tsx` (label `Files`, render, the comment's tab count), `src/lib/pageHelp.ts` (`{ path: 'p/:projectKey/files', chapter: 'project-page', sections: ['Files'] }`)
- Test: `src/pages/projects/FilesTab.test.tsx`, `src/pages/projects/filesTab.test.ts`, `src/lib/paths.test.ts`

**Interfaces:**
- Consumes: Task 6 (`useAllProjectFiles`, `ProjectFileRow`, `ProjectFileFilter`).
- Produces (`filesTab.ts`):
  ```ts
  export const FROM_CHIPS: readonly [ProjectFileSource['kind'] | 'all', string][]   // All, Tasks, Comments, Chat, Overview
  export const TYPE_OPTIONS: readonly [FileKind | '', string][]                     // Any type, Images, PDFs, Documents, Snippets, Videos, Other
  export function filterOf(params: URLSearchParams): Omit<ProjectFileFilter, 'cursor'>   // ?from= & ?type=, unknown values ignored
  export function sourceLabel(source: ProjectFileSource): string                    // 'NEX-108 · Attachment' | 'NEX-105 · Comment' | 'NEX-105 · Bug' | 'Chat' | 'Overview'
  export function typeLabel(file: Attachment): string                               // 'PDF' (extension, upper case), '—' without one
  ```

- [ ] **Step 1: Write the failing tests:**
  - filesTab: each `sourceLabel`; `filterOf('?from=chat&type=pdf')` and that unknown values are ignored; `typeLabel`.
  - paths: `paths.project('eng', 'NEX', 'files')` is `/w/eng/p/NEX/files`; `validSavedPlace('/w/eng/p/NEX/files', …)` is true.
  - FilesTab (hooks mocked): the chip and the type select write `?from=` / `?type=` (All and Any type remove them); a desktop table row per file with Name, Type, Size, Uploaded by, Uploaded, From; the From link of a task row opens the task panel (`withInspector`), of a chat row `paths.project(ws, key, 'chat')?message=<messageId>`, of Overview the Overview tab; a row click opens `FileViewer` and its Download calls `noteDownload`; a `pending` row reads "Being checked" and doesn't open; Load more fetches the next page; the empty and filtered-empty sentences, Clear filters; a failed list shows `QueryError` ("Files couldn't be loaded.", Try again); a file that fails to open reads "{title} couldn't be opened. Try again.".
- [ ] **Step 2: Run** `npx vitest run src/pages/projects/FilesTab.test.tsx src/pages/projects/filesTab.test.ts src/lib/paths.test.ts src/lib/pageHelp.test.ts < /dev/null` — Expected: FAIL.
- [ ] **Step 3: Implement** following `HistoryTab` (chips) and `TimeTab` (`DataTable` in `max-sm:hidden`, phone `ul` in `sm:hidden`): phone rows read "PDF · 1.2 MB · {name} · {date}" and "From {sourceLabel}". First load: pulse rows; refetch keeps rows.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): Files tab with every file of the project`.

### Task 13: Docs, help and the full check

**Files:**
- Modify: `src/help/project-page.md` (`## Files` section; the tabs list), `src/help/tasks.md` (task panel: description and Attachments; New task: files and formatting), `CLAUDE.md` (a **Task files** rule: description body, upload-first, `fileInUse`, `inProject`), `docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md` §4.2 and §4.4 (amendment "Task files and the Files tab (7 Nov 2026)" with spec §9's routes and §4.2's sentences), `docs/flow-chat/api-contract.md` Phase 2 · Slice 6 (`upload-url` takes `projectId`; `details.taskKeys` counts task files), `docs/demo-script.md` (a step: attach a file to a new task, see it on the Files tab)
- Test: `src/lib/pageHelp.test.ts`, `src/lib/helpMarkdown.test.ts` (help parses)

- [ ] **Step 1: Write the docs** above.
- [ ] **Step 2: Run the gates:** `npx tsc -b`, `npm run lint`, `npx vitest run --project unit < /dev/null`, `npx vitest run --project browser < /dev/null`, `npm run build:prototype` — Expected: all pass (no errors, 0 failed tests).
- [ ] **Step 3: Check the app** on `npm run dev` with Playwright: as Nour (PM) create a task with a picture dropped into the description and a PDF in Attachments; open it in the panel; open the Files tab with each chip; light and dark; 390px; no console errors. Rerun `npm run help:shots` if a pictured page changed.
- [ ] **Step 4: Commit** `docs: task files, rich description and the Files tab in help, CLAUDE.md and the API notes`.
