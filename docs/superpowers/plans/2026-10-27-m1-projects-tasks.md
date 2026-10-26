# M1 Projects & Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make projects and tasks real and writable: a Projects list with New project; a project page with
phases, deliverables, team, files, tasks, chat and time tabs; tasks with phase, due date and/or estimate, and an
overdue flag; Board and List views grouped by phase, with a sprint filter on agile projects; My tasks — all
enforced by the M0 permission table.

**Architecture:**
- Pure derive functions compute what the server will: logged hours, overdue, progress, expected finish and cost.
- Mock `Api` gains project, phase, deliverable, task, team and file writes. Each write is one `db.update`, checks
  `can()` (403), and publishes its realtime event.
- Pages use hooks only. Forms are `Sheet`s. Every write invalidates all queries, as today.

**Tech Stack:** unchanged (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md` — §3 (derived values), §4.2–4.3,
§5 (Projects, Project, My tasks, Task inspector, routes), §6 (second flow), §8 (M1).

All paths relative to `spark-flow-web/`. Branch `feat/company-system` (M0 head `a0839c8`).

## Global Constraints

- Everything in the M0 plan's Global Constraints still binds:
  - `CLAUDE.md` rules
  - logical direction classes
  - `@/` imports, erasable TS
  - components never import `@/mocks`
  - gates `npm test && npm run build:prototype && npm run lint`
  - mock latency 150–300 ms
  - 403 copy `"You don't have access to <thing>."`
  - every `src`/`href` for files through `safeFileUrl`
- **Derived values** (spec §3), computed by the API and never stored:
  - `loggedHours`: closed entries + the running one.
  - `overdue`: (`dueAt` < now and status ≠ done) or (`estimateHours` and `loggedHours` > `estimateHours`).
  - `progress`: done ÷ all tasks.
  - `expectedFinish`: the latest open phase `dueDate`. If any open task is overdue, it is max(that, today + remaining
    estimate hours ÷ 8 h/day).
  - `cost`: Σ(hours × rate). Returned only to Admins; `null` otherwise.
- **Copy** (sentence case, verb-first):
  - Buttons: "New project", "Save project", "Saving…", "New task", "Save task", "Add deliverable", "Add phase",
    "Upload file", "Uploading…".
  - Empty states: "No tasks in this phase yet.", "No files yet.", "No deliverables yet."
- **Status labels** stay Backlog / To do / In progress / In review / Done.
  - Overdue badge: red tone, text "Overdue".
  - Phase status: Not started / In progress / Done.
- **Routes** (spec §5 route changes):
  - `/w/:ws/projects`, `/w/:ws/tasks`
  - `/w/:ws/p/:key/:tab`, with tab ∈ `overview | tasks | chat | time`
  - Tasks tab uses `?view=board|list` (default board) and `?phase=<phaseId>`, `?sprint=<sprintId>`
  - Old `/p/:key/board|backlog` → `/p/:key/tasks?view=board|list`; `/p/:key` → `/p/:key/overview`
  - `?ticket=KEY` keeps opening the inspector anywhere
- **File upload:** max 25 MB, types from `lib/fileTypes.ts` (`isAcceptedFile`). Bytes go to `db.putFile`; metadata to
  `attachments` + `projectFiles`.

## Review Focus

1. **A Member opens New project / Edit / task fields by URL or a stale button** → the mock returns 403 and the form
   shows "You don't have access to this project." beside the Save button. Nothing is written. Test: Task 3
   `projects.test.ts › member cannot create or edit`, plus a browser check in Task 8.
2. **Overdue with no due date and no estimate, or a done task past due** → not overdue. Test: Task 2
   `derive.test.ts › overdue edge cases`.
3. **A phase deleted or a task moved while the inspector shows it** → the inspector refetches and shows the new
   phase, or "This task doesn't exist or was removed." Test: Task 3 `tasks.test.ts › deleting a phase moves its tasks
   to no phase`, plus a browser check.
4. **Uploading a 0-byte, oversize or disallowed file** → rejected with a sentence under the drop zone; nothing is
   stored. Test: Task 3 `files.test.ts › upload rejects empty, oversize and disallowed types`.
5. **Old bookmarks** `/p/NEX/board`, `/p/NEX/backlog`, `/p/NEX` → land on the matching Tasks view or Overview, never a
   404. Test: Task 4 `paths.test.ts › legacy project paths map to the new tabs`, plus `validSavedPlace` accepting the
   new tabs.

---

### Task 1: Permission context fixes (M0 deferred minors)

**Files:** Modify `src/lib/permissions.ts`, `src/lib/permissions.test.ts`, `src/navigation.ts` (Settings by `can`), `src/layout/useSidebarGroups.ts`/`Sidebar.tsx` if they read `roles`.

**Interfaces — Produces:**
```ts
type ProjectScoped = 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'
export function can(action: Exclude<Action, ProjectScoped>, ctx: PermissionContext): boolean
export function can(action: ProjectScoped, ctx: PermissionContext & { project: ProjectRef }): boolean // project required
```
- `dashboard.view` is true for any user who manages at least one project. The context gains
  `managesAny?: boolean`. Without it, a role of `pm` stands in.
- `navigation.ts`: `settingsItem` drops `roles` and uses `visible: (can) => can('database.manage')`, or an equivalent
  rule.

- [ ] **Step 1: Tests:**
  - `project-scoped actions require a project` is a type-level test: `// @ts-expect-error can('task.manage', as('pm'))`.
  - `a member who manages a project can view the dashboard` (`managesAny: true`).
- [ ] **Step 2:** RED. **Step 3:** implement and fix call sites. **Step 4:** gates. **Step 5:** commit `fix: project-scoped permission context`.

---

### Task 2: Derived rules (pure)

**Files:** Create `src/mocks/derive.ts`, test `src/mocks/derive.test.ts`; Modify `src/api/types.ts`.

**Interfaces — Produces (types.ts):**
```ts
export type TaskView = Task & { loggedHours: number; overdue: boolean }
export type ProjectSummary = Project & {
  progress: number            // 0..1
  loggedHours: number
  cost: number | null         // admin only
  expectedFinish: string      // ISO date
  currentPhaseId: string | null // first phase not done, by order
  overdueCount: number
  taskCount: number
}
```
**derive.ts:**
- `entryHours(e, now): number`
- `loggedHours(taskId, entries, now)`
- `isOverdue(task, logged, now)`
- `summarize(project, data, now, viewer: { role; userId }): ProjectSummary`
- `taskView(task, data, now): TaskView`

- [ ] **Step 1: `derive.test.ts`:**
  - **Running entry** counts up to `now`.
  - **`overdue edge cases`:**
    - no due date and no estimate → false
    - done and past due → false
    - past due, open → true
    - over estimate → true
    - estimate 0 with 0 h → false
  - **Progress:**
    - 0 tasks → 0
    - 3 of 4 done → 0.75
  - **expectedFinish:**
    - no overdue → the last open phase due date
    - overdue → `now` + (remaining estimate ÷ 8) days when later
    - all phases done → the project `dueDate`
  - **cost:**
    - admin → Σ hours × rate
    - sales → null
    - a missing rate counts 0
  - **currentPhaseId:** the first not-done phase by `order`, else null.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(mocks): derived project and task values`.

---

### Task 3: Mock + HTTP API — projects, phases, deliverables, tasks, teams, files

**Files:**
- Modify `src/api/types.ts` (`Api`), `src/mocks/tickets.ts` (reads return `TaskView` / `ProjectSummary`), `src/lib/http.ts` (routes).
- Create `src/mocks/projects.ts`, `src/mocks/teams.ts`.
- Extend `src/mocks/files.ts`, `src/mocks/index.ts`.
- Tests: `src/mocks/projects.test.ts`, `src/mocks/tasks.test.ts`, `src/mocks/files.test.ts`; extend `src/lib/http.test.ts`.

**Interfaces — Produces (`Api` additions):**
```ts
projects: {
  list(workspaceId): Promise<ProjectSummary[]>; get(workspaceId, key): Promise<ProjectSummary>
  create(input: NewProject): Promise<Project>; update(id, patch: ProjectPatch): Promise<Project>
}
phases: { list(projectId): Promise<Phase[]>; create(input: NewPhase): Promise<Phase>; update(id, patch: PhasePatch): Promise<Phase>; remove(id): Promise<void>; reorder(projectId, ids: string[]): Promise<Phase[]> }
deliverables: { list(projectId): Promise<Deliverable[]>; create(input: NewDeliverable): Promise<Deliverable>; update(id, patch: DeliverablePatch): Promise<Deliverable> }
tasks: { create(input: NewTicket): Promise<TaskView>; update(key, patch: TicketPatch): Promise<TaskView> }
teams: { list(workspaceId): Promise<Team[]> }
files: { url(id); upload(projectId: string, file: File): Promise<ProjectFile & { attachment: Attachment }>; list(projectId): Promise<(ProjectFile & { attachment: Attachment })[]> }
```
- `tickets.list` / `tickets.get` return `TaskView`.
- `tickets.projects` stays, as an alias of `projects.list`, for Phase 1+2 callers.
- **Types:**
  - `NewProject` = name, key (2–5 A–Z, unique in the workspace), clientName, description, links, managerId,
    memberIds, teamIds, methodology, startDate, dueDate.
  - Create also makes the project's channel `c-p-<key>`, with members = manager + members + team members.
    Waterfall projects get default phases Analysis → Design → Build → QA → Delivery spread evenly from start to due.
  - Patches are `Partial` of the editable fields.
- **Rules:**
  - `projects.create`: `project.create`.
  - `projects.update` and `deliverables.*`: `project.edit` on that project.
  - `phases.*` and `tasks.create`: `phase.manage` / `task.manage`.
  - `tasks.update`: `task.manage`. With only `task.updateOwnStatus`, the patch may contain nothing but `status`.
  - Upload: `collab.post` on the project.
  - Every write publishes on the hub: `ticketUpdated` for tasks; projects, phases and deliverables have no event yet
    (the global invalidate covers the writer's tab).
- **Validation (400 with a sentence):**
  - Key taken: "Key NEX is already used."
  - Bad key format.
  - dueDate before startDate: "The due date is before the start date."
  - Phase name empty.
  - Upload: 0 bytes, over 25 MB, or a type not in `fileTypes`: "That file is empty." / "Files can be up to 25 MB." /
    "That type of file can't be added."
- `phases.remove` sets `phaseId = null` on its tasks. Deleting a phase with tasks is allowed.
- HTTP mapping:
  - `GET/POST /api/workspaces/{id}/projects`, `GET /api/workspaces/{id}/projects/{key}`, `PATCH /api/projects/{id}`
  - `GET/POST /api/projects/{id}/phases`, `PATCH/DELETE /api/phases/{id}`, `PUT /api/projects/{id}/phases/order`
  - `GET/POST /api/projects/{id}/deliverables`, `PATCH /api/deliverables/{id}`
  - `POST /api/projects/{id}/tasks`, `PATCH /api/tasks/{key}`
  - `GET /api/workspaces/{id}/teams`
  - `GET/POST /api/projects/{id}/files` (multipart)

- [ ] **Step 1: Tests (mock):**
  - **`projects.test.ts`:**
    - sales creates a waterfall project → 5 phases, a channel, key `ABC`, counter 101
    - duplicate key → 400
    - `member cannot create or edit` → 403, nothing written
    - PM edits own project, not another → 403
    - `get` returns the summary for `NEX` and is 404 for `ZZZ`
    - cost is null for non-admins
  - **`tasks.test.ts`:**
    - PM creates a task with phase, due date and estimate → `TaskView`; key = next number
    - member updates only `status` of own task; other fields → 403; someone else's task → 403
    - `deleting a phase moves its tasks to no phase`
    - an overdue flag appears after a due date passes (fake `now` via injected clock)
    - reorder phases
  - **`files.test.ts`:**
    - upload stores bytes and metadata; list returns it; `url` gives a `blob:` URL
    - `upload rejects empty, oversize and disallowed types`
  - **`http.test.ts`:** every new route and method.
- [ ] **Step 2:** RED. **Step 3:** implement (keep each mock file one domain; share `requireCan(data, action, project?)` in `shared.ts`). **Step 4:** gates.
- [ ] **Step 5:** commit `feat: project, phase, deliverable, task and file APIs`.

---

### Task 4: Hooks, routes and the Projects list

**Files:**
- Create `src/api/projects.ts` (hooks), `src/pages/projects/ProjectsPage.tsx`, `src/pages/projects/ProjectSheet.tsx`
  (New/Edit project form).
- Modify:
  - `src/api/tickets.ts` (TaskView types; `useCreateTask`, `useUpdateTask`)
  - `src/router.tsx`, `src/lib/paths.ts` (+ tests)
  - `src/navigation.ts` / `src/layout/useSidebarGroups.ts` / `Sidebar.tsx`: a new **WORK** group with Projects and
    My tasks above the existing groups
  - `src/layout/MobileNav.tsx`: the Projects tab goes to `/projects`

**Interfaces — Produces:**
- **Hooks:** `useProjectSummaries(wsId)`, `useProjectSummary(wsId, key)`, `useCreateProject()`,
  `useUpdateProject()`, `usePhases(projectId)`, `useCreatePhase/useUpdatePhase/useRemovePhase/useReorderPhases`,
  `useDeliverables(projectId)`, `useCreateDeliverable/useUpdateDeliverable`, `useTeams(wsId)`,
  `useProjectFiles(projectId)`, `useUploadFile()`.
- **paths:**
  - `projects(ws)`, `tasks(ws)`
  - `project(ws, key, tab: ProjectTab = 'overview', query?: { view?: 'board' | 'list'; phase?: string; sprint?: string })`
  - `legacyProjectPath(path): string | null` maps `/p/KEY/board|backlog` and `/p/KEY`.
  - `validSavedPlace` accepts the new tabs and `/projects` and `/tasks`.
- **ProjectsPage** (copy `03-leads-list`):
  - PageHeader "Projects" / "Every project in <workspace>."
  - Primary "New project", when `project.create`.
  - Stat cards: Active, Overdue (projects with `overdueCount` > 0 or `dueDate` past and not delivered), Due this
    month, Delivered.
  - DataTable columns: Project (logo initials + name + key), Client, Manager, Phase (current phase name), Due
    (`formatDate`, red if past and not delivered), Progress (`ProgressBar` + %), Hours (`tabular-nums`), Cost
    (Admin only, `formatMoney`), Overdue (count pill).
  - Row → `/p/KEY/overview`.
- **ProjectSheet:** a `Sheet` drawer with:
  - Name, Key (auto from the name: first letters, editable on create only)
  - Client, About
  - Links (label + url rows; url must pass `safeFileUrl` and start with `https:`)
  - Manager (select from people), Members (checkbox list), Teams
  - Methodology (segmented Waterfall | Agile; create only)
  - Start date, Due date
  - Save shows errors beside fields or under Save; on success it closes and navigates to the new project.

- [ ] **Step 1: Tests:**
  - **`paths.test.ts`:**
    - `legacy project paths map to the new tabs`
    - `project()` builds query strings
    - `validSavedPlace` accepts `/p/NEX/tasks` and `/projects`, and rejects `/p/NEX/nope`
  - **`projectForm.test.ts`** (pure helpers in `src/pages/projects/projectForm.ts`):
    - `keyFromName('Sela booking')` = `'SB'`, `keyFromName('Nexus Core Platform')` = `'NCP'`, clamped to 2–5 A–Z
    - `validateProject(values)` returns field errors with the spec sentences
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** gates. **Step 5:** commit `feat: Projects list and New project`.

---

### Task 5: Project page — header, phases, Overview

**Files:** Rewrite `src/pages/projects/ProjectPage.tsx` (shell + tabs); Create `src/pages/projects/OverviewTab.tsx`, `PhasesSheet.tsx`, `DeliverableSheet.tsx`, `ProjectFiles.tsx`; Modify `src/router.tsx`.

- **Header:** `RecordHeader`, copying `05-lead-detail`:
  - Avatar: logo initials. Title: name. Badges: status and methodology.
  - Meta: client, manager, dates, links (`https:` only, `rel="noopener noreferrer"`).
  - Primary "New task" (`task.manage`). Secondary "Edit project" (`project.edit`). More: "Manage phases"
    (`phase.manage`).
- **Phases:** `StageProgress` with one stage per phase, `current` = `currentPhaseId`, and `state` = done when every
  phase is done. Details panel: dates, status, task count, "Overdue" when the phase is past due and not done.
- **Tabs** (Spark tab style from `design/03-components.md`): Overview · Tasks · Chat · Time, each its own route.
- **Overview tab:**
  - About card.
  - Deliverables card: title, phase, due, done check (`project.edit` toggles); "Add deliverable".
  - Team card: manager first, then members and team chips with avatars.
  - Files card: list + upload drop zone (`collab.post`); click opens `FileViewer` with `files.url`; errors as
    sentences.
  - Stats row: Progress, Hours, Expected finish, Cost (Admin).
- **PhasesSheet:** list with name, start, due and status. Add, rename, delete (confirm), and move up/down (reorder).

- [ ] **Step 1: Tests:** `src/pages/projects/phases.test.ts` (pure):
  - `stagesOf(phases, tasks)` maps to `Stage[]` with meta "Due 3 Oct" / "Done".
  - `moveUp`/`moveDown` reorder ids.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** gates + browser check of Overview for NEX, MOB (overdue) and ELM (delivered).
- [ ] **Step 5:** commit `feat: project page with phases and overview`.

---

### Task 6: Tasks tab, task form, inspector edits, My tasks

**Files:** Create `src/pages/projects/TasksTab.tsx`, `TaskSheet.tsx`, `taskFilters.ts` (+ test), `src/pages/tasks/MyTasksPage.tsx`; Modify `ProjectBoard.tsx`, `ProjectBacklog.tsx` (→ List grouped by phase), `TicketRow.tsx`, `TicketInspector.tsx`, `ticketPills.tsx` (Overdue + Bug pills).

- **Tasks tab:**
  - A Board | List switch (`?view`).
  - Phase filter chips (All + each phase; `?phase`).
  - Sprint select on agile projects only (`?sprint`; "All sprints").
  - Board: status columns as today, cards with Overdue / Bug pills and "4.5 / 6 h".
  - List: grouped by phase in phase order, then "No phase". Rows show key, title, status, priority, assignee,
    due, hours vs estimate and Overdue.
- **TaskSheet** (create/edit):
  - Title, Description, Type (Task | Bug)
  - Phase (select), Status, Priority, Assignee (project people)
  - Due date (optional), Estimate hours (optional, ≥ 0, 0.5 steps)
  - Sprint (agile only)
  - Fields the viewer can't change are read-only, per `can`.
- **Inspector (`TicketInspector`):**
  - An "Edit task" button when `task.manage`.
  - A status select when `task.updateOwnStatus`.
  - Shows phase, due date, estimate, logged hours, Overdue, and type.
- **My tasks** (`/w/:ws/tasks`):
  - Open tasks assigned to me across the workspace's projects: overdue first, then by due date.
  - Same rows as List. Empty state "Nothing assigned to you."

- [ ] **Step 1: `taskFilters.test.ts`:**
  - `filterTasks(tasks, { phase, sprint })`
  - `groupByPhase(tasks, phases)` (order + "No phase" last)
  - `myOpenTasks(tasks, userId)` (overdue first, then due ascending, then key)
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** gates.
- [ ] **Step 5:** commit `feat: tasks tab, task form and My tasks`.

---

### Task 7: Chat and Time tabs

**Files:** Extract `src/pages/chat/ChannelFeed.tsx` from `ChannelPage.tsx` (the feed + load older, no header); Create `src/pages/projects/ChatTab.tsx`, `TimeTab.tsx`; Modify `ChannelPage.tsx` to use `ChannelFeed`.

- **Chat tab:** `ChannelFeed` for `project.channelId`, plus "Open in Chat" → `/c/<channelId>`. Read-only until M3.
- **Time tab:**
  - Entries for the project, newest first: person, task, day, start–end, hours.
  - Totals per person.
  - Cost column and total for Admin only.
  - Empty: "No time logged yet."
  - Read-only until M2.

- [ ] **Step 1: Test:** `src/pages/projects/timeTotals.test.ts`: `totalsByPerson(entries, rates|null, now)`.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** gates. **Step 5:** commit `feat: project chat and time tabs`.

---

### Task 8: Verify M1 + docs

- [ ] **Step 1:** gates.
- [ ] **Step 2: Browser checks** (controller, preview pane; record in `tasks/todo.md`):
  1. **As Admin:** Projects list (5 rows in Engineering, stats, cost column) → NEX Overview (phases, deliverables,
     team, files) → Tasks board and list, the phase filter, the sprint filter (NEX only) → New task → it appears;
     edit it in the inspector.
  2. **As Sales (Karim):** New project "Sela kiosk" (waterfall) → 5 phases and a chat channel exist; no cost column;
     Manage phases is hidden.
  3. **As PM (Ahmed):** edits MOB, reorders phases, deletes an empty phase; can't edit NEX.
  4. **As Member (Tarek):** My tasks shows MOB-104 and MOB-102 with Overdue; changes MOB-104's status; Edit task
     hidden; a typed `/w/engineering/projects` shows no New project.
  5. **Upload:**
     - a PNG and a PDF on MOB → both preview in FileViewer
     - the seeded scope PDF previews (the M0 deferred check)
     - a 0-byte file shows the sentence
  6. Old bookmarks `/p/NEX/board`, `/p/NEX/backlog` and `/p/NEX` redirect correctly.
  7. Light, dark, 390px and RTL on Projects, Project Overview, Tasks list and TaskSheet; no console errors.
  8. Second tab: a task created in tab A appears in tab B's board after refetch.
- [ ] **Step 3:** `CLAUDE.md` gets a line for derived values; `tasks/todo.md` gets the M1 section. Commit.
