# Sprints: create, plan, start, complete

Date: 11 Nov 2026 · Status: approved in chat (Q1–Q7 "Yes, recommended"), spec for review · Branch: `feat/sprints` from
dev ca6a439.

## 1. Goal

Agile projects run real sprints, the Jira loop: a manager creates a sprint, plans it by moving tasks in from the
backlog, starts it with dates and a goal, the team works it on the board, and the manager completes it, moving what
isn't done. Waterfall projects don't change (main spec §2: sprints are optional, `methodology: 'agile'` only).

Today sprints are read-only seed data (`api.tickets.sprints`): the Tasks tab filters by one and the task sheet picks
one, but nobody can create, start or complete a sprint.

## 2. Decisions (Q1–Q7, all "Yes, recommended")

| # | Question | Decision |
|---|---|---|
| Q1 | Where planning lives | A **Sprints** view in the Tasks tab, next to Board and List, on agile projects only (`?view=sprints`). |
| Q2 | Who manages sprints | An Admin or the project's manager: the `task.manage` rule (`projects.runAll`, or manages the project). Everyone on the project sees the view; members can't change it. |
| Q3 | Active sprints | One at a time per project. |
| Q4 | The Board on an agile project | Opens on the active sprint when the address and the remembered pick name none. Picking "All sprints" is remembered too. |
| Q5 | Completing | Done tasks stay with the closed sprint. Unfinished ones move to the next planned sprint (the default), a new sprint, or the backlog. |
| Q6 | Project chat | "Started" and "completed" cards in the project's channel. |
| Q7 | Left out | Burndown and velocity charts, a sprint report page, parallel sprints, capacity limits, reordering inside a sprint, starting or completing by date on its own. |

## 3. Flow

```
Create sprint (planned; next name, 2 weeks after the last one)
  → Plan (drag tasks from Backlog, or "Move to")
  → Start sprint (name, dates, goal; one active; at least one task)
  → Active sprint (the Board opens on it; "4 days left")
  → Complete sprint (done stay; unfinished → next sprint | a new sprint | Backlog)
  → Closed (read-only; still in the sprint filter)
```

Admin or the project's manager does every step; the whole team sees each state.

## 4. Data

No DB version change. `Sprint` keeps its shape:

```ts
type Sprint = { id; projectId; name; goal; startDate; endDate; state: 'planned' | 'active' | 'closed' }
```

- Dates are ISO strings like the seed's. The sheets pick days; `startDate` is the local start of the first day and
  `endDate` the local end of the last day, so a two-week sprint is 14 days inclusive.
- A planned sprint has proposed dates. Start opens on today and keeps the planned length (§6.2); both dates stay
  editable.
- A closed sprint keeps its dates. When it was completed is in the project's history (§5).
- A task keeps one `sprintId` (null = backlog). Moving it writes a normal task change, so its history reads
  "Sprint: Sprint 14 → Sprint 15".
- `ChatMessage` gains an optional `sprintEvent` (like `taskEvent`; no migration, old messages lack it):

```ts
type SprintEvent =
  | { kind: 'started'; projectKey: string; sprintId: string; name: string; goal: string; endDate: string; tasks: number; points: number }
  | { kind: 'completed'; projectKey: string; sprintId: string; name: string; done: number; total: number; movedTo: string | null; moved: number }
```

The card keeps the names and numbers as they were (renaming a sprint later doesn't change old cards). `movedTo` is the
sprint's name, "a new sprint"'s name once made, or null for the backlog.

## 5. API

`api.tickets.sprints` moves to a `sprints` group, beside `phases`; `useSprints` keeps its query key
(`['tickets', 'sprints', projectId]`).

| Call | Route (for the .NET team) | Does |
|---|---|---|
| `sprints.list(projectId)` | `GET /api/projects/:id/sprints` | As today: the project's sprints, active first, then planned by start date, then closed newest first. |
| `sprints.create({ projectId, name?, goal?, startDate?, endDate? })` | `POST /api/projects/:id/sprints` | A planned sprint. Defaults: the next name, an empty goal, and two weeks starting the day after the project's latest sprint ends (today if that's past or there's none). |
| `sprints.update(id, { name?, goal?, startDate?, endDate? })` | `PATCH /api/sprints/:id` | A planned or active sprint. |
| `sprints.start(id, { name, goal, startDate, endDate })` | `POST /api/sprints/:id/start` | Planned → active, with what the dialog confirmed. |
| `sprints.complete(id, { moveTo })` | `POST /api/sprints/:id/complete` | Active → closed. `moveTo` is a planned sprint's id, `'new'` (a sprint is created with the defaults) or `null` (backlog). Returns `{ sprint, moved, next: Sprint \| null }`. |
| `sprints.remove(id)` | `DELETE /api/sprints/:id` | A planned sprint only; its tasks go to the backlog. |

**Next name:** the highest trailing number among the project's sprint names, plus one ("Sprint 16"); "Sprint 1" when
none has a number.

**Done** means the task's column is a Done-type column (`categoryOf(project, status) === 'done'`), as everywhere else.

**Rules and refusals** (each write is one `db.update`; refusals are sentences shown near the cause):

| Check | Status | Sentence |
|---|---|---|
| Not Admin or the project's manager | 403 | Only an Admin or the project’s manager can change sprints. |
| Waterfall project | 400 | Sprints are for agile projects. |
| Archived project | 403 | The same sentence: `task.manage` is frozen on an archived project (`FROZEN`), as every project write. |
| Name empty / over 60 | 400 | Give the sprint a name. / Keep the name under 60 characters. |
| Goal over 500 | 400 | Keep the goal under 500 characters. |
| End not after start | 400 | The end date must be after the start date. |
| Change a closed sprint | 400 | A closed sprint can’t be changed. |
| Start while one is active | 409 | Sprint 14 is still running. Complete it before you start another. |
| Start an empty sprint | 400 | Add a task to Sprint 15 before you start it. |
| Start a sprint that isn't planned | 400 | Only a planned sprint can be started. |
| Complete a sprint that isn't active | 400 | Only the running sprint can be completed. |
| `moveTo` isn't a planned sprint of the project | 400 | Move the tasks to a planned sprint of this project. |
| Delete a sprint that isn't planned | 400 | Only a planned sprint can be deleted. |
| A task moved into a closed sprint (task sheet, stale tab) | 400 | That sprint is closed. Pick a planned or running one. |

Archived tasks don't count: not toward "empty" on start, the totals, or "not done", and Complete leaves them where
they are.

**Each write also:**

- **History** (`ActivityKind`): `sprint.added`, `sprint.changed`, `sprint.started`, `sprint.completed`,
  `sprint.removed`, with `subject` = the sprint's name and `count` = tasks moved (complete, remove). The moved tasks'
  own `task.changed` entries come from the normal task write.
- **Audit:** `recordOf.sprint(sprint, project)` ("Sprint 15 · Nexus Core"), `RECORD_TYPES.sprint = 'Sprints'`.
  Create, update and remove are `created` / `changed` / `deleted` in group `data`; start and complete are `changed` in
  group `status` with a detail ("Started · ends 25 Nov", "Completed · 18 of 23 tasks done · 5 moved to Sprint 15"),
  so the Audit log needs no new action names. The five calls are listed as recorded in `src/mocks/audit.test.ts`.
- **Live:** publishes `projectChanged` (the bridge already invalidates on it) and `ticketUpdated` for each moved task.
- **Chat:** start and complete post a `sprintEvent` card in the project channel (`postSprintEvent` beside
  `postTaskEvents` in `src/mocks/taskEvents.ts`). The card mentions nobody and can't be edited or deleted (the same
  guard as task cards in `src/mocks/chat.ts`). Its text, for search and excerpts: "Started Sprint 15: <goal>" and
  "Completed Sprint 14: 18 of 23 tasks done". Moving a task's sprint posts no task card (`taskEventOf` ignores
  `sprintId`, as today).

## 6. Screens

### 6.1 The Sprints view (Tasks tab, agile only)

- The Tasks tab's switch becomes Board · List · Sprints on agile projects (`viewOf` accepts `'sprints'` only there;
  elsewhere it falls back to the board). The sprint select is hidden and the address's `sprint` is ignored in this
  view (it stays for when the person goes back to Board or List); search, assignee, priority, type and phase still
  narrow the rows.
- **Sections, top to bottom:** the active sprint, each planned sprint (by start date), then **Backlog**: unfinished
  tasks in no open sprint (none, or a closed one: a task reopened, unticked or restored after its sprint closed is to
  plan again). Done tasks with no sprint aren't listed. Closed sprints aren't shown here; the sprint filter still opens
  them.
- **Section header:** name, an Active or Planned badge, dates ("3 Nov – 17 Nov"), "4 days left" on the active sprint
  ("Ended 2 days ago" past its end), the goal, and totals from the sprint's own tasks, whatever the filters:
  "12 tasks · 31 points" (active adds "· 18 points done"). Backlog says "Tasks in no sprint" and its count.
- **Header actions** (managers): Start sprint on a planned sprint while none is active; Complete sprint on the active
  one; a ⋯ `MenuPanel` with Edit sprint and, on a planned sprint, Delete sprint. "Create sprint" sits under the last
  planned sprint. These are secondary buttons: the tab's New task stays the one primary.
- **Rows:** `TicketRow`, in board order (column, then rank). Managers get a drag handle and a row menu "Move to →
  Sprint 15 / Sprint 16 / Backlog" (active and planned sprints, not the row's own). Drag uses the board's sensors
  (`lib/dragSensors.ts`, `SPACE_DRAG_KEYS`: Space picks up, Enter opens). A drop on another section changes the task's
  `sprintId` only; there's no reordering inside a section. On phones the row menu is the way to move.
- **Empty:** no sprints yet → `EmptyState` "No sprints yet." with Create sprint for managers. An empty planned sprint
  shows a dashed drop box "Drag tasks here, or use a task’s Move to."
- Members see the same sections, without handles, menus or actions.

### 6.2 Sheets (all `Sheet`; join `src/layers.browser.test.tsx`)

- **Create or edit sprint:** Name, Start, End, Goal. Save creates or saves; edit keeps the state.
- **Start sprint:** the same fields, plus "12 tasks · 31 points". Name and goal are filled from the planned sprint;
  Start is today and End is today plus the planned sprint's length (its local days from planned start to planned end,
  both counted: a sprint planned for 20 Nov – 4 Dec is 15 days, so started on 12 Nov it runs 12 Nov – 26 Nov). Both
  dates stay editable. Start sprint is its primary button. Errors sit under their field (`useFormCheck`); server
  refusals (one running, empty) are the form's own.
- **Complete sprint:** "18 tasks done · 5 not done". When some aren't done: "Move the 5 unfinished tasks to" with a
  select: the next planned sprint first (default), the other planned sprints, "A new sprint", "Backlog". Complete
  sprint is its primary button. With nothing unfinished the select isn't shown.
- **Delete sprint:** a `danger` confirm: "Delete Sprint 16? Its 3 tasks go to the backlog."

After each save the sheet closes and every query is invalidated (no toasts); `announce()` says "Sprint 15 started."
or "Sprint 14 completed."

### 6.3 The Board and List (Q4)

On an agile project, when the address has no `sprint` and none is remembered for the project (or the one remembered no
longer exists), the sprint filter is the active sprint, worked out each time and never written into the address or
remembered, so the Board follows the running sprint. A person's own pick of another sprint is written and remembered;
picking the running sprint is choosing the default, so it leaves the address and nothing is remembered, and the Board
keeps following the running sprint (Ruling 11). Choosing "All sprints" is remembered as a choice (stored as `''`), so
the tab doesn't jump back. With no active sprint nothing changes.

A new task made from the project page starts in the sprint the Board and List show when it's running or planned (still
a choice in the sheet), so it stays on the Board it was made on. Open in project opens the Board on the task's sprint,
or with `sprint=` (All sprints for that visit, not remembered) for a task in none.

### 6.4 Chat card

`SprintEventCard` (beside `TaskEventCard`): an icon, "Sprint 15 started · ends Tue 25 Nov", the goal, "12 tasks · 31
points", and a link to the Sprints view. Completed: "Sprint 14 completed · 18 of 23 tasks done" and "5 moved to Sprint
15" (or "to the backlog"). It reads its numbers from the card, never the live sprint.

### 6.5 Help

`src/help/tasks.md` gets a Sprints section (create, plan, start, complete, who can). No new page, so `pageHelp` doesn't
change.

## 7. Testing

- **Mock (`src/mocks/sprints.test.ts`):** every rule and refusal in §5; next name and default dates; complete moves
  only unfinished tasks to each target; history, audit and chat card per write; `projectChanged` and `ticketUpdated`
  published.
- **Pages:** the view's sections, totals and empty states; the sheets' fields and errors; the Complete sheet's default
  target; members see no actions; the Board opens on the active sprint and keeps "All sprints".
- **Browser:** drag a backlog task into a sprint with the pointer and with the keyboard; "Move to" on a phone;
  `src/journeys.browser.test.tsx` gets a manager plans, starts and completes a sprint.
- **UX matrix:** `/w/engineering/p/NEX/tasks?view=sprints` joins `UX_PAGES`; `npm run test:ux` before landing.
- **Copy:** curly apostrophes (`src/copy.test.ts`).

## 8. Out of scope (Q7)

Burndown and velocity charts; a sprint report page; more than one active sprint; capacity or point limits; reordering
inside a sprint or the backlog; starting or completing by date on its own; sprint notifications beyond the chat card;
sprints on waterfall projects.
