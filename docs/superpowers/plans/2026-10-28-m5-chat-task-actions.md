# M5 Chat and Task Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The six P1 items of `tasks/jira-slack-gap-checklist.md`:
- drag a board card to change its status;
- create a task from a chat message;
- task events posted to the project chat as cards;
- emoji reactions;
- edit and delete your own messages;
- create a channel, and edit its topic and members.

**Architecture:**
- Each item is a mock write behind the `Api` contract, with its `lib/http.ts` route. Each write is one `db.update` with `requireCan` (or the chat's `checkCanPost`) inside, and publishes an event that `keysForEvent` maps to invalidations.
- Two new events:
  - `messageChanged` (reaction, edit, delete; for a message or a reply);
  - `channelChanged` (create, edit).
- New stored fields are **optional** (`deletedAt?`, `taskEvent?`, `editedAt?` on replies), so older IndexedDB documents still load and `DB_VERSION` stays 3.
- Task event cards are written inside the same transaction as the task change (`createTicket` / `updateTicket`), through the existing `postMessage` builder, the way comment cards are.

**Tech Stack:** React 19, TS ~6 (erasableSyntaxOnly), Vite 8, Tailwind v4, TanStack Query, React Router, Vitest + fake-indexeddb. Native HTML5 drag and drop; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md`:
- §2: chat ↔ tasks;
- §4.2: the Api;
- §4.3: permissions;
- §5: Chat and Board screens.

The scope comes from `tasks/jira-slack-gap-checklist.md` §D (P1), which extends the spec. Where the spec is silent, the rulings below decide.

## Flow

```mermaid
flowchart TB
  subgraph Board
    D[Drag card to column] --> P{task.manage, or<br/>assignee updateOwnStatus}
    P -- no --> X[Card not draggable;<br/>refusal shown as a sentence]
    P -- yes --> U[tasks.update status + rank at end]
  end
  subgraph Chat message ⋯ menu
    M1[React] --> R[chat.react toggle]
    M2[Edit / Delete — own only] --> E[chat.edit / chat.remove]
    M3[Create task — project channel, task.manage] --> S[TaskSheet prefilled]
    S --> C[tasks.create with linkedMessageId]
    C --> L[message.linkedTicketKeys += key]
  end
  U --> TE[updateTicket: same transaction<br/>posts task event card]
  C --> TE
  TE --> MR[messageReceived]
  R --> MC[messageChanged]
  E --> MC
  L --> MC
  subgraph Channels
    N[Sidebar + → New channel sheet] --> CC[chat.createChannel]
    H[Channel header ⋯ → Edit details] --> UC[chat.updateChannel]
  end
  CC --> CH[channelChanged]
  UC --> CH
  MR & MC & CH --> RB[RealtimeBridge → invalidate → other tabs update]
```

## Rulings fixed by this plan

- **Optional fields, no DB bump.** A missing `deletedAt` means not deleted, and a missing `taskEvent` means a plain message. Cost if wrong: one migration later.
- **Delete keeps the row.** `deletedAt` is set, while `content` becomes `''` and `attachments`, `mentions`, `reactions` and `linkedTicketKeys` become `[]`. Replies stay. The row reads "This message was deleted." Only the author can delete; admins can't either, because moderation is P2.
- **Only plain messages can be edited or deleted.** Cards (`commentId` or `taskEvent`) refuse with 400, and so do deleted messages.
- **Edit re-parses the text.**
  - `mentions` and `linkedTicketKeys` are worked out again.
  - Keys of tasks created from the message, found by `ticket.linkedMessageId === id`, are kept.
  - `editedAt` is set.
  - Content that hasn't changed is a no-op: no write and no event.
- **Reactions use a fixed set.** `REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅']`; any other emoji is a 400. Posting rights come from `checkCanPost`.
- **Task event cards.**
  - One card per create, per assignee change to a person, and per status change. A change to `done` uses kind `'done'`.
  - A rank-only change or any other field posts nothing. So does a patch whose status equals the current one.
  - Cards carry `mentions: []`, so they don't ring the bell. The sender is whoever made the change.
- **Create task from a message.** Offered only in a project's channel, to people with `task.manage` on that project.
  - The title is the first line, trimmed to 120 characters; the description is the whole text.
  - The mock checks that `linkedMessageId` is in that project's channel (400 otherwise).
- **Channels.**
  - Anyone can create a channel.
  - The channel's members can edit it, and so can admins.
  - Project channels and DMs refuse edits with 400: "This channel follows its project." / "Direct messages can't be edited."
  - An editor can't remove themselves; leaving a channel is P2.
- **Private listing fix.** `channels()`, `channel()` and `messages()` show private channels and DMs only to their members, with 403 for anyone else. Today they list them to everyone, and private channels the user can create make that a leak.
- **Board drag needs a mouse.** HTML5 drag doesn't fire on touch, so keyboard and phone users change status with the task panel's Status select. That stays the accessible path, and the board says so in its `aria-describedby` hint.
- **No optimistic update** on drop. The 2px LoadingBar covers the mock delay.

## Global Constraints

- Components import `@/api/*` and `@/lib/*` only, never `@/mocks`.
- Semantic tokens only, logical RTL classes only (`src/rtl.test.ts`), and light, dark and 390px must work.
- Modals use `Sheet` and the delete confirm uses `DeleteDialog`; menus use `MenuPanel`. No toasts and no spinners. After a mutation, rely on the global invalidation; errors are sentences near the cause.
- Copy is sentence case, buttons are verb-first, pending labels use `…` ("Saving…"), separators are ` · `, and empty values are `—`.
- Exact copy: "This message was deleted." · "edited" · "Create task" · "Edit message" · "Delete message" · "Add reaction" · "New channel" · "Edit details" · "You can only change your own messages." (403) · "Pick one of the reactions shown." (400) · "Use lowercase letters, numbers and hyphens." · "A channel with this name already exists." · "You're not in this channel." (403).
- Channel names must match `/^[a-z0-9][a-z0-9-]{0,39}$/`. A topic is at most 250 characters.
- One primary (red) button per view.

## Review Focus

1. **A deleted or edited message in the mentions feed.** A deleted message drops out of `mentionsFor`; an edit that removes `@you` drops it; an edit that adds `@you` brings it in. *(Test in Task 2.)*
2. **Someone outside a private channel** who reacts, edits, or reads `messages()`/`channel()` gets 403, and `channels()` doesn't list the channel. *(Tests in Tasks 2 and 6.)*
3. **A board drop on the same column, or by someone without rights.** The first sends no request; the second has a card that isn't draggable, and a 403 from the mock shows as a sentence above the board. *(Test in Task 1.)*
4. **An assignee moving their own task** posts the status card through the unchecked builder. A status-only patch whose status is unchanged posts nothing. *(Test in Task 4.)*
5. **An old IndexedDB document** (no `deletedAt`/`taskEvent`) still loads and renders. *(Test in Task 2: a message without the fields is a plain message.)*

---

### Task 1: Drag a board card to change its status

**Files:**
- Create: `src/pages/projects/boardMove.ts`, `src/pages/projects/boardMove.test.ts`
- Modify: `src/pages/projects/ProjectBoard.tsx` (add `project`, `onMove`, `error`), `src/pages/projects/TasksTab.tsx` (wire `useUpdateTask`)

**Interfaces:**
- Produces: `boardMove(ticket: TaskView, to: TicketStatus, column: TaskView[]): TicketPatch | null`. It returns `null` when `to === ticket.status`; otherwise `{ status: to, rank: max(column ranks, 0) + 1000 }`.
- `ProjectBoard({ tickets, users, canMove: (t: TaskView) => boolean, onMove: (t: TaskView, to: TicketStatus) => void, error?: string | null })`.

- [ ] **Step 1: Write the failing test.** In `boardMove.test.ts`:
  - `'same column is no move'` → `null`;
  - `'goes to the end of the target column'`: ranks `[1000, 3000]` → `{ status: 'done', rank: 4000 }`;
  - `'empty column'` → rank `1000`.
- [ ] **Step 2: Run** `npx vitest run src/pages/projects/boardMove.test.ts`. Expected: FAIL, cannot find module `./boardMove`.
- [ ] **Step 3: Implement `boardMove`, then the board.**
  - A card `li` is `draggable={canMove(t)}` and sets `dataTransfer` `text/plain` = ticket key.
  - A column section handles `onDragOver` (`preventDefault` when a key is being dragged) and `onDrop` → `onMove`.
  - While a card is over a column, the column shows `ring-2 ring-accent/40`.
  - `TasksTab` computes `canMove` with `check('task.updateOwnStatus', { project, taskAssigneeId })`. On move it calls `boardMove`; if the patch isn't `null`, it calls `update.mutate`.
  - `error` comes from `update.error` and shows as a `role="alert"` sentence (`text-sm text-red-600 dark:text-red-400`, as elsewhere) above the board.
  - The hint below the board's header (`sr-only`, `aria-describedby`): "Drag a card to another column, or change its status in the task panel."
- [ ] **Step 4: Run** `npx vitest run src/pages/projects/boardMove.test.ts && npm run lint`. Expected: PASS, lint clean.
- [ ] **Step 5: Browser check** in the preview pane:
  - As Ahmed (PM), drag NEX-101 To do → In review. The card moves, and another tab updates.
  - As a member, cards that aren't theirs aren't draggable.
  - Check light, dark and 390px (the board still scrolls sideways).
- [ ] **Step 6: Commit** `feat: drag a board card to change its status`.

### Task 2: Message actions API — react, edit, delete

**Files:**
- Modify: `src/api/types.ts` (`ChatMessage.deletedAt?: string | null`, `ThreadReply.editedAt?`/`deletedAt?`, `ChatTarget`, `Api['chat']`)
- Modify: `src/lib/realtime.ts` (`messageChanged`), `src/api/queryKeys.ts` (`keysForEvent`), `src/lib/http.ts`
- Modify: `src/mocks/chat.ts`, `src/mocks/mentions.ts`; create `src/lib/reactions.ts` (`REACTIONS`)
- Modify: `src/api/chat.ts`
- Test: `src/mocks/chat.test.ts`, `src/mocks/mentions.test.ts`, `src/api/queryKeys.test.ts`

**Interfaces:**
- Produces `type ChatTarget = { kind: 'message' | 'reply'; id: string }`.
- `Api['chat']`:
  - `react(target: ChatTarget, emoji: string): Promise<void>` toggles the current user in that emoji's `userIds` and drops an emoji whose list becomes empty.
  - `edit(target: ChatTarget, content: string): Promise<ChatMessage | ThreadReply>`.
  - `remove(target: ChatTarget): Promise<void>`.
- Event: `{ type: 'messageChanged'; channelId: string; messageId: string }`. For a reply, `messageId` is the parent's id. It maps to `[qk.messages(channelId), qk.message(messageId), qk.replies(messageId), qk.mentions()]`.
- HTTP:
  - `POST /api/{messages|replies}/{id}/reactions {emoji}`
  - `PATCH /api/{messages|replies}/{id} {content}`
  - `DELETE /api/{messages|replies}/{id}`
- Hooks: `useReact()`, `useEditMessage()`, `useDeleteMessage()`, each a `useMutation` like `useSendMessage`.
- `REACTIONS` from `src/lib/reactions.ts` (the mock and the UI share it).

- [ ] **Step 1: Write the failing tests** in `chat.test.ts`, under `describe('message actions')`:
  - `'react toggles me on and off; an empty emoji goes away'`;
  - `'react refuses an emoji outside REACTIONS'` → 400 "Pick one of the reactions shown.";
  - `'react on a private channel I am not in'` → 403;
  - `'edit re-parses mentions and keys, sets editedAt, keeps keys of tasks made from it'`;
  - `'edit with the same text writes nothing and publishes nothing'`;
  - `'edit or remove someone else's message'` → 403 "You can only change your own messages.";
  - `'edit or remove a comment card'` → 400;
  - `'remove keeps the row and its replies, clears content, files, mentions and reactions, sets deletedAt'`;
  - `'each write publishes messageChanged with the parent id for a reply'`;
  - `'a stored message without deletedAt or taskEvent reads as a plain message'`.

  In `mentions.test.ts`:
  - `'a deleted message leaves the feed'`;
  - `'an edit that adds @me brings it in; one that removes it takes it out'`.

  In `queryKeys.test.ts`: `messageChanged` maps to the four keys.
- [ ] **Step 2: Run** `npx vitest run src/mocks/chat.test.ts src/mocks/mentions.test.ts src/api/queryKeys.test.ts`. Expected: FAIL (`react is not a function`, plus the type errors).
- [ ] **Step 3: Implement.**
  - A helper `findTarget(data, target)` returns `{ row, channel, parentId }`.
  - `requireOwn(data, row)` throws the 403.
  - `checkPlain(row)` throws 400 "This message can't be changed." for cards and deleted rows.
  - `mentionsFor` skips rows with `deletedAt`.
  - Each write is one `db.update`, followed by `hub.publish`.
- [ ] **Step 4: Run** the same command plus `npm test`. Expected: PASS, and the suite stays green.
- [ ] **Step 5: Commit** `feat: react to, edit and delete chat messages (api)`.

### Task 3: Message actions UI

**Files:**
- Create: `src/pages/chat/MessageActions.tsx` (the ⋯ `MenuPanel` and the reaction picker)
- Modify: `src/pages/chat/MessageRow.tsx`, `src/pages/chat/ChannelFeed.tsx`, `src/pages/chat/ThreadInspector.tsx`

**Interfaces:**
- Consumes `useReact`, `useEditMessage`, `useDeleteMessage`, `REACTIONS`, `ChatTarget` (Task 2), and `useCanPost(channel)`.
- Produces `MessageRow({ message, users, showThread, meId, canPost, actions?: ReactNode })`. `actions` is an extra menu-items slot that Task 5 fills with "Create task".

- [ ] **Step 1: Write the failing test.** Create `src/pages/chat/messageActions.ts` with `actionsFor(row, meId, canPost): { react: boolean; edit: boolean; remove: boolean }` (pure), and a test `messageActions.test.ts`:
  - my plain message → all `true`;
  - someone else's → react only;
  - a card → react only;
  - a deleted row → none;
  - `canPost` false → none.
- [ ] **Step 2: Run** `npx vitest run src/pages/chat/messageActions.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
  - **Menu button.** A ⋯ button (36px round icon button, `aria-label="Message actions"`). It shows on row hover or focus-within on desktop and always on phones.
  - **Menu contents.** It opens `MenuPanel` with:
    - the six reaction buttons (`aria-label="Add reaction 👍"`);
    - "Edit message";
    - "Delete message";
    - the `actions` slot.
  - **Reaction pills.** They become `<button aria-pressed={mine}>`; clicking one toggles that reaction.
  - **Inline edit.** "Edit message" puts a `Composer` (`quiet`, `submitLabel="Save"`, `pendingLabel="Saving…"`, seeded with the content, Escape cancels) in place of the text.
  - **Delete.** "Delete message" opens `DeleteDialog` (title "Delete message?", description "This can't be undone.", confirmText "Delete message")
  - **Deleted row.** The row shows `This message was deleted.` in `text-fg-muted italic` with no menu.
  - **Edited mark.** The ` · edited` mark also shows for replies.
- [ ] **Step 4: Run** `npx vitest run src/pages/chat && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Browser check.**
  - React in tab A; tab B shows the pill.
  - Edit `@Salma` out of a message; Salma's bell drops it.
  - Delete a message that has a thread; the thread link stays.
  - Check light, dark and 390px (the menu becomes a bottom sheet).
- [ ] **Step 6: Commit** `feat: message menu with reactions, edit and delete`.

### Task 4: Task events as chat cards

**Files:**
- Modify: `src/api/types.ts` (`ChatMessage.taskEvent?: TaskEvent`), `src/mocks/tickets.ts` (`createTicket`, `updateTicket`), `src/mocks/chat.ts` (`postMessage` extra accepts `taskEvent`), `src/pages/chat/MessageRow.tsx`
- Create: `src/mocks/taskEvents.ts` (`taskEventOf`), `src/pages/chat/TaskEventCard.tsx`
- Test: `src/mocks/taskEvents.test.ts`, `src/mocks/tickets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TaskEvent = {
    key: string
    kind: 'created' | 'assigned' | 'status' | 'done'
    status?: TicketStatus
    assigneeId?: string
  }
  ```
- `taskEventOf(before: Ticket | null, after: Ticket): TaskEvent[]` (pure). A create gives `[created]`. An update gives `assigned` when `assigneeId` changed to a non-null id, plus `status` or `done` when the status changed, in that order.
- The card's content is plain text, kept for search and the excerpt: "Created NEX-112: <title>", "Assigned NEX-112 to <name>", "Moved NEX-112 to In review", "Done: NEX-112 <title>". `mentions` is `[]` and `linkedTicketKeys` is `[key]`.
- The project's channel comes from `project.channelId`.

- [ ] **Step 1: Write the failing tests.** In `taskEvents.test.ts`:
  - `'create gives created'`;
  - `'assignee to a person gives assigned; to nobody gives nothing'`;
  - `'status change gives status, to done gives done'`;
  - `'rank or title only gives nothing'`;
  - `'same status gives nothing'`.

  In `tickets.test.ts`:
  - `'update posts one card per event in the project channel, in the same write, with no mentions'`;
  - `'an assignee moving their own task posts the card'`;
  - `'messageReceived is published for each card'`.
- [ ] **Step 2: Run** `npx vitest run src/mocks/taskEvents.test.ts src/mocks/tickets.test.ts`. Expected: FAIL (module not found; then no card).
- [ ] **Step 3: Implement.**
  - **Mock.** Inside the existing `db.update` of `createTicket`/`updateTicket`, clone `before`, apply the change, then `taskEventOf(...).forEach(e => postMessage(data, {channelId, content}, { taskEvent: e }))`. After the write, publish `messageReceived` per card.
  - **Card.** `TaskEventCard` shows the `TicketKey` link (opens the inspector, as `CommentCard` does), a `Badge` (Created / Assigned / In review… / Done, with `tone="success"` for done), and the task title from the content.
  - **Row.** `MessageRow` picks `TaskEventCard` when `taskEvent` is set.
- [ ] **Step 4: Run** `npx vitest run src/mocks && npm test`. Expected: PASS. Check the seed test still passes; the seed builds data directly, so it posts no cards.
- [ ] **Step 5: Browser check.** Drag a card (Task 1) and see the "Moved…" card in the project's Chat tab and in its channel. Light, dark, 390px.
- [ ] **Step 6: Commit** `feat: task events post cards in the project chat`.

### Task 5: Create a task from a chat message

**Files:**
- Modify: `src/mocks/tickets.ts` (`tasksApi.create`: check the link, add the key to the message), `src/pages/projects/TaskSheet.tsx` (`draft` prop), `src/pages/chat/ChannelFeed.tsx` / `ChannelPage.tsx` / `src/pages/projects/ChatTab.tsx` (the menu item and the sheet), `src/pages/chat/MessageRow.tsx` (the linked-task chips)
- Create: `src/pages/chat/taskDraft.ts`
- Test: `src/pages/chat/taskDraft.test.ts`, `src/mocks/tasks.test.ts`

**Interfaces:**
- Consumes the `actions` slot (Task 3) and the `created` card (Task 4).
- Produces:
  - `taskDraft(message: ChatMessage, projectId: string): Pick<NewTicket, 'projectId' | 'title' | 'description' | 'linkedChannelId' | 'linkedMessageId'>`;
  - `TaskSheet({ …, draft?: Partial<NewTicket> })`, where `draft` seeds a new task's values.
- Mock:
  - `tasks.create` with `linkedMessageId` checks that the message exists in the project's channel and isn't deleted; otherwise 400 "This message isn't in the project's chat.".
  - In the same write it adds the key to `message.linkedTicketKeys` (no duplicates), then publishes `messageChanged`.

- [ ] **Step 1: Write the failing tests.** In `taskDraft.test.ts`:
  - `'title is the first line, trimmed to 120'`;
  - `'description is the whole text'`;
  - `'mention markup in the title reads as names'` (`@[Salma](u-3)` becomes `@Salma`, through `segments`).

  In `tasks.test.ts`:
  - `'create from a message links both ways and publishes messageChanged'`;
  - `'a message from another channel is refused'`;
  - `'without task.manage it is refused'` (403).
- [ ] **Step 2: Run** `npx vitest run src/pages/chat/taskDraft.test.ts src/mocks/tasks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The menu item "Create task" shows only when the channel belongs to a project and `check('task.manage', { project })` is true. It opens `TaskSheet` with the draft; after a save, the sheet closes.
  - `MessageRow` shows a `TicketKey` chip row for keys in `linkedTicketKeys` that the text doesn't already mention.
- [ ] **Step 4: Run** `npx vitest run src/pages/chat src/mocks && npm test && npm run lint`. Expected: PASS.
- [ ] **Step 5: Browser check.** As Ahmed, in #nexus, use ⋯ → Create task → Save. The chip appears under the message, a "Created…" card follows, and the board shows the task. Members don't see the item. 390px uses a full-screen sheet.
- [ ] **Step 6: Commit** `feat: create a task from a chat message`.

### Task 6: Create and edit channels; private channels only for members

**Files:**
- Modify: `src/api/types.ts` (`NewChannel`, `ChannelPatch`, `Api['chat']`), `src/lib/realtime.ts` (`channelChanged`), `src/api/queryKeys.ts`, `src/lib/http.ts`, `src/mocks/chat.ts`, `src/api/chat.ts`
- Modify: `src/layout/Sidebar.tsx`, `src/layout/MobileNav.tsx` (the "+" by Channels), `src/pages/chat/ChannelPage.tsx` (the header ⋯ → "Edit details")
- Create: `src/pages/chat/ChannelSheet.tsx`, `src/pages/chat/channelForm.ts`
- Test: `src/mocks/chat.test.ts`, `src/pages/chat/channelForm.test.ts`

**Interfaces:**
- Produces:
  - `type NewChannel = { workspaceId: string; name: string; topic: string; isPrivate: boolean; memberIds: string[] }`;
  - `type ChannelPatch = Partial<Pick<Channel, 'name' | 'topic' | 'memberIds'>>`.
- `Api['chat']`:
  - `createChannel(input: NewChannel): Promise<Channel>`: the creator is always added to the members;
  - `updateChannel(id: string, patch: ChannelPatch): Promise<Channel>`.
- Event `{ type: 'channelChanged'; channelId: string }` maps to `[qk.channelsAll(), qk.channel(channelId)]`.
- HTTP:
  - `POST /api/workspaces/{id}/channels`
  - `PATCH /api/channels/{id}`
- Hooks `useCreateChannel()` and `useUpdateChannel()`.
- `channelFormErrors(values, existingNames): Partial<Record<'name' | 'topic' | 'members', string>>` (pure). It uses the exact copy from Global Constraints and requires at least one member besides you for a private channel ("Add at least one person.").

- [ ] **Step 1: Write the failing tests.** In `chat.test.ts`, under `describe('channels')`:
  - `'create adds me, publishes channelChanged'`;
  - `'name must match the pattern and be unique in the workspace'` → 400;
  - `'members and admins can edit; others'` → 403;
  - `'project channels and DMs refuse edits'` → 400;
  - `'an editor cannot remove themselves'` → 400 "You can't remove yourself.";
  - `'channels() lists a private channel or DM only to its members'`;
  - `'channel() and messages() of a private channel I am not in'` → 403.

  `channelForm.test.ts` covers each error.
- [ ] **Step 2: Run** `npx vitest run src/mocks/chat.test.ts src/pages/chat/channelForm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Mock reads.** The listing filters private channels and DMs by `memberIds`; `channel()` and `messages()` get the same check.
  - **Sheet.** `ChannelSheet` (Sheet drawer) has the fields Name (shown as `#` + input), Topic, Private (a checkbox; it can't be changed after create), and Members (a checkbox list of workspace people, with yourself checked and locked). The primary button is "Create channel" / "Save"; their pending labels are "Creating…" / "Saving…".
  - **New channel.** The sidebar's Channels label gets a small `+` (`aria-label="New channel"`), and MobileNav gets the same. After a create, go to the new channel.
  - **Edit details.** The channel header's ⋯ `MenuPanel` → "Edit details" shows for members and admins; it isn't shown on project channels or DMs.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build:prototype`. Expected: all pass.
- [ ] **Step 5: Browser check.**
  - Create a private #design with Salma. As Hossam (not a member), it doesn't show in the sidebar or search, and its URL gives "You're not in this channel."
  - Edit the topic in tab A; tab B's header updates.
  - Check light, dark, 390px and RTL (the `+` sits at the end).
- [ ] **Step 6: Commit** `feat: create channels and edit their topic and members`.

### Task 7: Verify, demo script, review

**Files:** `docs/demo-script.md` (add drag, create-from-message, reactions, a new channel), `tasks/jira-slack-gap-checklist.md` (tick the six P1 items).

- [ ] **Step 1: Run** `TZ=Africa/Cairo npm test`, `TZ=Asia/Tokyo npm test`, `npm run lint` and `npm run build:prototype`. Expected: all green.
- [ ] **Step 2: Browser pass as Admin, Ahmed (PM), Salma (member) and Hossam (sales).** Run the six flows in two tabs (realtime), each in light, dark, 390px and RTL. Use a fresh tab for the console check: no errors.
- [ ] **Step 3: Commit** `docs: M5 demo script and checklist`.
- [ ] **Step 4: Whole-branch review.** Run one review on the most capable model over `28c12f9..HEAD`, with this plan's Review Focus. Then one fix pass, where each fix goes RED → GREEN, and minors are deferred.
