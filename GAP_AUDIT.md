# Spark Flow: gap audit

28 Oct 2026, on `feat/company-system` at `20be7e2`. This is a read-only audit; the only file it creates is this one.

**Method.**
- Four parallel read-only auditors covered (1) chat and collaboration, (2) projects and work, (3) time and money, and (4) the shell and cross-cutting layers.
- Their findings were merged and de-duplicated here.
- The High findings were re-checked by hand against the code: GAP-001, 002, 003, 005, 006 and 007, plus the search and typing findings.

**What we know about the product.**
- **What it is:** Spark Systems' internal Jira + Slack replacement for a software company of about 30 people.
- **Roles:** Admin, Sales, PM and Member. Whoever a project names as manager has PM rights on that project.
- **Core flows:**
  - projects, phases and tasks;
  - check-in, time and cost;
  - the manager dashboard;
  - chat, mentions, and task comments and bugs.
- **Out of scope by design** (spec §10):
  - the real .NET/SignalR backend and sign-in;
  - email and push;
  - payroll, invoices, a client portal, Gantt charts and recurring tasks;
  - Arabic UI strings;
  - ZIP export.
- **Already known:** gaps listed in `tasks/jira-slack-gap-checklist.md` §D (P2/P3) are named here only as "known".

---

## 1. Executive summary

Spark Flow is **well built for its scope**. The mock backend wraps every write in one transaction with its permission check, and every `Api` method (54 of them) has an HTTP route. The `can()` table agrees with the UI gates, and every realtime event that is emitted is handled. The demo flows work end to end.

The gaps are about **what users expect to be able to undo, correct or start**, and about **state that is shared when it shouldn't be**.

The five gaps that matter most:

1. **Mistakes can't be fixed.**
   - Nobody can edit or delete a time entry. A forgotten timer books 12 h and its cost for good (GAP-001).
   - Tasks can't be deleted or archived (GAP-002).
   - Comments and bugs can't be edited or deleted (GAP-004).
   - Deliverables can't be removed (GAP-022), and neither can files (GAP-021).
2. **You can't start a direct message.** DMs exist only in the seed (GAP-003).
3. **Who you are and what you've read live in the shared database document.**
   - "View as" in one tab changes the acting user in every tab (GAP-006).
   - The read state of channels belongs to nobody in particular, so one person opening a channel clears its badge for everyone (GAP-005).
4. **Other tabs don't see many changes.** Project, phase, deliverable, board-column, file and rate writes publish no event, and a data reset doesn't reach other tabs either (GAP-012). Spec §1 asks for "consistent across tabs".
5. **A project key used in two workspaces makes tasks collide**, because task lookups go by key alone (GAP-007).

**Systemic patterns** (section 5):
- The demo identity and read state sit in the shared document.
- Live updates depend on each write remembering to publish.
- "Single source" rules are partly bypassed: the nav list and some permission checks.
- The backend-on path has no auth or error contract.

---

## 2. System map (condensed)

**Stack:**
- React 19, TypeScript, Vite 8, Tailwind v4, TanStack Query, React Router, Zustand.
- dnd-kit for drag and drop.
- Vitest, with 375 tests.

**Data layer:**
- Pages import only `@/api/*` (the hooks and `types.ts`).
- `src/lib/api.ts` switches between the mock (`src/mocks/*`, one IndexedDB document, `DB_VERSION = 3`) and `src/lib/http.ts` (the future .NET backend).
- Live updates go `hub.publish` → `RealtimeBridge` → `keysForEvent` → query invalidation.
- Every mutation also invalidates all queries in the tab that made it (`main.tsx:17-22`).

**Entities:**

| Entity | Main fields | Relationships |
|---|---|---|
| Workspace | slug, name | has users, channels, projects |
| User | role, teamIds, title | — |
| Team | memberIds | — |
| Project | key, manager, members, teams, methodology, status, dates, channelId, board? | — |
| Phase | order, dates, status | → project |
| Deliverable | title, phaseId, due, doneAt | → project |
| ProjectFile | — | → attachment |
| Sprint | read-only | — |
| Task (Ticket) | key, status, rank, assignee, phase, sprint, type, due, estimate, linkedMessageId | → project |
| Comment | kind comment\|bug, attachmentIds | → task |
| Channel | kind channel\|dm, isPrivate, memberIds | — |
| ChatMessage | reactions, mentions, linkedTicketKeys, editedAt, deletedAt?, commentId?, taskEvent? | → channel |
| ThreadReply | — | → message |
| Mention read state | per user | — |
| Channel read state | **one shared map** | — |
| CheckIn | day, plan, in/out | — |
| TimeEntry | — | → task or project |
| Rate | — | per user |

**Screens:**
- Home (My day, check-in, mentions)
- Projects list
- Project, with tabs: Overview, Tasks (Board or List), Chat, Time
- My tasks, Teams, Dashboard, Time & cost
- Channel and DM
- Settings: Database and Rates
- Side inspector: task and thread
- Global search, notifications bell, user menu (theme, View as)

**Realtime events:**

| Event | Status |
|---|---|
| messageReceived, replyReceived, messageChanged | emitted and handled |
| ticketUpdated, timeLogged, commentAdded, channelChanged | emitted and handled |
| userTyping | handled, never emitted |

**Permissions:**
- Mock and UI both use `src/lib/permissions.ts`.
- Exceptions: channel editing (inline `role !== 'admin'`, `src/mocks/chat.ts:141`) and `rates.update`, which reuses `rates.view`.

---

## 3. Capability matrix

✅ complete across the layers · ⚠️ partial · ❌ missing · — not applicable or excluded on purpose

The layers are types → mock (with its permission check) → `http.ts` → hook → UI.

| Entity | Create | List | View | Update | Delete | Archive | Reorder / move | Search | Filter / sort | Export | Live in other tabs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Project | ✅ | ✅ | ✅ | ⚠️ mass-assigned patch (GAP-014) | ❌ | ❌ (GAP-023) | — | ⚠️ global search only | ✅ tiles and sort in the URL | — (JSON DB export) | ❌ (GAP-012) |
| Phase | ✅ | ✅ | ✅ | ✅ | ✅ (tasks go to "no phase") | — | ✅ | — | — | — | ❌ |
| Deliverable | ✅ | ✅ | ✅ | ⚠️ the UI only toggles done (GAP-022) | ❌ | — | — | — | — | — | ❌ |
| Project file | ⚠️ one file per drop (GAP-021) | ✅ | ✅ | ❌ rename | ❌ | — | — | — | — | — | ❌ |
| Sprint | ❌ known | ✅ | ✅ | ❌ known | ❌ | — | — | — | ✅ filter | — | — |
| Task | ✅ | ✅ | ✅ | ⚠️ values unchecked, last write wins (GAP-014, 015) | ❌ (GAP-002) | ❌ | ✅ board drag (rank and status) | ❌ (GAP-013) | ⚠️ phase and sprint only; others known | — | ✅ |
| Board column | — (fixed 5, by ruling) | ✅ | — | ✅ rename | — | — | ✅ | — | — | — | ❌ |
| Team | ❌ (cut line) | ✅ | ✅ | ❌ | ❌ | — | — | — | — | — | — |
| Channel | ✅ | ✅ members-only for private | ✅ | ✅ name, topic, members | ❌ | ❌ (GAP-018) | ❌ known | ✅ name | — | — | ✅ |
| DM | ❌ (GAP-003) | ✅ | ✅ | — | ❌ | ❌ | — | ✅ | — | — | ✅ |
| Message | ✅ | ✅ paged 30 | ✅ | ✅ edit | ✅ soft delete | — | — | ❌ known | — | — | ✅ |
| Reply | ✅ | ⚠️ no paging | ✅ | ✅ | ✅ | — | — | ❌ | — | — | ✅ |
| Reaction | ✅ fixed 6 | ✅ | — | ✅ toggle | ✅ | — | — | — | — | — | ✅ |
| Mention / bell | ✅ parse | ⚠️ cap 50, not per workspace (GAP-019) | ⚠️ opens the channel, not the message | ✅ mark read | — | — | — | — | — | — | ✅ |
| Comment / bug | ✅ with files | ✅ | ✅ | ❌ (GAP-004) | ❌ | — | — | — | — | — | ✅ |
| Attachment | ✅ comments; known gap in chat | ✅ | ✅ preview | — | ❌ | — | — | — | — | — | — |
| Check-in day | ✅ | ⚠️ own; managers via dashboard | ✅ | ❌ undo or correct (GAP-009) | ❌ | — | — | — | — | — | ✅ |
| Timer | ✅ | ✅ | ✅ | ⚠️ stop only | — | — | — | — | — | — | ✅ |
| Time entry | ⚠️ manual adds skip the membership and done checks | ⚠️ every project open to all (GAP-011) | ✅ | ❌ (GAP-001) | ❌ | — | — | — | ❌ (GAP-028) | ❌ | ✅ |
| Rate | ✅ | ✅ admin | ✅ | ⚠️ no history (GAP-025) | ❌ clear | — | — | — | — | — | ❌ |
| Report (Time & cost) | — | ✅ 7/30/90 days | ✅ | — | — | — | — | — | ❌ range, person, project | ❌ | ✅ |
| User / account | ❌ | ✅ | ✅ | ❌ (out of scope §10) | ❌ | — | — | ❌ people | — | — | — |

---

## 4. Findings

### High

**GAP-001: A wrong or forgotten time entry can't be corrected or deleted by anyone**
- **Category:** Missing capability · **Severity:** High · **Certainty:** Confirmed
- **Evidence:**
  - `Api.time` has only list, today, checkIn, checkOut, start, stop, addManual and report (`src/api/types.ts:264-277`).
  - There is no PATCH or DELETE in `src/lib/http.ts:110-118`, and no hooks in `src/api/time.ts`.
  - The Home entries (`src/pages/home/CheckInCard.tsx:93-109`) and the project Time tab (`src/pages/projects/TimeTab.tsx:51-121`) are read-only.
  - A forgotten timer is closed at start + 12 h (`src/mocks/time.ts:38-42`, `src/lib/hours.ts:8-11`). That phantom range then blocks the real manual entry through the overlap check (`src/mocks/time.ts:152-155`).
- **User impact:**
  - A timer left on overnight adds 12 h, and 12 h of cost, to the project for good.
  - The person can't even add the real time, because it overlaps.
  - Hours, cost, the overdue flags and the report are all inflated, and only a full data reset clears them.
- **Expected behavior:**
  - You can edit (task, start, end, note) and delete your own entries.
  - Admins can do the same for anyone's, and possibly the project's PM too.
  - Edits are checked again for overlap, the future and the 12 h cap.
- **Fix approach:**
  - `time.update` and `time.remove` across types, mock, http and hooks.
  - The mock allows the owner or an admin (`requireCan`), re-runs the entry rules and publishes `timeLogged`.
  - The UI adds a row ⋯ menu that opens `AddTimeSheet` in edit mode, plus a "Timer ran over 12 h. Fix it" prompt.
- **Effort:** M · **Depends on:** GAP-027

**GAP-002: Tasks can't be deleted or archived**
- **Category:** Missing capability · **Severity:** High · **Certainty:** Confirmed
- **Evidence:** `Api.tasks` has only `create` and `update` (`src/api/types.ts:259-262`). There is no removal in `src/mocks/tickets.ts`, `http.ts` or the inspector.
- **User impact:** A duplicate or mistaken task stays forever. It counts toward progress, task counts, overdue and the board. Marking it Done to hide it inflates progress.
- **Expected behavior:** The manager or an admin archives the task (soft delete, which keeps its time and cost) or deletes it after a confirm.
- **Fix approach:**
  - Add `archivedAt` to the task, or `tasks.remove` (`task.manage`).
  - Decide what happens to its time entries (kept), its comments, the `linkedTicketKeys` of messages, and its event cards.
  - Publish `ticketUpdated`.
  - UI: "Delete task" in the inspector's menu.
- **Effort:** M · **Depends on:** product question Q5 in section 6

**GAP-003: No way to start a direct message**
- **Category:** Missing capability · **Severity:** High · **Certainty:** Confirmed
- **Evidence:**
  - `Api.chat` has no DM method (`src/api/types.ts:211-231`), and `createChannel` always writes `kind: 'channel'` (`src/mocks/chat.ts:127`).
  - The only DMs come from the seed (`src/mocks/seed.ts:316-318`).
  - The sidebar's "Direct messages" group appears only when DMs already exist, and it has no "+".
  - The Teams page and people have no "Message" action.
- **User impact:** In a Slack replacement, people can't open a one-to-one or group conversation, and new staff never get any.
- **Expected behavior:** "New message" lets you pick people. It opens the existing DM for exactly those people, or creates one.
- **Fix approach:**
  - `chat.openDm(workspaceId, userIds)`. The mock finds a DM by its exact member set or creates one, then publishes `channelChanged`.
  - Route `POST /api/workspaces/:id/dms`.
  - A sidebar "+" by Direct messages, and a "Message" button on people.
- **Effort:** M

**GAP-004: Task comments and bugs can't be edited or deleted**
- **Category:** Missing capability / Inconsistency · **Severity:** High · **Certainty:** Confirmed
- **Evidence:**
  - `Api.comments` has only `list` and `create` (`src/api/types.ts:284-287`, `src/mocks/comments.ts:28-75`).
  - `TaskActivity.tsx:39-52` has no menu.
  - A comment's chat card is locked: `checkPlain` (`src/mocks/chat.ts:108-110`) and `src/pages/chat/messageRights.ts:6`.
- **User impact:**
  - A typo, a wrong screenshot or a bug filed on the wrong task stays on the task and in the project chat forever.
  - Chat messages can be fixed but comments can't.
- **Expected behavior:** The author edits (with an "edited" mark) or deletes (leaving a placeholder), as for chat messages, and the chat card follows.
- **Fix approach:**
  - `comments.update` and `comments.remove`.
  - The mock re-parses mentions and updates or soft-deletes the card found by `commentId`, then publishes `messageChanged` and `commentAdded`.
  - A ⋯ menu in TaskActivity.
- **Effort:** M

**GAP-005: A channel's read state is shared by everyone**
- **Category:** Data integrity · **Severity:** High (for the demo, which switches people) · **Certainty:** Confirmed
- **Evidence:**
  - `reads: Record<string, string>` is keyed by channel only, and its comment says "the current user" (`src/mocks/db.ts:48-49`).
  - `withUnread` reads `data.reads[channel.id]` (`src/mocks/chat.ts:29`), and `markRead` writes the same key (`chat.ts:268`).
  - Mention read state *is* per user (`db.ts:51`), so the two disagree.
- **User impact:**
  - Anyone who opens a channel clears its unread badge for every other person.
  - Someone switched to through "View as" sees the read state of whoever was there before.
  - This is also the wrong model to hand the .NET team.
- **Expected behavior:** Read time is kept per (user, channel).
- **Fix approach:**
  - Key it as `reads[userId][channelId]`, and seed it per user.
  - Bump `DB_VERSION` with a migration, which needs GAP-030 first or the bump wipes data.
- **Effort:** S–M · **Depends on:** GAP-030

**GAP-006: "View as" in one tab changes who you are in every other tab**
- **Category:** Data integrity · **Severity:** High (demo) · **Certainty:** Confirmed
- **Evidence:**
  - `viewAs` writes `data.currentUserId` into the shared document (`src/mocks/users.ts:22-29`).
  - Every write reads it: senders at `src/mocks/chat.ts:290,316`, reporters at `src/mocks/tickets.ts:112`, and permissions at `src/mocks/shared.ts:35-63`.
  - Only the tab that switched clears its cache (`src/layout/UserMenu.tsx:36`), and no event is published.
- **User impact:**
  - Tab B still shows "Admin", but its messages, comments and tasks are saved as the member picked in tab A.
  - Admin actions there start failing with 403.
  - This breaks spec §1, "consistent across tabs".
- **Expected behavior:** The acting person belongs to the tab (or the browser), and a switch updates every tab.
- **Fix approach:**
  - Keep the persona outside the shared document: sessionStorage, passed into `createMockApi`.
  - Or publish `personaChanged`, so every tab clears its cache and reloads `me`.
- **Effort:** M · **Depends on:** GAP-005

**GAP-007: A project key reused in another workspace corrupts tasks**
- **Category:** Data integrity · **Severity:** High · **Certainty:** Confirmed
- **Evidence:**
  - Keys are checked for uniqueness per workspace only (`src/mocks/projects.ts:76`).
  - Task ids come from the key alone, `t-${key}` (`src/mocks/tickets.ts:103`).
  - `findTicket` matches by key with no project or workspace (`src/mocks/tickets.ts:18-22`), and `get`, `update` and comments all go through it.
  - The HTTP routes `/api/tasks/{key}` (`src/lib/http.ts:84,107`) carry no workspace either.
- **User impact:** If Design also creates "NEX", its NEX-101 can't be opened ("not found"), and editing it edits Engineering's NEX-101. Time entries, `@NEX-101` mentions and ids collide too.
- **Expected behavior:** Either keys are unique across all workspaces, or every task lookup is scoped by workspace or project.
- **Fix approach:**
  - Quick: enforce global key uniqueness in the mock and the spec.
  - Proper: scope lookups by `(workspaceId, key)` and give tasks `newId` ids.
- **Effort:** S (global key) / M (scoping)

**GAP-008: A backend build has no sign-in, and a failed `me` looks like loading forever**
- **Category:** Missing capability / UX state · **Severity:** High for any backend deploy (sign-in itself is out of scope, §10) · **Certainty:** Confirmed
- **Evidence:**
  - `vite.config.ts:11-16` allows the build.
  - `fetch` sends no credentials or token (`src/lib/http.ts:25`).
  - Nothing handles a 401, and `src/api/retry.ts:4` retries a 401 like a 500.
  - When `me` fails, `useRole` falls back to an empty member with `loading=false` (`src/lib/useRole.ts:7,14`). The avatar then pulses forever and every gated page refuses.
  - Log out and Change password are "Soon" (`src/layout/UserMenu.tsx:145-157`).
- **User impact:** A deployed build is unusable, with no prompt and no error.
- **Expected behavior:**
  - **Now:** "We couldn't load your account" with a Retry.
  - **Later:** sign in and out, session expiry, and a 401 → sign-in redirect.
- **Fix approach:**
  - An error state for `useMe` in the shell (S).
  - An auth layer in `http.ts`: credentials or a bearer token, and a 401 handler (L).
  - Gate the production build on the auth config.
- **Effort:** S + L

### Medium

**GAP-009: An accidental check-out can't be undone, and you can't check in again that day**
- **Category:** Missing capability · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - A second check-in on the same day is refused with "You've already checked in today." (`src/mocks/time.ts:108`).
  - Check-out is final (`time.ts:125`), and the UI hides both actions afterwards (`CheckInCard.tsx:144-167`).
- **User impact:** The person drops out of "Checked in now" (`src/mocks/dashboard.ts:75`) for the rest of the day while their timers keep running.
- **Fix approach:** Add "Undo check-out" or "Check in again", which reopens today's check-in (or allows several sessions a day), across mock, http, hook and UI.
- **Effort:** S

**GAP-010: Anyone can log time, and so cost, on any project**
- **Category:** Authorization · **Severity:** Medium · **Certainty:** Confirmed (what's intended is in Q3)
- **Evidence:**
  - `time.logOwn` is always true (`src/lib/permissions.ts:54-55`).
  - `start` and `addManual` don't check membership (`src/mocks/time.ts:17-24,129,150`).
  - `AddTimeSheet` lists every project (`AddTimeSheet.tsx:18,67`).
  - Compare `collab.post`, which requires being on the project.
- **User impact:** A member adds hours to another team's project, which changes its cost, overdue flags and dashboard.
- **Fix approach:** `requireCan('time.logOwn', project)` with `isOn`, and filter the sheet's project list the same way.
- **Effort:** S

**GAP-011: Everyone can read everyone's start and end times on every project**
- **Category:** Authorization (IDOR) · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - `time.list(projectId)` checks only that the project exists (`src/mocks/time.ts:75-83`).
  - The Time tab shows person, day and times for each entry (`TimeTab.tsx:51-79`).
  - Spec §1 says check-in is "shown to the person and to managers of their projects", and the dashboard keeps to that (`dashboard.ts:62-71`).
- **User impact:** Every member can see an attendance log of all their colleagues.
- **Fix approach:** The mock scopes entries to your own, the project's PM and admins, with totals per person kept if wanted. Mirror it in the UI.
- **Effort:** S

**GAP-012: Many changes don't reach other open tabs**
- **Category:** Partial implementation · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - There is no `hub.publish` in `src/mocks/projects.ts` (projects, phases, deliverables, board columns), `rates.ts`, `files.upload`, `mentions.markRead`, `chat.markRead` or `dbApi.ts` (reset and reload; see the comment at `dbApi.ts:7`).
  - The `ticketUpdated` keys leave out project summaries and `['dashboard']` (`src/api/queryKeys.ts:45-46`).
  - `staleTime` is 30 s (`main.tsx:16`).
- **User impact:** A second tab shows old phases, columns, files, rates and project progress until focus plus 30 s. After a reset, other tabs act on deleted records.
- **Fix approach:**
  - Add events: `projectChanged{projectId}`, `ratesChanged`, `filesChanged` and `dataReset`, which clears the cache.
  - Add the summary and dashboard keys to `ticketUpdated`.
- **Effort:** M

**GAP-013: Global search finds almost no pages, and no tasks or people**
- **Category:** Partial implementation · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - `navGroups = []` (`src/navigation.ts:19`) and `actionsByPage = {}` (`src/layout/searchShortcuts.ts:16`).
  - The sidebar pages are hardcoded (`src/layout/Sidebar.tsx:104-138`), against the "single list of nav items" rule.
  - Only channels and projects are indexed (`searchShortcuts.ts:45-67`).
  - There's a TODO at `GlobalSearch.tsx:14`.
- **User impact:** "dashboard", "my tasks", "NEX-101" or a colleague's name finds nothing, and a non-admin sees no pages at all.
- **Fix approach:**
  - Move the Work/Manage items into `navGroups` with their permissions, and have the Sidebar, MobileNav and search all read it.
  - Index task keys and titles and people.
  - Fix the checklist line that says people are searchable.
- **Effort:** M

**GAP-014: Writes accept unchecked values and extra fields**
- **Category:** Data integrity / Authorization · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - `checkTaskInput` checks title, phase and estimate only (`src/mocks/tickets.ts:49-53`); `updateTicket` writes every key it is sent (`:142-144`).
  - `projects.update` (`src/mocks/projects.ts:107`), `phases.update` (`:164`) and `deliverables.update` (`:226`) spread the whole patch. `key`, `channelId`, `workspaceId` and `projectId` can be overwritten, and a deliverable can be moved into another project after a rights check on the old one only.
- **User impact:**
  - **In the demo:** reachable only through crafted calls.
  - **In the backend:** the mock is its reference, so assigning someone outside the project, a sprint from another project, or `status: 'x'` (the card vanishes) would carry over.
- **Fix approach:**
  - Allow-list the fields of each patch.
  - Validate status and priority values, that the assignee is on the project, that the sprint is the project's, and that `managerId` exists.
  - Write the rules into the spec.
- **Effort:** S

**GAP-015: Saving a task overwrites changes made since it was opened; the permission is checked on a stale read**
- **Category:** Concurrency · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - TaskSheet sends every field, status included (`src/pages/projects/TaskSheet.tsx:98-110`).
  - `tasks.update` checks rights on `db.read()` and then writes in a separate transaction (`src/mocks/tickets.ts:74-86` → `:138`), with no version check. Comments and files re-check inside their transaction (`src/mocks/comments.ts:61`, `files.ts:44`).
- **User impact:**
  - The assignee moves a card to In review. The PM then saves the open sheet to change the due date, and the card goes back.
  - A reassignment between the read and the write lets the old assignee's move through.
- **Fix approach:**
  - The UI sends only the fields that changed.
  - The mock checks inside `db.update`.
  - The spec adds an optional `updatedAt`/`If-Match` → 409 for the backend.
- **Effort:** S–M

**GAP-016: A project's chat channel drifts from its project**
- **Category:** Data integrity / Inconsistency · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - The channel's `memberIds` and name are copied once, at create (`src/mocks/projects.ts:85-93`), and `projects.update` never touches them (`:101-117`).
  - The name is `slug(name)` with no uniqueness or pattern check (`:89`).
  - @all's reach comes from `channel.memberIds` (`src/mocks/mentions.ts:35,39,43`), while posting rights come from the project (`chat.ts:85-86`).
  - `updateChannel` refuses project channels (`chat.ts:139`).
- **User impact:**
  - People added later never get @all, and people removed still do.
  - A renamed project keeps its old `#name`.
  - Two channels can share a name.
- **Fix approach:** Either derive a project channel's members from `projectPeople` when reading, or sync the name and members inside `projects.update`. Dedupe the slug.
- **Effort:** S

**GAP-017: Unread badges are wrong for the channel you're in and for deleted messages**
- **Category:** Logic bug · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - `markRead` runs only when the channel changes (`src/pages/chat/ChannelFeed.tsx:41`). New messages invalidate `channelsAll` (`queryKeys.ts:39`), so the open channel's badge goes up (`Sidebar.tsx:165`).
  - `withUnread` counts deleted messages (`chat.ts:30-32`).
  - Replies move a DM to the top without counting (`chat.ts:326`).
- **User impact:** A badge appears for messages you're watching arrive, or leads to "This message was deleted."
- **Fix approach:**
  - Mark read again while the channel is in view.
  - Exclude `deletedAt`.
  - Decide whether replies count (Q8).
- **Effort:** S

**GAP-018: Channels can't be archived, and the sidebar lists every public channel**
- **Category:** Missing capability · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - There is no archive or delete in any layer.
  - `channels()` returns every non-private channel (`src/mocks/chat.ts:231`), and the sidebar lists them all with badges (`Sidebar.tsx:159-170`).
  - There is no join or leave (leave is P2 by an M5 ruling).
  - Delivered projects keep their channels.
- **User impact:** With about 30 people and one channel per project, everyone's sidebar fills with channels they don't belong to.
- **Fix approach:**
  - Add `archivedAt` (read-only and hidden).
  - The sidebar shows your channels, with public ones reachable through search or a browse page.
  - Add join and leave.
- **Effort:** M

**GAP-019: Mentions link to the wrong place**
- **Category:** Logic bug / UX state · **Severity:** Medium · **Certainty:** Confirmed, except the cross-workspace case, which is Likely
- **Evidence:**
  - The bell ignores the workspace (`src/mocks/mentions.ts:34-67`, and `MentionItem` has no `workspaceId`), while `mentionLink` uses the current workspace's slug (`src/lib/mentionLink.ts:5-13`). A mention from another workspace opens "not found" (`ChannelPage.tsx:35-38`).
  - A message mention opens the channel's newest 30 messages, not the message (`mentionLink.ts:12-13`).
  - Autocomplete offers everyone, even in a private channel or DM where they won't be notified (`useMentionDirectory.ts:13` vs `mentions.ts:27-28`).
- **User impact:** You click a notification and land somewhere that doesn't show what you were mentioned in.
- **Fix approach:**
  - Add `workspaceId` to the mention and link with that workspace's slug.
  - Link to `?thread=<id>`, or add a "messages around" cursor.
  - In private channels, list members first and say "X isn't in this channel."
- **Effort:** S–M

**GAP-020: Uploads have no progress or cancel, and a failed comment leaves its file behind**
- **Category:** Partial implementation · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - `FileDrop` dropped the CRM's progress rows (`src/components/ui/FileDrop.tsx:10`).
  - One `fetch` with no abort (`http.ts:122-127`).
  - The mock saves the bytes before the transaction (`src/mocks/comments.ts:57`). A 403 inside the transaction (`:61`) leaves an orphan file.
  - The client allows empty files (`src/lib/fileTypes.ts:44`) but the server refuses them (`src/mocks/files.ts:10`).
- **User impact:** With the backend on, a 100 MB bug report sits on "Posting…" with no way out. Errors only show after you press Send.
- **Fix approach:**
  - Upload with progress and an AbortSignal.
  - Cancel and Retry that keep the files.
  - Delete the bytes when the transaction fails.
  - Refuse empty files on the client.
- **Effort:** M

**GAP-021: Project files can't be removed, and only the first dropped file is uploaded**
- **Category:** Missing capability / Logic bug · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:** The `files` Api has url, list and upload only (`src/api/types.ts:278-282`). `ProjectFiles` sends `list?.[0]` (`src/pages/projects/ProjectFiles.tsx:22-25`).
- **User impact:** A wrong or confidential file stays visible to everyone on the project. Dropping 3 files quietly stores 1.
- **Fix approach:** `files.remove` (the uploader, the PM or an admin) across all layers, and upload every dropped file.
- **Effort:** S

**GAP-022: Deliverables can be added and ticked, but not edited or removed**
- **Category:** Partial implementation · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - `DeliverablePatch` has title, phase and due (`src/api/types.ts:159`), and the mock supports them, but the UI only toggles done (`src/pages/projects/OverviewTab.tsx:58-72`).
  - There is no delete in any layer.
  - The update doesn't check `phaseId` (`src/mocks/projects.ts:219-231`).
- **User impact:** A typo or a moved date on a client-facing commitment can't be fixed.
- **Fix approach:** Reuse `DeliverableSheet` for editing; add `deliverables.remove` (`project.edit`).
- **Effort:** S

**GAP-023: Projects can't be archived or deleted**
- **Category:** Missing capability · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:** Only `projects.update` with a status (`src/api/types.ts:239-246`).
- **User impact:** Test or cancelled projects stay in the list, the dashboard and the sidebar along with their channels. Delivered projects pile up.
- **Fix approach:** Add `archivedAt` (admin only). The list hides archived projects unless asked, and archiving also archives the channel (GAP-018).
- **Effort:** M · **Depends on:** GAP-018

**GAP-024: Removing someone from a project leaves their tasks assigned, while the form shows "Unassigned"**
- **Category:** Data integrity / UX state · **Severity:** Medium · **Certainty:** Likely
- **Evidence:**
  - `projects.update` changes members without touching tasks (`src/mocks/projects.ts:101-117`).
  - TaskSheet's options come from `projectPeople` (`TaskSheet.tsx:20-21,203-210`), so a saved assignee who isn't in the list shows as "Unassigned" and is saved back.
  - `task.updateOwnStatus` still lets that person move the card.
- **User impact:** The manager thinks the task is free while it sits in the removed person's My tasks.
- **Fix approach:** Always include the current assignee as an option, marked "not on this project". Offer to reassign when removing people (Q6).
- **Effort:** S

**GAP-025: A rate change rewrites all past cost**
- **Category:** Data integrity · **Severity:** Medium · **Certainty:** Confirmed; the M2 plan chose this, so it's also a question (Q4)
- **Evidence:** `Rate` has no effective date (`src/api/types.ts:74`). `rates.update` replaces it (`src/mocks/rates.ts:22-25`), and every cost uses the current rate (`derive.ts:48-49`, `report.ts:17`, `timeTotals.ts:12`).
- **User impact:** After a raise, last quarter's cost changes and no longer matches what was reported.
- **Fix approach:** Rates get `effectiveFrom`; each entry is costed at the rate in force when it started; the rates editor shows the history.
- **Effort:** M

**GAP-026: The dashboard's "over estimate" compares unlike hours**
- **Category:** Logic bug · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:** The estimate is the sum of task estimates (`src/mocks/dashboard.ts:51,55`), while logged hours include time with no task and time on tasks with no estimate (`derive.ts:36,54`). So `over = logged > estimate` (`dashboardCard.ts:11`).
- **User impact:** A project shows red "over" while every estimated task is within its estimate.
- **Fix approach:** Compare hours on estimated tasks with their estimates, and show the rest separately.
- **Effort:** S

**GAP-027: A forgotten timer runs on silently**
- **Category:** UX state / Logic bug · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - The live clock isn't capped (`src/lib/format.ts:83`, used in `TimerBar.tsx:70,124` and `CheckInCard.tsx:69`), while hours stop at 12.
  - The next day's check-in closes the old check-in but not its timer (`src/mocks/time.ts:111-116`).
  - Marking a task done leaves its timer on (`src/mocks/tickets.ts:72-88`), and the inspector then hides Stop (`TicketInspector.tsx:150`).
  - Manual time is still allowed on done tasks (`time.ts:150` vs the timer rule at `:48`).
- **User impact:** "18:04:11" keeps climbing, and the records contradict each other: checked out at 15:00 while the timer runs to the cap.
- **Fix approach:**
  - Cap the clock at 12:00:00 and add a sentence saying it stopped counting.
  - Close the timer with its old check-in.
  - Stop timers when a task goes to done, or keep Stop visible.
  - Pick one rule for manual time on done tasks.
- **Effort:** S · **Depends on:** GAP-001

**GAP-028: Time and cost can't be exported or filtered**
- **Category:** Missing capability · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:**
  - The report takes only `days` of 7, 30 or 90 (`src/api/types.ts:166,276`).
  - There is no CSV.
  - The Time tab's columns have no sort key (`TimeTab.tsx:51-83`), although `DataTable` supports one.
  - There's no person or date filter and no paging.
- **User impact:** An admin can't hand finance a monthly timesheet or check one person's month.
- **Fix approach:**
  - A `from`/`to` range on the report.
  - A client-side CSV.
  - Sortable columns, and person and date filters.
- **Effort:** M

**GAP-029: The "day" of a check-in or report is the server's day, and the contract carries no time zone**
- **Category:** Inconsistency (backend handoff) · **Severity:** Medium · **Certainty:** Likely
- **Evidence:**
  - `CheckIn.day` is documented as browser-local (`src/api/types.ts:73`), yet the mock computes it with `localDay(now())` inside the "server" (`src/mocks/time.ts:107`, `dashboard.ts:72`, and the Sunday week in `report.ts:22`).
  - `http.ts:112-118` sends no day and no time zone.
- **User impact:** On a UTC backend, a Cairo user checking in after midnight local time gets the wrong day, and report weeks split at UTC Sunday.
- **Fix approach:** Send `tz` (IANA) or the client's `day`, or keep a workspace time zone. Document it in the contract.
- **Effort:** S

**GAP-030: Any change of `DB_VERSION` silently wipes all demo data**
- **Category:** Data integrity · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:** Older versions are marked `outdated` (`src/mocks/db.ts:107-112`) and replaced with the seed (`db.ts:162-165`). There is no migration step.
- **User impact:** Anything entered before a redeploy disappears without a warning. Fixing GAP-005 would trigger this.
- **Fix approach:** A `migrations[from]` chain inside `createDb`, run in the same transaction; reseed only when the data is broken.
- **Effort:** S

**GAP-031: The phone drawer is a modal that doesn't act like one**
- **Category:** UX state (accessibility) · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:** `MobileNav.tsx` sets `role="dialog" aria-modal="true"` but has no Escape key, no first focus, no focus trap and no focus return. `Sheet` and `MenuPanel` have all of these (`Sheet.tsx:51-56`, `Menu.tsx:48-75`). There's no skip link either.
- **User impact:** Keyboard and screen-reader users get stuck behind the overlay.
- **Fix approach:** Reuse Sheet's drawer mode or MenuPanel's focus logic.
- **Effort:** S

**GAP-032: The bell shows a pulsing skeleton forever when mentions fail to load**
- **Category:** UX state · **Severity:** Medium · **Certainty:** Confirmed
- **Evidence:** `NotificationsMenu.tsx:98` treats "no data" as loading, so an error never ends. Home handles the same error properly (`HomePage.tsx:102`).
- **Fix approach:** Show `QueryError` with a Retry when the query has failed.
- **Effort:** S

**GAP-033: The typing indicator is dead code**
- **Category:** Dead/unreachable · **Severity:** Medium (it's part of the chat baseline) · **Certainty:** Confirmed
- **Evidence:**
  - `RealtimeClient` can listen for typing but has no way to send it (`src/lib/realtime.ts:6-21`), and nothing publishes `userTyping`.
  - `addTyper` is fed (`RealtimeBridge.tsx:24`), but `activeTypers` (`src/lib/uiStore.ts:36`) is never shown.
- **Fix approach:** Add `sendTyping(channelId)`, throttled from the Composer, and show "X is typing…" above it. Otherwise remove the code.
- **Effort:** S

### Low

| ID | Title | Category | Certainty | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| GAP-034 | "Moved to …" cards cut column names that contain " to " ("Ready to ship" → "ship") | Logic bug | Confirmed | `src/pages/chat/TaskEventCard.tsx:20-21` | Store the column label on `TaskEvent` and render that | S |
| GAP-035 | No task chip when the text names a longer key (NEX-10 vs NEX-101) | Logic bug | Confirmed | `src/pages/chat/MessageRow.tsx:89` (`includes`) | Compare with `parseTicketKeys` | S |
| GAP-036 | Thread title shows raw `@[Name](id)`; a private thread you can't read shows a generic load error | UX state | Confirmed | `ThreadInspector.tsx:34,38`, `src/lib/inspector.ts:24` | Share one plain-text helper; on 403 show "You're not in this channel." | S |
| GAP-037 | Admins can edit a private channel they can't read; a name clash reveals that a hidden private channel exists; channel rights sit outside `can()` | Authorization / Inconsistency | Confirmed | `src/mocks/chat.ts:62,141-147`, `ChannelMenu.tsx:22` | Add a `channel.manage` action; decide whether admins can see private channels | S |
| GAP-038 | `files.url` checks no access (latent; it matters once chat attachments land) | Authorization | Confirmed | `src/mocks/files.ts:18-23`, `http.ts:143` | Resolve the owner (comment → project, message → `readableChannel`) before serving | S |
| GAP-039 | On a phone, Enter always sends, so a message can't have more than one line | UX state | Likely | `src/pages/chat/Composer.tsx:134` | On coarse pointers, Enter makes a new line and the button sends | S |
| GAP-040 | People with no hourly cost count as 0 EGP without a warning | UX state | Confirmed | `report.ts:17`, `derive.ts:49`, `timeTotals.ts:12` | "2 people have no hourly cost · Set them" | S |
| GAP-041 | A time entry's note is saved but never shown; a timer on a whole project can't be started from the UI | Dead/unreachable | Confirmed | `time.ts:148-156`, `AddTimeSheet.tsx:100`; `TimeTarget {projectId}` is never passed (`HomePage.tsx:90`, `TicketInspector.tsx:156`) | Show notes; add a "Whole project" option or drop the variant | S |
| GAP-042 | "Reload seed data" and "Reset data" do the same thing; there's no import (`importAll` can't be reached) | Inconsistency / Dead | Confirmed | `src/mocks/dbApi.ts:19-28`, `db.ts:206-215` | Merge or tell them apart; decide on import | S |
| GAP-043 | Dead and duplicate API surface, and two REST names for tasks | Dead / Inconsistency | Confirmed | `projects.get` unused; `tickets.projects` = `projects.list`; `useProject`, `useWorkspace` and `trackLoading` unused; `/tickets` vs `/tasks` (`http.ts:83-84,106-107`); TaskSheet's assignee branch unreachable (`TaskSheet.tsx:94-97`) | Pick `/tasks`; delete the dead parts | S |
| GAP-044 | Unknown routes and workspaces silently redirect to Home | UX state | Confirmed | `src/router.tsx:66`, `WorkspaceGate.tsx:23` | A "This page doesn't exist" card | S |
| GAP-045 | Each chat feed makes its own realtime client and never starts it (harmless in the mock, breaks with SignalR) | Partial | Confirmed | `ChannelFeed.tsx:37,43-46`, `RealtimeBridge.tsx:12` | One shared client | S |
| GAP-046 | A PM sees what someone is running on projects outside their scope; `managesAny` counts all workspaces in the mock but only the current one in the UI | Authorization / Inconsistency | Confirmed | `dashboard.ts:78-79`; `shared.ts:59` vs `Sidebar.tsx:95` | Hide what's running out of scope; scope `managesAny` per workspace | S |
| GAP-047 | The same project's cost or hours differ by a few EGP or 0.1 h between screens | Inconsistency | Confirmed | `timeTotals.ts:14,19` vs `DashboardPage.tsx:71`; `dashboard.ts:30-31` | Round only for display | S |
| GAP-048 | Board ranks halve forever; after about 50 drops into one gap the order turns unstable | Logic bug | Likely | `src/pages/projects/boardMove.ts:15` | Renumber the column when the gap gets small | S |
| GAP-049 | Small inconsistencies | Inconsistency | Confirmed | See the list below | — | S |
| GAP-050 | Board, channel and edit polish from the M5 review, deferred then | UX state | Confirmed | See the list below | — | S |

**GAP-049 covers:**
- The column rename input allows 40 characters, but the rule is 30 (`ProjectBoard.tsx:194` vs `boardColumns.ts:4`).
- Phase dates aren't kept inside the project's dates (`projects.ts:150,166`).
- `deliverables.create` doesn't check its due date.
- Phase and sprint filters aren't remembered (`TasksTab.tsx:51-62`).
- Message text has no `dir="auto"` (`MentionText.tsx:20`).
- If projects fail to load, the composer falls back to the wrong rule (`useCanPost.ts:15-18`).
- A failed View as throws an unhandled rejection (`UserMenu.tsx:32-37`).
- Some shell copy is stale (`navigation.ts:27`, `SettingsPage.tsx:17`, `WorkspaceSwitcher.tsx:43`).

**GAP-050 covers:**
- A failed column reorder snaps back without a sentence.
- A rename error can stay under a header after the input closes.
- An old edit error comes back when you reopen Edit message.
- A failed reaction-pill toggle shows no error.
- The channel sheet shows an admin who isn't a member as "· you".
- Drops on a filtered board can tie with hidden cards.
- A movable card takes two Tab stops.

---

## 5. Systemic issues

1. **The demo identity and read state live in the shared document** (GAP-005, 006 and part of 015).
   - `currentUserId` and channel `reads` are fields of the one IndexedDB document that every tab shares.
   - **Fix:** keep "who is acting" per tab, passed into the mock API, and keep read state per user. The .NET backend gets both from the session anyway; the mock should model that.
2. **Cross-tab consistency depends on each write remembering to publish** (GAP-012, 016, 033).
   - The local MutationCache invalidation hides missing events whenever you test in one tab.
   - **Fix:** make publishing part of the write helper (a `db.update` wrapper that takes the event), add the coarse `projectChanged`, `ratesChanged` and `dataReset` events, and add a test that every mock write emits something.
3. **There's no "undo or correct" layer** (GAP-001, 002, 004, 009, 021, 022, 023).
   - Most entities can be created but not edited, removed or archived.
   - **Fix:** a common soft-delete convention (`archivedAt` / `deletedAt`, filtered on read, shown as a placeholder), with one shared ⋯ menu pattern (MenuPanel) and a confirm Sheet.
4. **The mock allows more than the UI does** (GAP-014, 015, 010).
   - Patches are spread wholesale, values aren't validated, and some checks happen outside the transaction.
   - Because the mock is the reference for the backend, these rules will be copied.
   - **Fix:** allow-list every patch, check every foreign key and enum value, and do check-then-act inside `db.update`. Write the rules into spec §4.
5. **"Single source" rules are partly bypassed** (GAP-013, 037, 046).
   - Nav items are hardcoded in the Sidebar rather than in `navigation.ts`, and some permissions are inline role checks rather than `can()`.
   - **Fix:** move them back into `navigation.ts` and the `Action` table.
6. **The backend-on path has no auth or error contract** (GAP-008, 029, 038, 045).
   - **Fix:** before the .NET work starts, agree on auth (cookie or token, 401), time zones, file URL access, and one realtime connection.

---

## 6. Intentionally excluded, and open product questions

**Excluded by design:**
- Spec §10: real backend and sign-in, email and push, payroll, invoices, client portal, Gantt, recurring tasks, Arabic UI strings, ZIP export.
- M5 rulings:
  - a fixed set of 5 statuses (columns can be renamed and reordered, but not added or deleted);
  - a fixed set of 6 reactions;
  - "private" chosen once;
  - leave-channel and admin moderation are P2;
  - only authors edit or delete.
- No read gating on projects: everyone sees every project in the workspace, and spec §4.3 gates writes only.
- "View as" is demo-only and hidden when the backend is on.

**Already known** (checklist §D):
- message search; files in chat messages; markdown; a Threads view; notifications beyond mentions;
- sprints (create, start, complete); story points in the form; WIP limits; group-by and quick filters;
- task history; subtasks and links; labels; clone and move;
- teams editing; notification settings; pins and saved items.

**Questions:**
- **Q1.** Should a delivered or on-hold project block new tasks, board moves and timers?
- **Q2.** Should a phase's status follow its tasks, or at least warn when a phase marked done still has open tasks?
- **Q3.** Should time logging be limited to people on the project (GAP-010)? Should members see colleagues' entries (GAP-011)?
- **Q4.** Should rates apply to past work (they do today) or only from when they change (GAP-025)? Should a past period (a month) be lockable?
- **Q5.** Should deleting a task be soft (keeping its time and cost history) or hard?
- **Q6.** When people are removed from a project, should the app offer to reassign their tasks?
- **Q7.** Who can edit a channel? Today any member can rename #general or remove people. Should there be an owner?
- **Q8.** Should thread replies count as unread, and notify the parent's author and the people in the thread?
- **Q9.** Should a bug have an open/resolved state, or become a `type: 'bug'` task?
- **Q10.** Should public channels need joining, so that membership decides the sidebar, as in Slack?
- **Q11.** Should @all in #general be limited by role?
- **Q12.** Should the Database page offer Import? Reload and Reset are identical today.
- **Q13.** Should a timer require a check-in? Should a day allow several check-in sessions?

---

## 7. Prioritized roadmap

Ordered by (severity × user impact) ÷ effort.

**Quick wins** (S each; about 1–2 days together):
1. GAP-007, the quick fix: enforce globally unique project keys.
2. GAP-009: Undo check-out.
3. GAP-010 and GAP-011: time logging and reading scoped by project and role (after Q3).
4. GAP-030: migrations, which must come before GAP-005.
5. GAP-005: per-user read state.
6. GAP-017: unread for the open channel and for deleted messages.
7. GAP-032: the bell's error state.
8. GAP-027: cap the timer clock and close stale timers.
9. GAP-026: compare like with like on the dashboard.
10. GAP-021 and GAP-022: remove files and deliverables, and upload every dropped file.
11. GAP-014: allow-list the mock patches.
12. GAP-015 (part): check-then-act inside the transaction, and send only changed fields.
13. GAP-016: derive project channel members.
14. GAP-031: drawer focus handling.
15. GAP-034 to GAP-036, and GAP-049.

**Next sprint** (M):
- GAP-001: edit and delete time entries, with the over-12 h prompt.
- GAP-002: archive or delete tasks.
- GAP-004: edit and delete comments and bugs.
- GAP-003: start a DM.
- GAP-006: the acting person per tab.
- GAP-012: the missing realtime events, plus a test that every write publishes.
- GAP-013: search over pages from `navGroups`, tasks and people.
- GAP-019: mention links that land on the message.
- GAP-018 and GAP-023: archive channels and projects; the sidebar shows your channels.

**Larger initiatives** (L, or needs product decisions):
- GAP-008: auth for the backend build (sign-in, session, 401).
- GAP-020: resumable uploads with progress and cancel.
- GAP-025: rate history and period locking.
- GAP-028: time export and filters.
- GAP-029: a time-zone contract.
- GAP-033: the typing indicator.
- GAP-007 done properly: scope by workspace.
- The backend handoff contract (systemic issues 4 and 6).
