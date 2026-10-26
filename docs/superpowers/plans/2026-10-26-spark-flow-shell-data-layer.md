# Spark Flow Phase 1 + 2 (Shell and Data Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `spark-flow-web` scaffold into a navigable Spark Flow shell (workspaces, channels, DMs, projects, inspector) backed by a typed, `localStorage` mock backend that can be swapped for .NET + SignalR without touching components.

**Architecture:** Spark CRM pattern: `lib/api.ts` exposes one typed `api` object that calls `mocks/` while `backendOn` is false and `fetch('/api/…')` when true; `api/<domain>.ts` wraps it in TanStack Query hooks, the only thing pages import. URL holds what you're looking at; Zustand holds UI preferences; a mock `RealtimeClient` (in-tab + `BroadcastChannel`) drives query invalidation through `RealtimeBridge`.

**Tech Stack:** React 19, TypeScript ~6, Vite 8, Tailwind CSS v4, TanStack Query v5, React Router v8, lucide-react, clsx, + `zustand`, dev `vitest`.

**Spec:** `docs/superpowers/specs/2026-10-26-spark-flow-shell-data-layer-design.md` — read it with this plan; section numbers below (§) refer to it.

All paths are relative to `spark-flow-web/`. Commands run from `spark-flow-web/`.

## Global Constraints

- Follow `CLAUDE.md` hard rules: semantic color tokens only; light + dark; 390px phone; `Sheet`/`MenuPanel` only; no spinners, no toasts; sentence-case, verb-first microcopy; `lib/format.ts` for dates; one primary button per view.
- Copy kit patterns from `design/reference-code/` rather than inventing (`MarketSwitcher.tsx` → `WorkspaceSwitcher`, `PageHelpPanel.tsx` → `Inspector`). Class strings stay identical except the physical → logical direction swap (§6.5).
- Tailwind logical direction classes only (§6.5). Banned: `ml-` `mr-` `pl-` `pr-` `left-` `right-` `text-left` `text-right` `border-l` `border-r` `rounded-l-` `rounded-r-` (including negative and variant-prefixed forms).
- Directional lucide icons (`ChevronLeft/Right`, `ArrowLeft/Right`, `ArrowUpRight`) carry `rtl:-scale-x-100`.
- Components import only from `@/api/<domain>` (hooks), `@/api/types` (types), `@/lib/*`, `@/components/*`, `@/layout/*`. Nothing outside `src/lib/api.ts` and `src/mocks/` imports from `@/mocks`.
- New code uses `@/` imports. Erasable TypeScript only (`erasableSyntaxOnly`): no enums, no constructor parameter properties.
- Mock latency 150–300ms. `localStorage` keys: `spark-flow.mockdb.v1` (DB), `spark-flow.ui` (Zustand), existing `spark-flow.theme`. `BroadcastChannel` name `spark-flow.realtime`.
- Dev proxy: `/api` → `http://localhost:5080`; `/hubs` → same target with `ws: true`.
- Production build fails unless `VITE_BACKEND=on` and `VITE_API_URL` are set; `vite build --mode prototype` builds the demo.
- Voice (from `spark-design-system.md`): specific, numbers over adjectives, no buzzwords, short active sentences, Western digits — applies to seed text and microcopy.
- No new runtime dependencies besides `zustand`. Do not install `dnd-kit`, `@tanstack/react-table`, `cmdk`, `react-hook-form`, `zod`, `react-resizable-panels`, or shadcn.

## Review Focus

1. **Saving to `localStorage` throws** (Safari private mode, quota full) → the app keeps working on an in-memory copy and warns once. Test in Task 3 (`db.test.ts › keeps working when setItem throws`).
2. **Two tabs write in turn** → the second write must not erase the first tab's change, because `update` re-reads storage first. Test in Task 3 (`db.test.ts › update keeps another instance's write`).
3. **`BroadcastChannel` missing** (older browsers, Node tests) → real-time still works inside the tab. Test in Task 5 (`realtime.test.ts › works without BroadcastChannel`).
4. **Lower-case or padded ticket key in the URL** (`?ticket=nex-101 `) → opens `NEX-101`. Test in Task 10 (`inspector.test.ts › normalises ticket keys`).
5. **DM whose other member isn't in the user list, or a DM with yourself** → the sidebar shows "Unknown person" or "Your name (you)", never an empty row. Test in Task 9 (`channels.test.ts`).

---

### Task 0: Git baseline

The folder is not a git repo; later tasks commit.

- [ ] **Step 1:** `git init && git add -A && git commit -m "chore: baseline scaffold from design kit"`
  Expected: commit created; `node_modules`, `dist` ignored by the existing `.gitignore`.

---

### Task 1: Tooling — `@/` alias, dev proxy, production guard, Vitest, Zustand

**Files:**
- Modify: `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json` (only if Vitest types need it), `package.json`
- Modify: every file under `src/` with a relative import (mechanical)
- Create: `src/smoke.test.ts` (removed in Task 2)

**Interfaces:**
- Produces: `@/*` → `src/*` in Vite, TypeScript and Vitest; `npm test` = `vitest run`.

- [ ] **Step 1: Install** — `npm i zustand && npm i -D vitest`. Expected: both in `package.json`; `npm ls vite` shows one Vite 8 copy (Vitest must accept Vite 8; if npm reports a peer conflict, stop and report).
- [ ] **Step 2: Write `src/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { formatDate } from '@/lib/format'

describe('tooling', () => {
  it('resolves @/ imports', () => {
    expect(formatDate('2026-10-03T10:00:00Z')).toBe('3 Oct 2026')
  })
})
```

- [ ] **Step 3:** Add `"test": "vitest run"` to `package.json` scripts. Run `npm test`. Expected: FAIL — cannot resolve `@/lib/format`.
- [ ] **Step 4: Configure** —
  - `vite.config.ts`: add `/// <reference types="vitest/config" />`.
  - `resolve.alias { '@': fileURLToPath(new URL('./src', import.meta.url)) }`.
  - `server.proxy { '/api': 'http://localhost:5080', '/hubs': { target: 'http://localhost:5080', ws: true } }`.
  - `test: { environment: 'node', include: ['src/**/*.test.ts'] }`.
  - Make it `defineConfig(({ mode }) => …)` with the production guard copied from `design/reference-code/vite.config.ts`, error message: `'Production build needs VITE_BACKEND=on and VITE_API_URL. Use "vite build --mode prototype" for the demo.'`
  - `tsconfig.app.json`: `"baseUrl": "."`, `"paths": { "@/*": ["./src/*"] }`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Convert imports** — replace every relative import in `src/**/*.{ts,tsx}` with its `@/` form. No other edits.
- [ ] **Step 7: Verify** — `npm run build && npm run lint && npm test` all pass. `grep -rn "from '\.\{1,2\}/" src` prints nothing. Then:

```bash
vite build && echo SHOULD-NOT-PRINT
```

Expected: fails with the guard message. `npx vite build --mode prototype` succeeds.
- [ ] **Step 8: Commit** — `git commit -am "build: add @/ alias, dev proxy, prod guard, vitest, zustand"` (add new files first).

---

### Task 2: RTL readiness (§6.5)

**Files:**
- Create: `src/rtl.test.ts`
- Modify: every `src/**/*.tsx` / `*.ts` using a banned class; `index.html`; `src/index.css`
- Delete: `src/smoke.test.ts`

**Interfaces:**
- Produces: `animate-slide-in-end` utility (used by Task 10 `Inspector` and `MobileNav` drawer).

- [ ] **Step 1: Write `src/rtl.test.ts`** — reads every `src/**/*.{ts,tsx}` (`node:fs` + `node:path`, recursive), skips `*.test.ts`, and collects matches of:

```ts
const banned = /(?<![\w-])-?(?:[a-z0-9]+:)*(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|scroll-ml|scroll-mr)-[\w.[\]/]+|(?<![\w-])(?:[a-z0-9]+:)*(?:text-left|text-right|border-l|border-r)(?![\w-])/g
```

  Test `it('uses logical direction classes only')` → `expect(hits).toEqual([])`. Each hit is formatted `file:line: class`.
- [ ] **Step 2:** `npx vitest run src/rtl.test.ts` → FAIL listing about 50 hits (e.g. `layout/TopBar.tsx:16: -ml-2`).
- [ ] **Step 3: Convert** each hit to its logical form: `ml→ms`, `mr→me`, `pl→ps`, `pr→pe`, `left→start`, `right→end`, `text-left→text-start`, `border-l→border-s`, `rounded-l→rounded-s`, … Only exception: inside a string that isn't a class list (none expected); if one appears, narrow the regex rather than editing copy. Add `rtl:-scale-x-100` to directional lucide icons. Delete `src/smoke.test.ts`.
- [ ] **Step 4: Root and animation** —
  - `index.html`: `<html lang="en" dir="ltr">`.
  - `src/index.css` `@theme`: add `--animate-slide-in-end: slide-in-end 0.28s cubic-bezier(0.2, 0.7, 0.2, 1) both;` with a `@keyframes slide-in-end { from { opacity: 0; transform: translateX(var(--slide-from, 24px)) } to { opacity: 1; transform: none } }`. Add `[dir='rtl'] { --slide-from: -24px; }`.
  - `MobileNav` drawer opens from the start side: only swap `left-0 → start-0`; it does not use `animate-slide-in-end`.
- [ ] **Step 5:** `npm test && npm run build && npm run lint` → PASS.
- [ ] **Step 6: Visual check** — `npm run dev`. With Playwright, run at 1440px `document.documentElement.dir = 'rtl'` and take a screenshot. Expected: sidebar on the right, search and icons mirrored, nothing overlapping. Revert `dir`.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: RTL-ready layout with logical direction classes"`

---

### Task 3: Contracts, `ApiError`, mock database

**Files:**
- Create: `src/api/types.ts`, `src/lib/apiError.ts`, `src/mocks/db.ts`, `src/mocks/latency.ts`, `src/mocks/testing.ts`
- Test: `src/mocks/db.test.ts`

`src/mocks/testing.ts` exports `memoryStorage(initial?: Record<string, string>): KeyValueStorage` (a `Map` behind it). Every later mock test imports it.

**Interfaces:**
- Produces (`src/api/types.ts`): every type in §4 verbatim, plus:
  - `type StoredChannel = Omit<Channel, 'unreadCount'>`
  - `type NewTicket = Pick<Ticket, 'projectId' | 'title' | 'description' | 'status' | 'priority' | 'storyPoints' | 'assigneeId' | 'sprintId'> & Partial<Pick<Ticket, 'linkedChannelId' | 'linkedMessageId'>>`
  - `type TicketPatch = Partial<Pick<Ticket, 'title' | 'description' | 'status' | 'priority' | 'storyPoints' | 'assigneeId' | 'sprintId' | 'rank'>>`
  - `interface Api` — the §4.1 shape, plus `chat.markRead(channelId: string): Promise<void>`. markRead is a small write beyond §4.1; without it `unreadCount` can never drop.
  - `Role` re-exported from `@/lib/roles`.
- Produces (`src/lib/apiError.ts`): `class ApiError extends Error { status: number; title: string; detail?: string }`, built with `new ApiError(problem: ProblemDetails)`; `message` = `detail ?? title`. Fields are declared explicitly (no parameter properties).
- Produces (`src/mocks/latency.ts`): `delay(): Promise<void>` (random within `latency.min..max`), `export const latency = { min: 150, max: 300 }` (tests set both to 0).
- Produces (`src/mocks/db.ts`):
  - `DB_KEY = 'spark-flow.mockdb.v1'`, `DB_VERSION = 1`.
  - `type DbData = { version: number; currentUserId: string; users: User[]; workspaces: Workspace[]; projects: Project[]; sprints: Sprint[]; tickets: Ticket[]; channels: StoredChannel[]; messages: ChatMessage[]; replies: ThreadReply[]; reads: Record<string, string>; counters: Record<string, number> }`. `reads` maps channelId to ISO time; `counters` maps projectId to the next ticket number.
  - `type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`
  - `interface MockDb { read(): DbData; update<T>(fn: (data: DbData) => T): T; reset(): void }`
  - `createDb(storage: KeyValueStorage, seed: (now: Date) => DbData, now: () => Date = () => new Date()): MockDb`

- [ ] **Step 1: Write `src/mocks/db.test.ts`** — uses `memoryStorage()` from `./testing` and a tiny `fakeSeed(now)` that returns a `DbData` with one user, `version: DB_VERSION`:

```ts
it('seeds on empty storage and saves under DB_KEY', () => {
  const storage = memoryStorage()
  const db = createDb(storage, fakeSeed)
  expect(db.read().users).toHaveLength(1)
  expect(JSON.parse(storage.getItem(DB_KEY)!).version).toBe(DB_VERSION)
})
it('reseeds when the saved version differs', () => {
  const storage = memoryStorage({ [DB_KEY]: JSON.stringify({ ...fakeSeed(new Date()), version: 0, users: [] }) })
  expect(createDb(storage, fakeSeed).read().users).toHaveLength(1)
})
it('reseeds and warns on corrupt JSON', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const db = createDb(memoryStorage({ [DB_KEY]: '{not json' }), fakeSeed)
  expect(db.read().users).toHaveLength(1)
  expect(warn).toHaveBeenCalledOnce()
})
it('update writes through and returns the callback result', () => {
  const storage = memoryStorage()
  const db = createDb(storage, fakeSeed)
  expect(db.update((d) => { d.users[0].name = 'Changed'; return 7 })).toBe(7)
  expect(JSON.parse(storage.getItem(DB_KEY)!).users[0].name).toBe('Changed')
})
it('update keeps another instance\'s write', () => {
  const storage = memoryStorage()
  const a = createDb(storage, fakeSeed)
  const b = createDb(storage, fakeSeed)
  a.update((d) => { d.reads.c1 = 'A' })
  b.update((d) => { d.reads.c2 = 'B' })
  expect(a.read().reads).toEqual({ c1: 'A', c2: 'B' })
})
it('keeps working when setItem throws', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const storage = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } }
  const db = createDb(storage, fakeSeed)
  db.update((d) => { d.users[0].name = 'Kept' })
  expect(db.read().users[0].name).toBe('Kept')
  db.update((d) => { d.users[0].name = 'Again' })
  expect(warn).toHaveBeenCalledOnce()
})
it('reset reseeds', () => {
  const db = createDb(memoryStorage(), fakeSeed)
  db.update((d) => { d.users = [] })
  db.reset()
  expect(db.read().users).toHaveLength(1)
})
```

- [ ] **Step 2:** `npx vitest run src/mocks/db.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Write `src/api/types.ts`, `src/lib/apiError.ts`, `src/mocks/latency.ts`, and `src/mocks/db.ts` with the signatures above.
  - `read`/`update` parse storage on every call, so other tabs' writes are seen.
  - If storage can't be written, fall back to an in-memory copy that later reads prefer.
  - `read` returns a `structuredClone` so callers can't mutate stored state.
- [ ] **Step 4:** Run again → PASS. `npm run build` → PASS.
- [ ] **Step 5: Commit** — `git add src/api/types.ts src/lib/apiError.ts src/mocks && git commit -m "feat: API contracts and localStorage mock database"`

---

### Task 4: Seed data (§5.3)

**Files:**
- Create: `src/mocks/seed.ts`
- Test: `src/mocks/seed.test.ts`

**Interfaces:**
- Consumes: `DbData`, `DB_VERSION` (Task 3).
- Produces: `seed(now: Date): DbData` — deterministic for a given `now`; all dates are `now` minus offsets. Fixed ids: users `u-1…u-8` (`u-1` = current user), workspaces `ws-eng` (slug `engineering`) and `ws-design` (slug `design`), projects `p-nex` / `p-mob` / `p-brd`, channels `c-general`, `c-frontend`, `c-backend`, `c-release`, `c-design`, `c-dm-1…3`.

- [ ] **Step 1: Write `src/mocks/seed.test.ts`** (`const data = seed(new Date('2026-10-26T12:00:00Z'))`):

```ts
it('matches the spec volumes', () => {
  expect(data.workspaces.map((w) => w.slug)).toEqual(['engineering', 'design'])
  expect(data.projects.map((p) => p.key)).toEqual(['NEX', 'MOB', 'BRD'])
  expect(data.tickets.filter((t) => t.projectId !== 'p-brd').length).toBeGreaterThanOrEqual(14)
  expect(data.tickets.filter((t) => t.projectId === 'p-brd')).toHaveLength(4)
  expect(data.channels.filter((c) => c.kind === 'channel').map((c) => c.name)).toEqual(
    expect.arrayContaining(['general', 'frontend-dev', 'backend', 'release-v2', 'design']))
  expect(data.channels.filter((c) => c.kind === 'dm')).toHaveLength(3)
  expect(data.channels.some((c) => c.isPrivate)).toBe(true)
  expect(data.messages.length).toBeGreaterThanOrEqual(55)
  expect(data.users).toHaveLength(8)
  expect(data.users.every((u) => u.role === 'Management')).toBe(true)
})
it('covers every status and priority, unassigned, unpointed and sprintless tickets', () => { … })
it('resolves every reference', () => { … })  // projects→workspace/lead, sprints→project, tickets→project/assignee/reporter/sprint/linked message+channel, channels→workspace/members, messages→channel/sender, replies→message/channel/sender, currentUserId→user
it('has unique ids and ticket keys numbered from 101 per project', () => { … })  // keys match /^(NEX|MOB|BRD)-1\d\d$/; counters[p] = max number + 1
it('keeps derived fields consistent', () => { … })  // threadCount = replies count, lastReplyAt = latest reply, linkedTicketKeys = parsed from content, channel.lastMessageAt = latest message/reply
it('has one active and one planned sprint per project', () => { … })
it('puts every message within the last 7 days', () => { … })
```

  Each `…` test asserts exactly what its comment says.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Write `seed()`**
  - Messages: realistic engineering conversation in plain, specific English (e.g. "NEX-104 is blocked on the token refresh endpoint. Backend ETA Thursday.").
  - At least 8 messages mention ticket keys. 4 messages have 2–5 replies. 6 have reactions.
  - One ticket has `linkedChannelId` and `linkedMessageId` pointing at the message it came from.
  - Derive `threadCount`, `lastReplyAt`, `linkedTicketKeys` and `lastMessageAt` with the same helpers Task 6 uses (`parseTicketKeys`, see Task 6). Define `parseTicketKeys` in `src/mocks/text.ts` here, so Task 6 imports it.
  - `reads`: the current user has read everything except 3 messages in `#frontend-dev` and 1 DM.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: seed data for the demo"` (after `git add`)

---

### Task 5: Real-time interface and mock hub (§7)

**Files:**
- Create: `src/lib/realtime.ts`, `src/mocks/realtime.ts`
- Test: `src/mocks/realtime.test.ts`

**Interfaces:**
- Produces (`src/lib/realtime.ts`):
  - `interface RealtimeClient` exactly as §7.
  - `type RealtimeEvent = { type: 'messageReceived'; message: ChatMessage } | { type: 'replyReceived'; reply: ThreadReply } | { type: 'ticketUpdated'; ticket: Ticket } | { type: 'userTyping'; channelId: string; userId: string }`
  - `createRealtimeClient(): RealtimeClient` — returns `createMockRealtimeClient(mockHub)` when `!backendOn`. Otherwise it returns a client whose `start()` warns once: "Real-time over SignalR isn't connected yet." (the `backendOn` import comes from Task 7; until then use `import.meta.env.VITE_BACKEND === 'on'` via a local const, replaced in Task 7).
- Produces (`src/mocks/realtime.ts`):
  - `interface MockHub { publish(event: RealtimeEvent): void; subscribe(listener: (event: RealtimeEvent) => void): () => void; close(): void }`
  - `createMockHub(channelName = 'spark-flow.realtime', Broadcast: typeof BroadcastChannel | undefined = globalThis.BroadcastChannel): MockHub` — `publish` delivers locally and posts to the broadcast channel. Events received from other tabs are delivered locally only, never re-posted.
  - `createMockRealtimeClient(hub: MockHub): RealtimeClient` — `on*` subscribe to the hub filtered by `type`; `join/leaveChannel`, `start/stop` are no-ops that resolve.
  - `export const mockHub = createMockHub()`

- [ ] **Step 1: Write `src/mocks/realtime.test.ts`**

```ts
it('delivers each event type to its handler only', () => { /* publish 4 types; messageReceived handler called once with the message; others not */ })
it('unsubscribe stops delivery', () => { /* off(); publish; handler not called */ })
it('works without BroadcastChannel', () => {
  const hub = createMockHub('t', undefined)
  const seen: string[] = []
  createMockRealtimeClient(hub).onTicketUpdated((t) => seen.push(t.key))
  hub.publish({ type: 'ticketUpdated', ticket: { ...sampleTicket, key: 'NEX-101' } })
  expect(seen).toEqual(['NEX-101'])
})
it('relays between two hubs on the same channel without echo loops', async () => {
  // Node 18+ provides BroadcastChannel. Hub A publishes → hub B's listener is called once; A's listener is called once (local), not twice.
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: realtime client interface and mock hub"` (after `git add`)

---

### Task 6: Mock API (§5.2)

**Files:**
- Create: `src/mocks/text.ts` (if not already created in Task 4), `src/mocks/workspaces.ts`, `src/mocks/users.ts`, `src/mocks/chat.ts`, `src/mocks/tickets.ts`, `src/mocks/dev.ts`, `src/mocks/index.ts`
- Test: `src/mocks/chat.test.ts`, `src/mocks/tickets.test.ts`

**Interfaces:**
- Consumes: `MockDb` (Task 3), `seed` (Task 4), `MockHub` (Task 5), `ApiError`, `delay`.
- Produces:
  - `parseTicketKeys(content: string): string[]` (`/\b[A-Z]{2,5}-\d+\b/g`, unique, in order of appearance).
  - `createMockApi(db: MockDb, hub: MockHub): Api` (`src/mocks/index.ts`). Every method `await delay()` and returns clones. Unknown id or key → `throw new ApiError({ title: 'Not found', status: 404, detail: '<Thing> <id> doesn't exist.' })`.
  - Mutation helpers for Phases 3–4, not on `Api` yet:
    - `sendMessage(db, hub, input: { channelId: string; content: string; attachments?: Attachment[] }): Promise<ChatMessage>`
    - `addReply(db, hub, input: { messageId: string; content: string }): Promise<ThreadReply>`
    - `createTicket(db, hub, input: NewTicket): Promise<Ticket>`
    - `updateTicket(db, hub, key: string, patch: TicketPatch): Promise<Ticket>`
  - Each mutation publishes its event (`messageReceived` / `replyReceived` / `ticketUpdated`; `createTicket` also sends `ticketUpdated`).
  - `getMockApi(): Api` — on first call creates `createDb(window.localStorage, seed)` and `createMockApi(db, mockHub)`, then caches them; tests never call it, so they never touch `window`.
  - In `import.meta.env.DEV` only, `getMockApi()` also sets `window.__sparkFlowDev = { sendMessage, addReply, createTicket, updateTicket }`, bound to that db and hub, for manual and Playwright checks. Declare the global's type in `src/mocks/index.ts`.

- [ ] **Step 1: Write `src/mocks/chat.test.ts`** — `beforeEach`: `latency.min = latency.max = 0`; `db = createDb(memoryStorage(), seed)`; `hub = createMockHub('t', undefined)`; `api = createMockApi(db, hub)`.

```ts
it('pages messages newest first by cursor', async () => {
  const first = await api.chat.messages('c-general')
  expect(first.items.length).toBeLessThanOrEqual(30)                     // page size 30
  expect(first.items[0].createdAt >= first.items[1].createdAt).toBe(true)
  if (first.nextCursor) {
    const next = await api.chat.messages('c-general', first.nextCursor)
    expect(next.items.every((m) => m.createdAt < first.nextCursor!)).toBe(true)
  }
})
it('computes unreadCount for the current user and markRead clears it', async () => {
  const before = (await api.chat.channels('ws-eng')).find((c) => c.id === 'c-frontend')!
  expect(before.unreadCount).toBe(3)
  await api.chat.markRead('c-frontend')
  expect((await api.chat.channel('c-frontend')).unreadCount).toBe(0)
})
it('sendMessage parses ticket keys, bumps lastMessageAt and publishes', async () => {
  const events: RealtimeEvent[] = []; hub.subscribe((e) => events.push(e))
  const m = await sendMessage(db, hub, { channelId: 'c-backend', content: 'NEX-101 and MOB-102, also NEX-101' })
  expect(m.linkedTicketKeys).toEqual(['NEX-101', 'MOB-102'])
  expect((await api.chat.channel('c-backend')).lastMessageAt).toBe(m.createdAt)
  expect(events).toEqual([{ type: 'messageReceived', message: m }])
})
it('addReply updates threadCount, lastReplyAt and the channel', async () => { … })
it('own messages do not count as unread', async () => { … })
it('throws ApiError 404 for an unknown channel', async () => {
  await expect(api.chat.channel('nope')).rejects.toMatchObject({ status: 404 })
})
```

- [ ] **Step 2: Write `src/mocks/tickets.test.ts`**

```ts
it('lists a project\'s tickets ordered by status then rank', async () => { … })
it('gets a ticket by key', async () => { expect((await api.tickets.get('NEX-101')).projectId).toBe('p-nex') })
it('createTicket uses the next number and goes last in its column', async () => {
  const highest = Math.max(...(await api.tickets.list('p-nex')).map((t) => Number(t.key.split('-')[1])))
  const t = await createTicket(db, hub, { projectId: 'p-nex', title: 'Add rate limit', description: '', status: 'todo', priority: 'medium', storyPoints: 3, assigneeId: null, sprintId: null })
  expect(t.key).toBe(`NEX-${highest + 1}`)
  const todo = (await api.tickets.list('p-nex')).filter((x) => x.status === 'todo')
  expect(todo.at(-1)!.key).toBe(t.key)
})
it('updateTicket patches, bumps updatedAt and publishes ticketUpdated', async () => { … })
it('throws ApiError 404 for an unknown key or project', async () => { … })
it('resetDemoData restores the seed', async () => { … })
```

- [ ] **Step 3:** Run both → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS; `npm run build` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: mock API with server-side behaviour"` (after `git add`)

---

### Task 7: `lib/api.ts`, query keys, hooks

**Files:**
- Create: `src/lib/api.ts`, `src/api/queryKeys.ts`, `src/api/workspaces.ts`, `src/api/users.ts`, `src/api/chat.ts`, `src/api/tickets.ts`, `src/api/dev.ts`
- Modify: `src/lib/realtime.ts` (import `backendOn` from `@/lib/api`)
- Test: `src/lib/api.test.ts`, `src/api/queryKeys.test.ts`

**Interfaces:**
- Produces (`src/lib/api.ts`):
  - `backendOn: boolean` (`import.meta.env.VITE_BACKEND === 'on'`)
  - `apiUrl(path: string): string` (`VITE_API_URL` prefix when `backendOn`, else the path)
  - `request<T>(path: string, init?: RequestInit, fetchFn: typeof fetch = fetch): Promise<T>` — non-2xx → reads the ProblemDetails JSON → `ApiError`. If the body isn't JSON → `ApiError({ title: res.statusText || 'Request failed', status: res.status })`. A network failure → `ApiError({ title: "Couldn't reach the server", status: 0 })`.
  - `createHttpApi(fetchFn?: typeof fetch): Api` — the §4.1 HTTP mapping plus `POST /api/channels/{id}/read`; `dev.resetDemoData` rejects with `ApiError` 400 when `backendOn`.
  - `api: Api = backendOn ? createHttpApi() : getMockApi()`
  - Re-exports `ApiError`.
- Produces (`src/api/queryKeys.ts`):
  - `qk = { workspaces: () => ['workspaces'], me: () => ['users', 'me'], users: (wsId) => ['users', wsId], channelsAll: () => ['chat', 'channels'], channels: (wsId) => ['chat', 'channels', wsId], channel: (id) => ['chat', 'channel', id], messages: (channelId) => ['chat', 'messages', channelId], message: (id) => ['chat', 'message', id], replies: (messageId) => ['chat', 'replies', messageId], projects: (wsId) => ['tickets', 'projects', wsId], sprints: (projectId) => ['tickets', 'sprints', projectId], tickets: (projectId) => ['tickets', 'list', projectId], ticket: (key) => ['tickets', 'one', key] } as const`
  - `keysForEvent(event: RealtimeEvent): QueryKey[]`
- Produces (hooks; each is a thin `useQuery` / `useInfiniteQuery` / `useMutation` over `api`, `retry: false` on 404):
  - `useWorkspaces()`, `useWorkspace(slug)` (derived from the list; `null` when unknown)
  - `useMe()`, `useUsers(wsId)`
  - `useChannels(wsId)`, `useChannel(id)`, `useMessages(channelId)` (infinite, `getNextPageParam: (p) => p.nextCursor ?? undefined`), `useMessage(id)`, `useThread(messageId)`
  - `useMarkRead()`
  - `useProjects(wsId)`, `useProject(wsId, key)`, `useSprints(projectId)`, `useTickets(projectId)`, `useTicket(key)`
  - `useResetDemoData()`

- [ ] **Step 1: Write `src/lib/api.test.ts`** — `createHttpApi(fakeFetch)` where `fakeFetch` records URLs and returns canned `Response`s:

```ts
it('maps calls to the HTTP routes', async () => { /* api.chat.messages('c1','2026-10-26T00:00:00Z') → GET /api/channels/c1/messages?cursor=2026-10-26T00%3A00%3A00Z; tickets.get('NEX-101') → /api/tickets/NEX-101; markRead → POST /api/channels/c1/read */ })
it('turns ProblemDetails into ApiError', async () => {
  await expect(request('/api/x', undefined, fakeFetchReturning(404, { title: 'Not found', status: 404, detail: 'Ticket NEX-9 doesn\'t exist.' })))
    .rejects.toMatchObject({ status: 404, message: 'Ticket NEX-9 doesn\'t exist.' })
})
it('handles a non-JSON error body', async () => { /* 502 text/html → ApiError status 502 */ })
it('handles a network failure', async () => { /* fetch rejects → ApiError status 0, title "Couldn't reach the server" */ })
```

- [ ] **Step 2: Write `src/api/queryKeys.test.ts`**

```ts
it('maps events to the keys to invalidate', () => {
  expect(keysForEvent({ type: 'messageReceived', message: { ...m, channelId: 'c1' } })).toEqual([qk.messages('c1'), qk.channelsAll(), qk.channel('c1')])
  expect(keysForEvent({ type: 'replyReceived', reply: { ...r, channelId: 'c1', messageId: 'm1' } })).toEqual([qk.replies('m1'), qk.message('m1'), qk.messages('c1'), qk.channelsAll(), qk.channel('c1')])
  expect(keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })).toEqual([qk.tickets('p1'), qk.ticket('NEX-1')])
  expect(keysForEvent({ type: 'userTyping', channelId: 'c1', userId: 'u2' })).toEqual([])
})
```

- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS; `npm run build && npm run lint` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: typed api switch, query keys and hooks"` (after `git add`)

---

### Task 8: UI store, `RealtimeBridge`, `useRole` from `useMe`

**Files:**
- Create: `src/lib/uiStore.ts`, `src/layout/RealtimeBridge.tsx`
- Modify: `src/lib/useRole.ts`, `src/layout/AppLayout.tsx` (mount `RealtimeBridge`; `collapsed` comes from `useUiStore`)
- Test: `src/lib/uiStore.test.ts`

**Interfaces:**
- Produces (`src/lib/uiStore.ts`):
  - `useUiStore` (Zustand `persist`, name `spark-flow.ui`, `partialize` drops `typing`). State: `sidebarCollapsed: boolean`, `lastWorkspace: string | null`, `lastVisited: Record<string, string>`, `lastProjectView: Record<string, 'board' | 'backlog'>`, `typing: Record<string, { userId: string; until: number }[]>`.
  - Actions: `toggleSidebar()`, `visit(workspaceSlug: string, path: string)` (sets `lastWorkspace` too), `setProjectView(key, view)`, `addTyper(channelId, userId, now = Date.now())` (`until = now + 3000`, replaces that user's entry).
  - Pure: `activeTypers(typing, channelId, now = Date.now()): string[]`.
- Produces (`RealtimeBridge`): `export function RealtimeBridge(): null` — on mount `createRealtimeClient()`, `start()`, subscribes to all four events. Each event: `keysForEvent` → `queryClient.invalidateQueries({ queryKey })`. `userTyping` → `addTyper`. Cleans up on unmount.
- Produces (`useRole`): same return shape `{ persona, role }`. `persona` comes from `useMe()` mapped to `Persona` (`{ id, name, title, role }`). While loading, a placeholder persona `{ id: '', name: '', title: '', role: 'Management' }` so menus still render.

- [ ] **Step 1: Write `src/lib/uiStore.test.ts`**

```ts
it('activeTypers drops expired entries and filters by channel', () => {
  const typing = { c1: [{ userId: 'u2', until: 1_000 }, { userId: 'u3', until: 5_000 }], c2: [{ userId: 'u4', until: 9_000 }] }
  expect(activeTypers(typing, 'c1', 2_000)).toEqual(['u3'])
})
it('addTyper replaces the same user and sets a 3s expiry', () => {
  useUiStore.getState().addTyper('c1', 'u2', 0)
  useUiStore.getState().addTyper('c1', 'u2', 1_000)
  expect(useUiStore.getState().typing.c1).toEqual([{ userId: 'u2', until: 4_000 }])
})
it('visit records last place per workspace', () => {
  useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
  expect(useUiStore.getState()).toMatchObject({ lastWorkspace: 'engineering', lastVisited: { engineering: '/w/engineering/c/c-backend' } })
})
```

  (Zustand `persist` with no `window`: pass `storage: createJSONStorage(() => localStorage)` guarded so that in Node it falls back to memory. Tests must not need jsdom.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run build` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: UI store, realtime bridge, persona from api"` (after `git add`)

---

### Task 9: Routes, landing redirect, shell navigation (§6.1, §6.2)

**Files:**
- Create: `src/lib/paths.ts`, `src/lib/channels.ts`, `src/layout/LastVisitRedirect.tsx`, `src/layout/WorkspaceSwitcher.tsx`, `src/layout/WorkspaceGate.tsx`, `src/pages/NotFound.tsx`, `src/pages/settings/SettingsPage.tsx`
- Modify: `src/router.tsx`, `src/navigation.ts`, `src/layout/Sidebar.tsx`, `src/layout/TopBar.tsx`, `src/layout/MobileNav.tsx`, `src/layout/searchShortcuts.ts`, `src/layout/GlobalSearch.tsx`
- Delete: `src/pages/HomePage.tsx`, `src/pages/PlaceholderPage.tsx`
- Test: `src/lib/paths.test.ts`, `src/lib/channels.test.ts`, `src/layout/searchShortcuts.test.ts`

**Interfaces:**
- Produces (`src/lib/paths.ts`):
  - `paths = { workspace: (ws) => \`/w/${ws}\`, channel: (ws, id) => \`/w/${ws}/c/${id}\`, project: (ws, key, view: 'board' | 'backlog' = 'board') => \`/w/${ws}/p/${key}/${view}\`, settings: (ws) => \`/w/${ws}/settings\` }`
  - `landingPath(workspaceSlug: string, lastVisited: Record<string, string>, channels: Channel[]): string` — returns the saved path if it starts with `/w/<slug>/`. Otherwise `#general`, else the first channel, else settings.
- Produces (`src/lib/channels.ts`):
  - `channelLabel(channel: Channel, users: User[], meId: string): string` — channels: `name`. DMs: the other members' names joined with `, `. Only yourself: `"<your name> (you)"`. Missing user: `"Unknown person"`.
  - `sortChannels(channels: Channel[]): { channels: Channel[]; dms: Channel[] }` — channels A–Z; DMs by `lastMessageAt` desc.
- Produces (`src/layout/searchShortcuts.ts`): `workspaceShortcuts(ws: Workspace, channels: Channel[], projects: Project[], users: User[], meId: string): Shortcut[]`. Channels get `#name`, DMs their label, projects "Name · Board"; `link` uses `paths`. `GlobalSearch` appends these to `pages`.
- Produces (`LastVisitRedirect`):
  - Workspace = `useParams().ws`, else `lastWorkspace`, else the first workspace (each checked against `useWorkspaces()`).
  - Then `useChannels(ws.id)` → `<Navigate to={landingPath(ws.slug, lastVisited, channels)} replace />`.
  - While loading: the `AppLayout` Suspense-style pulse block.
- Produces (`WorkspaceGate`): route element for `/w/:ws`. Unknown slug → `<Navigate to="/" replace />`. Known slug → `<Outlet />` and records `visit(slug, location.pathname)` on every location change.
- Routes (`router.tsx`), all under `AppLayout`:
  - `/` → `LastVisitRedirect`
  - `/w/:ws` → `WorkspaceGate`, with children:
    - `index` → `LastVisitRedirect`
    - `c/:channelId` → `ChannelPage` (Task 10)
    - `p/:projectKey` → redirect to `board`
    - `p/:projectKey/:view` → `ProjectPage` (Task 10)
    - `settings` → `SettingsPage`
  - `*` → `/`
  - Until Task 10, `ChannelPage` and `ProjectPage` are one-line `PageHeader` stubs so this task builds.
- `navigation.ts`: `navGroups` becomes `[]`. `settingsItem.path` is resolved per workspace in the Sidebar. `mobilePrimaryPaths` is removed; the bottom bar is built in `MobileNav`.
- `SettingsPage`: `PageHeader` "Settings" / "Demo data and preferences.". A card "Demo data": one-line explanation and `Button` (secondary) "Reset demo data" → "Resetting…" while pending → `queryClient.clear()` → navigate `/`. Hidden when `backendOn`.
- `NotFound`: `NotFound({ what, backTo, backLabel }: { what: 'channel' | 'project' | 'ticket' | 'message'; backTo: string; backLabel: string })` → "This <what> doesn't exist or was removed." plus a back link.

- [ ] **Step 1: Write the three test files**

```ts
// paths.test.ts
it('landingPath uses the saved place for that workspace', () => {
  expect(landingPath('engineering', { engineering: '/w/engineering/p/NEX/backlog' }, chans)).toBe('/w/engineering/p/NEX/backlog')
})
it('landingPath ignores a saved place from another workspace', () => {
  expect(landingPath('design', { design: '/w/engineering/c/c-backend' }, designChans)).toBe('/w/design/c/c-design')
})
it('landingPath falls back to #general, then the first channel, then settings', () => { … })
// channels.test.ts
it('names a DM after the other member', () => { expect(channelLabel(dm(['u-1', 'u-2']), users, 'u-1')).toBe('Nour Adel') })
it('names a DM with yourself "<name> (you)"', () => { expect(channelLabel(dm(['u-1']), users, 'u-1')).toBe('Omar Khaled (you)') })
it('names an unknown member "Unknown person"', () => { expect(channelLabel(dm(['u-1', 'u-99']), users, 'u-1')).toBe('Unknown person') })
it('sorts channels A–Z and DMs by latest message', () => { … })
// searchShortcuts.test.ts
it('offers channels, DMs and project boards of the workspace', () => {
  const s = workspaceShortcuts(ws, chans, projects, users, 'u-1')
  expect(s.map((x) => x.title)).toEqual(expect.arrayContaining(['#general', 'Nour Adel', 'Nexus Core · Board']))
  expect(s.find((x) => x.title === '#general')!.link).toBe('/w/engineering/c/c-general')
})
```

  (Names in fixtures are whatever Task 4 seeded for `u-1` / `u-2`; take them from `seed()`.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement the pure functions. **Step 4:** Run → PASS.
- [ ] **Step 5: Shell UI** —
  - **Sidebar:** group labels `CHANNELS`, `DIRECT MESSAGES`, `PROJECTS`, built from `useChannels` / `useProjects` / `useUsers` of the workspace in the URL (`useParams().ws`, else `lastWorkspace`).
    - Rows reuse `SidebarLink` styling (generalise it to take `{ to, label, icon, badge }`).
    - Channel icon `Hash` (`Lock` if private). DM icon: presence dot. Project icon `FolderKanban` → `paths.project(ws, key, lastProjectView[key])`.
    - Unread uses the existing brand counter pill. Settings is pinned at the bottom. Collapsed mode keeps icons and titles.
    - While loading: 3 pulse rows per group (`bg-white/5`).
  - **WorkspaceSwitcher:** copy `design/reference-code/src/layout/MarketSwitcher.tsx`'s button + `MenuPanel` structure. The button shows workspace initials. The menu has eyebrow `WORKSPACE`, a row per workspace with a check on the current one, and picking one → `navigate(landingPath(...))`. Placed in `TopBar` between `NotificationsMenu` and `UserMenu`.
  - **MobileNav bottom bar:**
    - `Chat` (`MessagesSquare`) → last channel, or the landing path.
    - `Projects` (`FolderKanban`) → last project path, or the first project board.
    - `Search` (opens `PhoneSearch`; reuse its open handler).
    - `More` → drawer, which renders `SidebarContent`.
- [ ] **Step 6:** `npm run build && npm run lint && npm test` → PASS. Then `npm run dev`:
  - `/` lands on `/w/engineering/c/c-general`.
  - The switcher moves to Design.
  - An unknown `/w/nope` redirects to `/`.
  - Settings → "Reset demo data" returns to `/` with the seed restored.
- [ ] **Step 7: Commit** — `git commit -m "feat: workspace routes, sidebar groups, switcher, settings"` (after `git add -A`)

---

### Task 10: Pages and inspector (§6.2, §6.3, §8)

**Files:**
- Create: `src/lib/inspector.ts`, `src/layout/Inspector.tsx`, `src/pages/chat/ChannelPage.tsx`, `src/pages/chat/MessageRow.tsx`, `src/pages/chat/ThreadInspector.tsx`, `src/pages/projects/ProjectPage.tsx`, `src/pages/projects/TicketRow.tsx`, `src/pages/projects/TicketInspector.tsx`, `src/components/ui/QueryError.tsx`
- Modify: `src/layout/AppLayout.tsx` (mount `Inspector` beside the content panel), `src/router.tsx` (replace Task 9 stubs)
- Test: `src/lib/inspector.test.ts`

**Interfaces:**
- Produces (`src/lib/inspector.ts`):
  - `type InspectorTarget = { kind: 'thread'; messageId: string } | { kind: 'ticket'; key: string }`
  - `parseInspector(search: URLSearchParams): InspectorTarget | null` — `ticket` wins if both are present. The key is trimmed and upper-cased. Empty values → `null`.
  - `withInspector(search: URLSearchParams, target: InspectorTarget | null): URLSearchParams` — sets one param, clears the other, leaves other params.
- Produces (`QueryError`): `QueryError({ what, onRetry }: { what: string; onRetry: () => void })` → "<What> didn't load." + text button "Try again". A 404 `ApiError` is handled by the caller with `NotFound` instead.
- Produces (`Inspector`): reads `parseInspector`. Renders nothing when `null`; otherwise a frame with:
  - eyebrow `THREAD · #<CHANNEL>` or `TICKET · <KEY>`
  - title: first line of the parent message (60 chars max) or the ticket title
  - ✕ and `Escape` → `setSearchParams(withInspector(params, null))`
  - body: `ThreadInspector` or `TicketInspector`
  - Sizes and classes exactly as §6.3 (`xl` beside, `sm–lg` slide-over with `animate-slide-in-end`, phone bottom sheet).
- `ChannelPage`:
  - `PageHeader` title `#name` or the DM label, subtitle = topic, or `—`.
  - `useMarkRead` on open and when `channelId` changes; `realtime.joinChannel` / `leaveChannel`.
  - The message list is newest at the bottom: avatar initials, name, `formatWhen(createdAt)`, content. Ticket keys in content render as `<bdi>`. Reactions show as "👍 2" pills. "3 replies · 2h ago" is a link setting `?thread=`. "Load older messages" button when `hasNextPage`.
  - Skeleton: 6 pulse rows. 404 → `NotFound`.
- `ProjectPage`:
  - `PageHeader` title = project name, subtitle = description.
  - Actions: a Board | Backlog segmented control (style as `design/screenshots/07-opportunities-board.png`) linking to the two routes and calling `setProjectView`.
  - Board (read-only): five status columns, each with header label, count pill and total points; `TicketRow` cards set `?ticket=`; columns scroll horizontally.
  - Backlog (read-only): tickets grouped by sprint (active, planned, then "No sprint"), rows with key, title, status pill, priority, assignee initials, points.
  - Status pills use the §tokens pattern: backlog neutral, todo sky, inProgress amber, inReview violet, done emerald. Priority: urgent red, high amber, medium sky, low neutral.
  - Unknown `:view` → redirect `board`. 404 → `NotFound`.
- `ThreadInspector`: parent `MessageRow` + replies via `useThread`; 404 → `NotFound what="message"`.
- `TicketInspector`: status, priority, assignee, reporter, sprint, points (`—` when null), description, created/updated (`formatDate`); 404 → `NotFound what="ticket"`.

- [ ] **Step 1: Write `src/lib/inspector.test.ts`**

```ts
it('reads a thread', () => { expect(parseInspector(new URLSearchParams('thread=m-1'))).toEqual({ kind: 'thread', messageId: 'm-1' }) })
it('normalises ticket keys', () => { expect(parseInspector(new URLSearchParams('ticket=%20nex-101%20'))).toEqual({ kind: 'ticket', key: 'NEX-101' }) })
it('prefers ticket when both are present, ignores empty values', () => { … })
it('withInspector swaps params and keeps others', () => {
  expect(withInspector(new URLSearchParams('q=a&thread=m-1'), { kind: 'ticket', key: 'NEX-1' }).toString()).toBe('q=a&ticket=NEX-1')
  expect(withInspector(new URLSearchParams('q=a&ticket=NEX-1'), null).toString()).toBe('q=a')
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `inspector.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Build the components above.
- [ ] **Step 6:** `npm run build && npm run lint && npm test` → PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat: channel and project pages with inspector"` (after `git add -A`)

---

### Task 11: CLAUDE.md, full verification, review notes

**Files:**
- Modify: `CLAUDE.md`, `tasks/todo.md`

- [ ] **Step 1: `CLAUDE.md`** — add three lines to the hard rules:
  - **RTL-ready:** logical direction classes only (`ms-/me-/ps-/pe-/start-/end-/text-start/border-s…`); directional icons `rtl:-scale-x-100`; `src/rtl.test.ts` enforces it.
  - **Voice** (from `spark-design-system.md`): specific, numbers over adjectives, no buzzwords, short active sentences, Western digits.
  - **Charts:** red for the key series plus greys, max 4 series, takeaway in the title, no other hues.
  - Add a "Data" line: components import hooks from `@/api/*` only; `mocks/` is reached only through `lib/api.ts`.
  - Add `npm test` / `npx vitest run <file>` to commands.
- [ ] **Step 2: Gates** — `npm run build && npm run lint && npm test`. Expected: all pass, no warnings.
- [ ] **Step 3: Playwright on `npm run dev`** — run each check and record the result:
  1. 1440px light: `/` → `#general`; sidebar groups CHANNELS / DIRECT MESSAGES / PROJECTS; `#frontend-dev` shows unread 3, which clears after opening.
  2. Workspace switcher → Design: sidebar shows `#design` and Brand Refresh; back to Engineering lands on the last place.
  3. Nexus Core → Board (5 columns) → Backlog (grouped by sprint); the choice is remembered in the sidebar link.
  4. Click a card → inspector beside the content (`TICKET · NEX-…`); `Escape` closes; back button reopens; `?ticket=nex-101` opens `NEX-101`; `?ticket=NEX-999` shows "This ticket doesn't exist or was removed."
  5. Message "N replies" → thread inspector; 1100px → it slides over without dimming.
  6. Refresh → same page and data; Settings → Reset demo data → back at `/`, unread counts restored.
  7. Second tab: in tab A run `await window.__sparkFlowDev.sendMessage({ channelId: 'c-backend', content: 'Deploy at 4 PM. NEX-101 goes out first.' })`. Tab B, open on `#backend`, shows it without a refresh; with B on another channel, B's `#backend` unread count goes up.
  8. Dark mode: repeat 1, 3 and 4 visually.
  9. 390px: bottom bar Chat · Projects · Search · More; inspector as a bottom sheet; no horizontal scroll except the board columns.
  10. `document.documentElement.dir = 'rtl'`: sidebar on the right, inspector on the left, chevrons flipped, nothing overlapping.
  11. Console: no errors or warnings.
- [ ] **Step 4: `tasks/todo.md`** — add a "Phase 1 + 2 — 2026-10-26" section: plan link, checked items, a review with each gate and Playwright result, anything left out on purpose.
- [ ] **Step 5: Commit** — `git commit -am "docs: Phase 1+2 rules and review"`
