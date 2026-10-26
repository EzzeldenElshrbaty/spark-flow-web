# M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the company-system foundation under the Phases 1+2 app: an IndexedDB mock store that never loses a
cross-tab write, the new contracts and seed, four roles with "View as" and permission checks, a Database page
(export / reload seed / reset), and a safe FileViewer.

**Architecture:**
- The mock backend's `MockDb` becomes async and sits on a `MockStore`: IndexedDB in the browser, memory in tests or
  when IndexedDB is blocked.
- Every write is one `readwrite` transaction on a single document record, so the browser serialises writes across
  tabs. File bytes live in a second object store.
- Contracts grow per spec §3. Permissions are one pure module, used by the mock API (403) and the UI (hide).

**Tech Stack:** existing (React 19, Vite 8, TS 6, Tailwind v4, TanStack Query, Zustand, Vitest) + dev `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md` (§ numbers below refer to it).
Phases 1+2 spec stays valid where this one doesn't change it.

All paths relative to `spark-flow-web/`. Branch: `feat/company-system` (spec already committed as `e42a1e1`).

## Global Constraints

- `CLAUDE.md` rules bind every change. Most relevant here:
  - semantic tokens only; light, dark and 390px must all work
  - `Sheet` / `MenuPanel` / `DeleteDialog` only; no toasts or spinners
  - microcopy in sentence case, verb-first, `…` for pending
  - logical direction classes only (`src/rtl.test.ts`)
  - components import `@/api/*` hooks only, never `@/mocks`
- Erasable TypeScript only. `@/` imports.
- Gates: `npm test && npm run build:prototype && npm run lint`. Plain `npm run build` is meant to fail without
  `VITE_BACKEND` and `VITE_API_URL`.
- IndexedDB:
  - database `spark-flow.mock`, version `1`
  - object stores `doc` (key `'main'`) and `files` (key = attachment id, value `Blob`)
  - an `update` callback is synchronous: no `await` inside a transaction
- Old `localStorage` keys starting `spark-flow.mockdb.v1` are removed on first start.
- Roles are exactly `'admin' | 'sales' | 'pm' | 'member'`. Permissions follow spec §4.3; the mock throws `ApiError`
  `{ title: 'Forbidden', status: 403, detail: "You don't have access to <thing>." }`.
- "View as" and the Database page's mock actions are hidden when `backendOn`.
- `safeFileUrl` allows only same-origin, `https:` and `blob:` URLs. PDFs are previewed only after a `%PDF-`
  signature check.
- Mock latency stays 150–300 ms on every `Api` method.
- Seed voice: specific, numbers over adjectives, no buzzwords, Western digits.
- No new runtime dependencies. One new dev dependency: `fake-indexeddb`.

## Review Focus

1. **IndexedDB blocked or throwing on open** (old Safari private mode, a locked profile) → the app works from memory
   and warns once. Test: Task 1 `store.test.ts › falls back to memory when indexedDB.open throws`.
2. **Two tabs writing at the same moment** → both writes survive. Test: Task 1 `store.test.ts › two connections
   writing concurrently keep both writes`.
3. **"View as" a role that can't see the current page** (for example a Member on the Database page) → a sentence
   with a link home, never a crash or a blank page. Test: Task 5 `permissions.test.ts › member cannot open database`,
   plus a browser check in Task 7.
4. **Importing a malformed or other-version export** → rejected with a sentence, and nothing is written. Test:
   Task 2 `db.test.ts › importAll rejects bad bundles without writing`.
5. **A browser that still holds Phase 1+2 `localStorage` data** → keys removed, the app starts from the seed with
   no console errors. Test: Task 3 `db.test.ts › removes legacy localStorage keys on first start`, plus a browser
   check in Task 7.

---

### Task 1: `MockStore` — IndexedDB + memory

**Files:** Create `src/mocks/store/types.ts`, `src/mocks/store/idbStore.ts`, `src/mocks/store/memoryStore.ts`, `src/mocks/store/index.ts`; Test `src/mocks/store/store.test.ts`; Modify `package.json` (dev `fake-indexeddb`).

**Interfaces — Produces:**
```ts
export interface MockStore {
  readDoc(): Promise<unknown | null>                       // the 'main' record, or null
  transact<T>(fn: (doc: unknown | null) => { doc: unknown; result: T }): Promise<T> // one readwrite txn
  getFile(id: string): Promise<Blob | null>
  putFile(id: string, blob: Blob): Promise<void>
  clearAll(): Promise<void>                                 // both stores
  kind: 'indexeddb' | 'memory'
}
export function createIdbStore(factory?: IDBFactory): Promise<MockStore> // rejects if open fails
export function createMemoryStore(): MockStore
export async function openStore(factory?: IDBFactory | undefined): Promise<MockStore> // idb, else memory + console.warn once
```

- [ ] **Step 1:** `npm i -D fake-indexeddb` (sandbox disabled for npm). Then write `store.test.ts`. Use
  `import { IDBFactory } from 'fake-indexeddb'` and a fresh `new IDBFactory()` per test.

```ts
it('readDoc is null on a new database, then returns what transact wrote', async () => { … })
it('transact passes the current doc and stores the returned one atomically', async () => { … })
it('two connections writing concurrently keep both writes', async () => {
  const f = new IDBFactory(); const a = await createIdbStore(f); const b = await createIdbStore(f)
  await a.transact(() => ({ doc: { n: [] }, result: null }))
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).transact((d) => ({ doc: { n: [...(d as { n: number[] }).n, i] }, result: null }))))
  expect(((await a.readDoc()) as { n: number[] }).n.sort((x, y) => x - y)).toEqual([...Array(20).keys()])
})
it('a throwing fn aborts the transaction and stores nothing', async () => { … })
it('putFile/getFile round-trips a Blob; clearAll empties both stores', async () => { … })
it('falls back to memory when indexedDB.open throws', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const broken = { open: () => { throw new Error('SecurityError') } } as unknown as IDBFactory
  expect((await openStore(broken)).kind).toBe('memory'); expect(warn).toHaveBeenCalledOnce()
})
it('memory store behaves like the idb store for the same calls', async () => { … }) // shared contract suite run against both
```

- [ ] **Step 2:** `npx vitest run src/mocks/store/store.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.**
  - Open with `onupgradeneeded` creating the `doc` and `files` stores.
  - `transact` = `db.transaction('doc','readwrite')`, then `get('main')`; call `fn` synchronously in `onsuccess`;
    then `put(doc,'main')`; resolve on `oncomplete`. If `fn` throws → `txn.abort()` and reject with that error.
  - Memory store: a plain `Map` holding `structuredClone`s.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(mocks): IndexedDB mock store with memory fallback`.

---

### Task 2: Contracts + roles

**Files:**
- Modify `src/api/types.ts`:
  - the spec §3 types
  - `Role` → the 4 roles
  - `User.teamIds`
  - the new `Project` fields
  - `Task` = `Ticket` + new fields
  - `ChatMessage` / `ThreadReply` `.mentions`
  - M0 `Api` additions: `db: { export(): Promise<ExportBundle>; reloadSeed(): Promise<void>; reset(): Promise<void> }`,
    `users.viewAs(userId): Promise<User>`, `files.url(id): Promise<string>`
- Modify `src/lib/roles.ts`: `roles = ['admin','sales','pm','member']`, plus `roleLabels`: Admin, Sales,
  Project manager, Member.
- Modify `src/lib/useRole.ts`: placeholder role `member`.
- Modify `src/mocks/db.ts`: `DbData` gains every §3 collection and `DB_VERSION = 2`.
- Modify `src/mocks/seed.ts`: fills the new collections with **empty arrays** and maps the 8 users onto the 4 roles.
  Task 4 writes the real story.
- Fix the compile errors the role change causes in `navigation.ts`, `useSidebarGroups.ts` and `searchShortcuts.ts`:
  `Management` → `admin`, so Settings is visible to admin only.

**Interfaces — Produces:**
- The §3 types verbatim, with `Task` exported as an alias. Existing `Ticket` names keep compiling, so Phase 1+2
  pages are untouched apart from `role` values.
- `ExportBundle = { app: 'spark-flow'; version: number; exportedAt: string; data: DbData }`. Files are metadata only
  (spec §10).

- [ ] **Step 1:** extend `seed.test.ts`:
  - `roles cover all four`
  - `new collections exist`
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npm test && npm run build:prototype && npm run lint` → PASS.
- [ ] **Step 5:** commit `feat: company-system contracts and roles`.

---

### Task 3: Async `MockDb` on the store; mock API async; export / import; legacy cleanup

**Files:** Rewrite `src/mocks/db.ts`; Rewrite `src/mocks/db.test.ts`; Modify every `src/mocks/*.ts` module to `await db.read()` / `await db.update()` and their tests to `await`; Create `src/api/db.ts` hooks (`useExportData`, `useReloadSeed`, `useResetDemo`) and mock `db` + `users.viewAs` + `files.url` (`URL.createObjectURL(blob)`); Delete `src/api/dev.ts`, `src/mocks/dev.ts` (→ `src/mocks/dbApi.ts`); Delete `src/mocks/memoryStore.ts`, `src/mocks/testing.ts` (+ update `tsconfig.*` includes); Modify `src/mocks/index.ts` (async init).

**Interfaces — Consumes:** `MockStore`, `openStore` (Task 1); `DbData`, `ExportBundle`, `Api` (Task 2). **Produces:**
```ts
export interface MockDb {
  read(): Promise<DbData>
  update<T>(fn: (data: DbData) => T): Promise<T>   // fn synchronous; one transaction
  getFile(id: string): Promise<Blob | null>
  putFile(id: string, blob: Blob): Promise<void>
  reset(): Promise<void>                            // clearAll + seed (+ seed files)
  exportAll(): Promise<ExportBundle>
  importAll(bundle: unknown): Promise<void>         // validates, then one transaction; throws ApiError 400 on bad input
}
export function createDb(store: MockStore, seed: (now: Date) => SeedResult, now?: () => Date): MockDb
export type SeedResult = { data: DbData; files: Record<string, { mimeType: string; base64: string }> }
export function removeLegacyStorage(storage: Pick<Storage,'length'|'key'|'removeItem'> | undefined): void
```

**Behaviour:**
- A missing doc, an older version, or a wrong shape → reseed inside the same transaction, then write the seed files.
- A newer version → work in memory and warn once. This is the same rule as Phase 1+2 Ruling V(b).
- `reads` lives in the document again (Ruling T's per-key workaround is retired).
- `getMockApi()` becomes `getMockApi(): Api` with lazy async init. Each `Api` method awaits one shared `ready`
  promise (open store → createDb → removeLegacyStorage(window.localStorage)) before it runs.

- [ ] **Step 1: Tests in `db.test.ts`** (memory store, plus fake-indexeddb where the test says so). Also:
  - `users.test.ts › viewAs switches currentUserId and me() follows`
  - `users.test.ts › viewAs unknown user → 404`

```ts
it('seeds on an empty store and writes seed files', async () => { … })
it('reseeds an older or wrong-shape doc; keeps a newer one in memory and warns once', async () => { … })
it('update returns fn result, persists, and a throwing fn stores nothing', async () => { … })
it('concurrent updates from two dbs on one fake-indexeddb factory keep both changes', async () => { … })
it('exportAll → reset → importAll restores the same data', async () => { … })
it('importAll rejects bad bundles without writing', async () => {
  for (const bad of [null, {}, { app: 'other' }, { app: 'spark-flow', version: 99, data: {} }, { app: 'spark-flow', version: 2, data: { users: 'x' } }])
    await expect(db.importAll(bad)).rejects.toMatchObject({ status: 400 })
  expect(await db.read()).toEqual(before)
})
it('removes legacy localStorage keys on first start', () => { /* map-backed fake with spark-flow.mockdb.v1 and .read.c-x and an unrelated key → only the unrelated key remains */ })
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 4b:** full gates.
- [ ] **Step 5:** commit `feat(mocks): async MockDb on IndexedDB with export/import`.

---

### Task 4: Seed rewrite (spec §6 personas and story)

**Files:** Rewrite `src/mocks/seed.ts` (+ `src/mocks/seedFiles.ts` with small base64 files: a 1×1 PNG screenshot placeholder, a 1-page PDF, a short `.txt`); Rewrite `src/mocks/seed.test.ts`.

**Interfaces — Produces:** `seed(now: Date): SeedResult`, deterministic for a given `now`.
- **People:** `u-1` Admin (current user at start), `u-2` Sales, `u-3` and `u-4` PMs, `u-5`…`u-8` Members.
- **Teams:** `t-frontend`, `t-backend`, `t-qa`.
- **Projects** (all in `ws-eng`):

  | Project | Methodology | Status | Notes |
  |---|---|---|---|
  | `NEX` Nexus Core | agile | active | has sprints; PM `u-3` |
  | `MOB` Mobile App | waterfall | active | **overdue**: a phase past due, tasks over estimate; PM `u-4` |
  | `ELM` El Moasser portal | waterfall | delivered | all phases done |
  | `SEL` Sela booking | waterfall | planned | just sold by `u-2`, Analysis phase only |

  `ws-design` keeps `BRD`.
- **Each project:**
  - phases Analysis → Design → Build → QA → Delivery, as applicable
  - 2–4 deliverables
  - 6–12 tasks with `phaseId`, a mix of `dueAt` / `estimateHours`, 2+ bugs
  - a project channel `c-p-<key>`
- **Activity:**
  - 5 working days of check-ins (Sun–Thu; Fri and Sat off, per the voice note) and time entries for each member
  - rates for everyone (EGP 180–650/h)
  - comments and bugs on tasks, one with the PNG attachment
  - project files: the PDF + TXT on `MOB`
  - general channels kept, re-worded

- [ ] **Step 1: `seed.test.ts`:**
  - Volumes as listed.
  - Every foreign key resolves, including `phaseId`, `teamIds`, attachments → `files`, `project.channelId`.
  - Every ticket key mentioned in a message or comment exists and **was created before that message**. This fixes the
    Phase 1+2 narrative minor.
  - No two messages in a channel share `createdAt`.
  - Time entries never overlap per user.
  - No entries on Fri/Sat.
  - At most one open (running) entry per user. The seed has none open.
  - `MOB` has ≥1 overdue task by both rules (date and estimate).
  - Determinism: same `now` → equal output.
- [ ] **Step 2:** run → FAIL. **Step 3:** write the seed. **Step 4:** run → PASS; full gates.
- [ ] **Step 5:** commit `feat(mocks): company-system seed story`.

---

### Task 5: Permissions + View as

**Files:**
- Create `src/lib/permissions.ts`; Test `src/lib/permissions.test.ts`.
- Modify `src/mocks/shared.ts` (`forbidden(thing)`), `src/mocks/users.ts` (viewAs), `src/layout/UserMenu.tsx`
  ("View as" section), `src/navigation.ts` and `src/layout/useSidebarGroups.ts` (hide by permission).

**Interfaces — Produces:**
```ts
export type Action =
  | 'rates.view' | 'cost.view' | 'project.create' | 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'
  | 'time.logOwn' | 'collab.post' | 'dashboard.view' | 'timeCost.view' | 'database.manage'
export type PermissionContext = { userId: string; role: Role; project?: Pick<Project, 'managerId' | 'memberIds' | 'teamIds'>; userTeamIds?: string[]; taskAssigneeId?: string | null }
export function can(action: Action, ctx: PermissionContext): boolean
export function usePermission(): (action: Action, project?: …) => boolean // reads useRole
```

- [ ] **Step 1: `permissions.test.ts`:** a table test covering every cell of spec §4.3. For example:
  - admin can do everything
  - sales: `project.create` yes, `rates.view` no
  - a PM can manage tasks on a project they manage but not on another
  - a member can update the status of their own task but not someone else's
  - `member cannot open database`
- [ ] **Step 2:** FAIL. **Step 3:** implement:
  - `can`
  - mock `users.viewAs`
  - UserMenu "View as": a `MenuPanel` section listing seeded people as "Name · Role", with a check on the current
    person. Picking one calls `viewAs`, then `queryClient.clear()`, then navigates to `/w/<ws>`. Hidden when `backendOn`.
- [ ] **Step 4:** PASS + gates. **Step 5:** commit `feat: roles, permissions and View as`.

---

### Task 6: Database page + safe files

**Files:**
- Create:
  - `src/pages/settings/DatabasePage.tsx`
  - `src/lib/safeFileUrl.ts` (+ test)
  - `src/lib/pdfSignature.ts` (+ test)
- Modify:
  - `src/pages/settings/SettingsPage.tsx`: the "Demo data" card becomes a link card "Database" → the new page;
    shown only with `database.manage`
  - `src/router.tsx`: `settings/database`
  - `src/components/ui/FileViewer.tsx`: PDF via the signature check + `blob:`; every `src`/`href` through
    `safeFileUrl`; failure copy "This file can't be previewed. Download it instead."

**Database page** (spec §5, copy `16-settings`). Title "Database", subtitle "Demo data in this browser." Three
cards:
- **Export data:** "Downloads every record as one JSON file." Button "Export data" downloads
  `spark-flow-export-YYYY-MM-DD.json` via a `blob:` link.
- **Reload seed data:** "Replaces everything with the sample company." Button "Reload seed data".
- **Reset:** "Deletes everything in this browser, then loads the sample company again." Danger button "Reset data"
  opens a `DeleteDialog` with confirm "Reset data".

After reload or reset: `queryClient.clear()` and navigate to `/`. Without `database.manage` the page shows
"You don't have access to the database." with a link to Home.

- [ ] **Step 1: Tests:**
  - `safeFileUrl`: same-origin relative, `https:` and `blob:` → kept; `javascript:`, `data:`, `http:` (cross-origin)
    and `vbscript:` → `null`.
  - `isPdf(bytes)`: true only for a `%PDF-` prefix.
  - `db.export` returns the bundle shape (mock API test).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + gates.
- [ ] **Step 5:** commit `feat: Database page; safe file previews`.

---

### Task 7: Verify M0 + docs

**Files:** Modify `CLAUDE.md` (Data line: IndexedDB store; roles; permissions module), `tasks/todo.md` (M0 section: plan link, checklist, review).

- [ ] **Step 1:** gates. `npm test && npm run build:prototype && npm run lint` → all pass.
- [ ] **Step 2: Browser checks (controller, preview pane):**
  1. Fresh profile and a profile with Phase 1+2 `localStorage`: both start, legacy keys are gone, no console errors.
  2. View as each role:
     - Admin sees Settings → Database.
     - A Member on `/w/engineering/settings/database` sees the access sentence.
  3. Database:
     - Export downloads JSON that parses.
     - Reload seed restores data.
     - Reset (confirm) restores data.
  4. Two tabs: dev helper sends in tab A while tab B is opening a channel (the Phase 1+2 lost-write sequence). The
     message survives in both tabs. Repeat 3 times.
  5. FileViewer (seeded `MOB` PDF + PNG once M1 shows files):
     - via `__sparkFlowDev` or a temporary harness: PDF previews; a renamed non-PDF shows the download sentence.
     - Otherwise covered by unit tests now and in the M1 browser check.
  6. Light, dark, 390px and RTL on the Database page.
- [ ] **Step 3:** record results in `tasks/todo.md`; commit `docs: M0 rules and review`.
