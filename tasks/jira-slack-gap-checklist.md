# Spark Flow vs Jira and Slack: feature gap checklist

Prepared 28 Oct 2026, after M0–M4 (branch `feat/company-system`). It compares what Spark Flow does today with:
- current Jira Cloud (as in the screenshots of "My PM Team");
- current Slack (as in the screenshots of "DEVE Design").

**Legend**
- **Status:** ✅ done · 🟡 partial · ⬜ not done
- **Priority:** **P1** worth doing before or right after the demo · **P2** next milestone · **P3** later or out of scope (spec §10 or the cut line)

**How sure each line is**
- Jira lines marked *(verified)* come from Atlassian support docs, each checked 3-0 by the deep-research run.
- The other Jira and Slack lines come from targeted searches of the official help sites (cited) and from the screenshots.
- The Spark Flow status of every line was checked in the code.
- The deep-research run verified only 25 of the 140 claims it found, and no Slack claims, so Slack plan tiers in particular should be re-checked on slack.com/pricing.

---

## A. Jira

### A1. Spaces and navigation
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Projects, called "spaces" in current Jira *(verified: the rename covers terminology and icons only)*. See [release note](https://jirareleases.atlassian.com/announcements/jira-spaces-a-new-name-that-matches-how-you-really-work). | Projects list, create and edit, key, PM, people, teams. The UI says "project" and "task", which matches the spec. | — |
| ⬜ | Admin-customizable space tabs *(verified)*: rename, reorder, remove, set the default, add back with "+". Changes are shared with everyone in the space. See [doc](https://support.atlassian.com/jira-software-cloud/docs/manage-and-customize-the-project-navigation/). | Tabs are fixed: Overview · Tasks · Chat · Time. | P3 |
| ⬜ | Space templates and Import work. | — | P3 |

### A2. Summary (space overview)
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| 🟡 | Four tiles *(verified)*: completed, updated and created in the last 7 days, and due in the next 7. Each opens a filtered list. See [doc](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-summary-view/). | Project Overview has Progress, Hours, Expected finish and Cost. The Dashboard has workspace-wide tiles. No created, updated or completed counts, and no drill-down. | P2 |
| ⬜ | Status overview donut *(verified; "Done" counts the last 2 weeks only)*. | — | P2 |
| ⬜ | Recent activity feed *(verified)*. | — (no task history is stored) | P2 |
| ⬜ | Priority breakdown and Types of work *(verified)*. | — | P3 |
| 🟡 | Team workload, with reassigning from the list *(verified)*. | The dashboard's "Last 7 days" shows hours per person. There's no assigned-work view and no reassigning from it. | P2 |

### A3. Backlog and sprints
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| 🟡 | Create, start and complete a sprint; sprint dates and goal; on completion, move unfinished work to the backlog or the next sprint. See [create](https://support.atlassian.com/jira-software-cloud/docs/create-sprints-in-company-managed-projects/), [start](https://support.atlassian.com/jira-software-cloud/docs/plan-a-sprint/) and [complete](https://support.atlassian.com/jira-software-cloud/docs/complete-a-sprint/). | Sprints exist only as seed data. A task can be put in a sprint, and the Tasks tab filters by sprint (agile projects only). You can't create, start or complete a sprint, or set a goal. | P2 |
| ⬜ | Drag items between sprints and the backlog, with estimate totals per sprint. | — | P2 |
| 🟡 | Story points. | The `storyPoints` field exists but the task form doesn't edit it. Estimates are in hours. | P3 |

### A4. Board
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Columns by status, with counts. | Board with 5 fixed status columns and an hours total per column. | — |
| ⬜ | **Drag a card to change its status.** | Status changes only through the task form or the panel's Status select. | **P1** |
| ⬜ | Add, delete and move columns; map statuses to columns; unmapped statuses hide their work items *(verified)*. See [doc](https://support.atlassian.com/jira-software-cloud/docs/configure-columns/). | Statuses are fixed (`backlog · todo · inProgress · inReview · done`). | P3 |
| ⬜ | Column min/max limits (WIP) *(verified)*: a red or yellow header as a warning only. The right-most column counts as done. | — | P2 |
| ⬜ | Manage workflows (custom statuses and transitions). | — | P3 |
| ⬜ | Group by (swimlanes) and quick or custom filters *(verified; group-by sits in View settings)*. | The Tasks tab has phase chips and a sprint select. No group-by and no saved filters. | P2 |
| ⬜ | Per-user View settings *(verified)*: sidebar vs dialog, card fields, swimlanes. The screenshots also show hide-done-after, column size and scrolling. See [doc](https://support.atlassian.com/jira-software-cloud/docs/customize-your-view-of-the-board-and-backlog/). | Only the Board/List choice is remembered per person. | P3 |
| ⬜ | Insights panel *(verified)*: Work items for attention (Stuck = past the 85th percentile of time in status, Blocked = has a "Blocked by" link, Flagged = set by hand), Sprint progress and Sprint burndown with a guideline. See [doc](https://support.atlassian.com/jira-software-cloud/docs/understand-insights-on-the-board-in-company-managed-projects/). | — (overdue is the only "attention" signal, as a chip) | P2 |
| ⬜ | Stand-up mode *(verified, medium)*: rotates through people with a timer. See [doc](https://support.atlassian.com/jira-software-cloud/docs/run-a-standup-meeting-in-jira/). | — | P3 |

### A5. Calendar, timeline, list and filters
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ⬜ | Calendar *(verified)*: a month grid showing items with a due date; an Unscheduled work drawer; dragging an item sets its due date; dragging an edge changes the start or due date. See [doc](https://support.atlassian.com/jira-software-cloud/docs/schedule-work-in-your-calendar). | — | P2 |
| 🟡 | Timeline (Gantt) *(verified)*: one space only, a sprints row for scrum, Weeks/Months/Quarters. Plans across spaces need Premium. See [doc](https://support.atlassian.com/jira-software-cloud/docs/manage-epics-on-the-roadmap/). | The phases bar (StageProgress) shows phases in order with their dates. There's no Gantt; spec §10 puts Gantt charts out of scope. | P3 |
| ✅ | List view. | The Tasks tab's List, grouped by phase. | — |
| ⬜ | Saved views for List and Timeline *(verified, medium)*: an admin saves a shared snapshot, and members can make personal changes and reset. | — | P3 |
| ⬜ | Basic / Advanced / JQL filters, saved filters, dashboards with gadgets. | My tasks, phase and sprint filters, and the global search for pages, channels, projects and people. | P3 |

### A6. Work item (task) view
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Type, status, priority, assignee, reporter, due date, estimate, phase, sprint, description. | Task form plus panel; Bug and Overdue chips; logged vs estimate. | — |
| ✅ | Comments with @mentions, and attachments (images, video, files). | Activity tab with comments and bugs; up to 5 files; a card in the project chat. | — |
| 🟡 | Work log and time tracking. | Timer, Add time and check-in exist, and the project's Time tab lists entries. The task panel shows only "logged / estimate" and has no per-task work log list. | P2 |
| ⬜ | History (who changed what, when). | — | P2 |
| ⬜ | Parent/epic, subtasks, linked work items ("blocks / is blocked by"). | — (phases play the role of epics) | P2 |
| ⬜ | Labels, start date, team field, flag. | — | P3 |
| ⬜ | Watchers, share, restrict, clone, move. | — | P3 |
| ⬜ | Development panel (branches, commits, PRs), Automation, Forms, Docs (Confluence), Rovo AI. | — | P3 |

### A7. Roles and permissions
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Roles and per-space permissions. | Admin, Sales, PM (own projects) and Member, through one `can()` table. The mock enforces them (403) and the UI hides what's not allowed. | — |
| 🟡 | Cost and time reporting. | Admin-only Time & cost, hourly costs and a dashboard. Jira has no built-in cost tracking, so this is a Spark Flow extra. | — |

---

## B. Slack

### B1. Sidebar and navigation
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Channels and DMs in the sidebar, with unread counts and presence dots. | Yes. | — |
| ⬜ | Threads view (every thread you're in), an Activity view, and Files. | The bell lists mentions of me only. There's no threads list and no files list outside projects. | P2 |
| ⬜ | Starred channels and custom sidebar sections. | — | P3 |
| ⬜ | Directories (people, channels, user groups). | The Teams page lists teams and people (read-only). | P3 |
| ⬜ | Split view. | Threads and tasks open beside the channel, but you can't open a second channel. | P3 |

### B2. Channels
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Public and private channels; project channels; who may post. | Yes. A project channel follows the project's permissions, and a private one needs membership. | — |
| ⬜ | **Create a channel, edit its topic and description, add or remove people, leave it.** | Channels come from the seed or from creating a project. | **P1** |
| ⬜ | Channel details panel (members, files, pinned). | — | P2 |
| ⬜ | Channel templates, a canvas tab, bookmarks and tabs. See [templates](https://slack.com/intl/en-gb/help/articles/34237742189715-Work-with-templates-in-channels). | — | P3 |
| ⬜ | Summarize channel (AI, paid). See [plans](https://slack.com/help/articles/115003205446-Slack-plans-and-features). | — | P3 |

### B3. Messaging
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Send messages, reply in threads, @mentions (person, @all, task and project) with autocomplete and chips. | Yes, with live updates in other tabs. | — |
| ⬜ | **Edit and delete your own message.** See [Slack: edit or delete](https://slack.com/intl/en-gb/help/articles/202395258-edit-or-delete-messages). | — (an "edited" label is shown for seed data only) | **P1** |
| 🟡 | **Emoji reactions.** | Seeded reactions show, but people can't add or remove them. | **P1** |
| ⬜ | Rich text toolbar (bold, italic, lists, quote, code block, links). | Plain text only, on purpose for safety (spec §7). This needs a safe markdown subset. | P2 |
| ⬜ | Files and images in chat messages. | Files can only be attached to task comments, whose cards appear in chat. | P2 |
| ⬜ | Pin messages; save or to-dos ("Later" became To-dos in Oct 2026); reminders; scheduled messages; drafts and sent. See [save](https://slack.com/help/articles/360042650274-Save-messages-and-files-for-later), [remind](https://slack.com/help/articles/208423427-Set-a-reminder) and [To-dos](https://slack.com/help/articles/55757634348435-Later-is-now-To-dos). | — | P3 |
| ⬜ | Search message text (with modifiers). | Search finds pages, channels, projects and people, not messages. | P2 |
| 🟡 | Link previews and unfurls. | Task keys and mentions become chips that open the task. There are no preview cards. | P2 |
| ⬜ | Mark as unread; send a reply to the channel too. | — | P3 |

### B4. Composer "+" and the rest of Slack
| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ⬜ | Files, GIFs, text snippets, audio and video clips, slash commands. | — | P3 |
| ⬜ | Huddles (audio and video; group huddles are paid). See [features](https://slack.com/intl/en-gb/features). | — | P3 |
| ⬜ | Canvases, Lists (paid; task tracking with subtasks) and Workflow Builder (paid). See [lists](https://slack.com/blog/news/introducing-slack-lists) and [workflows](https://slack.com/features/workflow-automation). | Spark Flow's projects and tasks already do what Slack Lists do. | P3 |
| ⬜ | Slack AI (summaries, recaps, huddle notes; tier varies by plan). | — | P3 |
| 🟡 | Notifications and Do Not Disturb, user status. | The bell covers mentions only. There are no notification settings, no DND and no custom status. Email and push notifications are out of scope (spec §10). | P2 |

---

## C. Where Jira meets Slack (the reason Spark Flow exists)

Jira Cloud for Slack lets people:
- create a work item from a message (the message's More actions, or `/jira create`);
- mention @Jira (needs Rovo);
- see a live preview card when they paste a work item key or link;
- get channel and personal notifications.

Sources: [create and update from Slack](https://support.atlassian.com/jira-software-cloud/docs/create-and-update-jira-work-from-slack/), [integrate Jira Cloud and Slack](https://support.atlassian.com/jira-software-cloud/docs/use-jira-cloud-for-slack/), [mention @Jira](https://support.atlassian.com/jira-software-cloud/docs/mention-jira-in-slack-to-manage-work/).

| | Feature | Spark Flow today | Pri |
|---|---|---|---|
| ✅ | Each project has its own chat; comments and bugs post there as cards. | Yes. | — |
| ✅ | Task keys in chat link to the task. | Yes, as `@NEX-101` chips and plain `NEX-101` keys. | — |
| ⬜ | **Create a task from a chat message** (prefilled with the message text; the message links back to the task). | — (the `linkedChannelId` and `linkedMessageId` fields already exist on tasks) | **P1** |
| ⬜ | **Post task events to the project chat**: created, assigned, status changed, done. | Only comments and bugs post cards. | **P1** |
| ⬜ | A preview card when a task key is pasted (status, assignee, due). | A chip only. | P2 |
| ⬜ | Personal notifications for assigned to me, status changes on my tasks, and due soon. | Mentions only. | P2 |

---

## D. To-do, in order

**Before or right after Thursday (P1)**. Each item is small and visible in a demo:
- [ ] Drag a card to change its status (Board), with the same permission check as the status select.
- [ ] Create a task from a chat message, via the message's ⋯ menu → "Create task". Prefill the title and description; the task records `linkedMessageId`; the message shows the task chip.
- [ ] Post task events to the project chat as cards: created, assigned, status changed, done.
- [ ] Emoji reactions: add or remove on messages and replies, with live updates in other tabs.
- [ ] Edit and delete your own messages ("edited" label; a deleted message shows "This message was deleted.").
- [ ] Create a channel (public or private) and edit its topic and members.

**Next milestone (P2)**:
- [ ] Sprints: create, start (with dates and goal), complete (move unfinished work), drag between sprints and the backlog.
- [ ] Task history, a per-task work log in the panel, and a project "Recent activity" feed.
- [ ] Space Summary tiles (completed, updated and created in the last 7 days, due in the next 7) that open a filtered list, plus a status donut.
- [ ] Board insights (overdue, stuck, blocked) and WIP limits per column.
- [ ] Calendar view with an Unscheduled drawer; drag to set the due date.
- [ ] Parent and subtasks, and "blocks / is blocked by" links.
- [ ] Message search; files and images in chat messages; a safe markdown subset (bold, italic, code, lists, links).
- [ ] Notifications beyond mentions (assigned to me, status changes, due soon); a Threads view.

**Later or out of scope (P3)**:
- Custom statuses and workflows; column configuration; group-by and saved filters or JQL; saved views; space tab customization; standup mode.
- Labels, watchers, clone or move, Development panel, automation, forms, docs.
- Pins, reminders, scheduled messages, To-dos, GIFs, snippets, clips, slash commands; huddles, canvases, Lists, Workflow Builder; AI summaries.
- Gantt timeline (spec §10), email or push notifications (spec §10), guests and shared channels.
