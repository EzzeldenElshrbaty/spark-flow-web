# Spark Flow demo script (Thursday 29 Oct 2026)

Before you start: Settings → Database → **Reload seed data** (type "reload"). The seed is built around the time you
reload it, so do it shortly before the demo. Switch people with the user menu → **View as** (demo only). Everyone
starts on their **Dashboard**; Home is next in the sidebar (in **More** on a phone).

## People

| Person | Role | Use them for |
|---|---|---|
| Youssef Abdelrahman | Admin (the manager) | Dashboard with cost, Time & cost, hourly costs |
| Karim Hassan | Sales | Selling a new project |
| Ahmed Shawky | PM (Mobile App, Sela) | Phases, tasks, his own dashboard |
| Nour El-Sayed | PM (Nexus Core, El Moasser) | Mentions in the bell |
| Salma Ibrahim | Member (QA) | A member's day: start the timer, pause, bug report |
| Tarek Lotfy | Member (Android) | Starting work on a new project |
| Mariam, Hossam | Members | Already working "now" with timers running |

## Story 1: a project from sale to dashboard (about 5 minutes)

1. **Karim** → Projects → **New project**: "Sela kiosk", waterfall, manager Ahmed, add Tarek, due in the spring. It
   opens with 5 phases and its own chat.
2. **Ahmed** → the project → **New task** twice: one with a due date, one with an estimate (6 h), both for Tarek.
   Show Manage phases (rename, reorder).
3. **Tarek** → top bar → **Start timer**: Sela kiosk, then the first task (the timer shows in the top bar and, on a
   phone, above the bottom bar). Then the second task → **Add time** (1 h yesterday).
4. **Ahmed** → **Dashboard**: only the projects he manages or is on; Sela kiosk with hours against the estimate; Tarek
   under "Working now".

## Story 2: a member's day (about 4 minutes)

1. **Salma** → Home → **Start timer** → Nexus Core, **NEX-105**. **Pause**, then **Resume**: the count carries on.
2. NEX-105 → **Activity** → **Bug**: attach a screenshot (a screen recording works too), type `@mar` and pick Mariam,
   **Report bug**. The card appears in **#nexus-core**.
3. **Mariam** → the bell: "Salma Ibrahim mentioned you". Click it.
4. **Salma** → **NEX-108** → **Start timer** (the NEX-105 entry stops by itself). Home → **Stop**: Today shows the
   day's hours, and Settings → Attendance → **Days** shows her in and out.
5. **Mariam** → Nexus Core → **Time**: only her own entries, with "Only you and the project's manager see your
   entries." **Nour** (its manager) sees everyone's. **Tarek** isn't on it, so there's no **Add time**.

## Story 3: the manager's view (about 3 minutes)

1. **Youssef** → **Dashboard**: every project; hours per day for 14 days, tasks by status and hours by project; the
   overdue tasks (one opens beside the page); cost to date, who worked in the last 7 days, and who is working now
   (with what they're on).
2. **Time & cost**: 7 / 30 / 90 days; By project, By person, By week (the chart). **Edit hourly costs** → change one
   rate and come back: the cost moves.
3. **Mariam** (a Member) → **Dashboard**, under Work: only Nexus Core and El Moasser, her own hours in grey. Typing
   `/time` tells her she doesn't have access.

## Story 4: the board and the chat work together (about 4 minutes)

1. **Nour** → Nexus Core → **Tasks** → Board. Drag **NEX-106** into **In review**. Then drag a card between two
   others in its column: the order holds. It also works on a phone (press and hold a card) and with the keyboard
   (Space, the arrow keys, Space).
2. Still Nour: the ⋯ on **In review** → **Rename column** → "Testing". Drag the Testing header after Done, then
   back. The task panel's Status select now says Testing.
3. **Chat** tab: "Moved NEX-106 to Testing" is there as a card. Hover a message → ⋯ → **Create task**: the title
   and description come from the message; **Save task**. The message shows its NEX chip, and a "Created" card follows.
4. In #general: ⋯ → 🎉 on someone's message; click the pill to take it back. ⋯ → **Edit message** on your own
   ("· edited" appears), then **Delete message** ("This message was deleted.", its thread stays).
5. Sidebar **+** by Channels → **New channel**: "design", **Private**, add Mariam. As **Tarek** (not in it) it isn't
   in the sidebar, and its link says "You're not in this channel."
6. Search (top bar) → "NEX-10": NEX-101 to NEX-105 in key order; pick one and its panel opens. "Mar" offers Mariam
   under People, and picking her opens your conversation with her.

## Story 5: fixing mistakes (about 3 minutes)

1. **Youssef** → Home → **Add time**, Nexus Core, one hour. Its ⋯ → **Edit entry**: move it to NEX-102 and save. Then ⋯
   → **Delete entry**. In a project's **Time** tab, a timer that hit the limit says **"12 h · Fix"**.
2. Open **NEX-110** → **Archive task**. It leaves the board and the counts. Its links still open it ("This task is
   archived."). List view → **Show archived (1)** → **Restore task**.
3. NEX-101 → **Activity** → report a bug, then ⋯ → **Edit comment**: the card in #nexus-core changes with it. ⋯ →
   **Delete comment** leaves "This comment was deleted."
4. Sidebar **+** by Direct messages → pick Salma and Hossam → **Open conversation**. Doing it again opens the same
   one. **Teams** → **Message** on Mariam opens the DM you already have.
5. Two tabs: **View as Mariam** in one. The other stays Youssef, and each sends as itself.
6. Nexus Core → **Edit project**: untick Hossam and the Backend team. The form says "Hossam Gaber keeps 1 open task
   here." Save: #nexus-core drops him, and NEX-107 reads "Hossam Gaber (not on this project)" until reassigned.
7. Mobile App → Overview → **Files**: drop three files at once (one empty): two upload, the empty one says so. ⋯ →
   **Remove file**. Home → **Pause** the timer, then **Switch task** to start on another.
8. **Youssef** → Sela booking → ⋯ → **Archive project**: it leaves Projects, the sidebar and the dashboard, and
   #sela-booking is read-only. Projects → **Show archived** → open it → **Restore project**.
9. Settings → Database → **Export data**, then **Import data** with that file (type `import`). **Start timer** → Nexus
   Core → the Task list has **No task** for the whole project.
10. **Time & cost** → pick a project → **Export CSV**. Two tabs (one **View as Mariam**) on #general: typing in one shows
   "Mariam Fathy is typing…" in the other.

## Story 6: your own board, and what happened (about 3 minutes)

1. **Nour** → Nexus Core → **Tasks** → Board → **+ Add column**: "QA", type **In progress**, after In progress. Drag a
   card into QA.
2. QA's ⋯ → **Delete column** → move its tasks to **In review** → **Delete column**. The only Done column can't be
   deleted ("Each type needs at least one column.").
3. Rename **Done** to "Shipped": progress and My tasks still count it as done, because its type is Done.
4. Open the card → **History**: "moved it from QA to In review", with who and when. Project → **History** tab →
   **Board**: the column lines. **Tasks** shows each task's created line from the start.

## Story 7: files on a task (about 2 minutes)

1. **Nour** → Nexus Core → **New task**: "Token rotation runbook". In the description type `- check the logs`, then drop
   a screenshot into it: it uploads and shows as a picture where the caret was. Under **Attachments** add a PDF.
   **Save task**.
2. Open the task: the description with the picture, then **Attachments · 2**. Click the PDF: it opens in the viewer.
3. Project → **Files** tab: both files, From the new task's key · Attachment (it opens the task); NEX-105's screenshot
   shows "NEX-105 · Bug". **Chat** narrows it to files shared in the project's chat.

## If something looks off

- Reload the seed (Settings → Database). It replaces everything in this browser, including uploads.
- Light/Dark is in the user menu. Every screen also works on a phone width.
