# Channel bookmarks on their own row on phones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone (below 768 px), a channel's bookmarks sit on their own full-width row under the tabs, and Add a bookmark moves into Channel actions (⋮). Today they are squeezed into a strip about 19 px wide after the tabs, which leaves them and + scrolled out of view.

**Architecture:**
- `ChannelTabs` keeps one strip.
  - From 768 px up, nothing changes: the tabs, a separator, the bookmarks, then +.
  - Below 768 px, the container stacks (`max-md:flex-col`). The strip becomes its own 44 px row on the 16 px gutter, the separator is hidden, and the row is drawn only when there are bookmarks. + is not drawn on phones (`usePhone`).
- `ChannelHeader` adds "Add a bookmark" to its ⋮ menu on phones only, the same way the topic moves there (`phone && …`). It opens the same `AddBookmarkDialog` through its own state, so neither component's API changes shape. Each gets the same save function from `ChannelPage`.

**Tech Stack:** React 19, Tailwind v4, Vitest (jsdom for unit tests, Chromium for browser tests), `@tabler/icons-react`.

**Spec:** `docs/flow-chat/FLOW_CHAT_REDESIGN.md` §6.1 (tab row: "Messages, Files, Pins (with count), Page, a separator, then bookmarks, then +") and §6.16 (phones: things the header can't hold move into the channel's more menu; touch targets 44 px). The design question comes from `tasks/todo.md` → "Review — UX Phase 6" → "Open design question".

**Branch:** `fix/chat-bookmark-row`, cut from dev `ea3458a` in the `.worktrees/ux-phase-6` worktree (Phase 6 has landed, so it's free).

## Layout

```
Phone 390 px — today                     Phone 390 px — after (Q1 = A)
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ # general ☆           🔔  🔍  ⋮  │     │ # general ☆           🔔  🔍  ⋮  │ ⋮ → … Copy link
├──────────────────────────────────┤     ├──────────────────────────────────┤      + Add a bookmark
│ Messages Files Pins Page │▏      │     │ Messages  Files  Pins  Page      │      Mark all read …
│                         19 px    │     ├──────────────────────────────────┤
│ (bookmarks and + out of view)    │     │ 🔗 Runbook  🔗 API dashboard  🔗 …│ ← 44 px row, only with
└──────────────────────────────────┘     ├──────────────────────────────────┤   bookmarks; scrolls
                                         │ messages …                       │   sideways in itself
                                         └──────────────────────────────────┘
768 px and up: unchanged — tabs │ bookmarks +
```

## Questions for you

- **Q1. A phone channel with no bookmarks.**
  - **A (recommended):** no row. "Add a bookmark" is in ⋮ Channel actions, and the row appears once a bookmark exists, listing only bookmarks. This saves 44 px of message space on every channel without bookmarks, which is every seeded one. It also follows §6.16, which moves the topic into ⋮ on phones.
  - **B:** always draw the row with + at its end, wherever I may add. Adding works as it does on a laptop, but every channel I can post in has 44 px less room for messages.
- **Q2. Execution:** Native (recommended): two small tasks that share one save function, plus a single final review.

## Global Constraints

- Phone means below 768 px: `usePhone()` (`(max-width: 767px)`) for what is offered, `max-md:` classes for layout.
- Touch targets are 44 px on phones. Bookmark links already have `max-md:h-11`, and Channel actions' menu is a bottom sheet on phones.
- Use only logical direction classes (`ps-/pe-/px-`), as `src/rtl.test.ts` enforces.
- Microcopy: "Add a bookmark" (sentence case, verb first), the same words as the + button's label and the dialog's title.
- The menu item's icon is `IconPlus`, because `IconBookmark` already means Saved (sidebar, message toolbar) and `IconLink` is Copy link.
- No page may scroll sideways at 390 px; `src/test/uxChecks.ts` `sidewaysScroll` checks it.

## Review Focus

1. **A long title or many bookmarks on a phone.** The row scrolls sideways inside itself, and the page never scrolls sideways. Covered in Task 1's browser test (8 bookmarks, one with an 80-character title).
2. **Going from laptop width to phone width while Add a bookmark is open from +.** The + goes away, but the dialog stays open with what was typed. Covered in Task 1's browser test.
3. **The row appearing pushes the messages down.** A reader who was at the latest message still sees it. Covered in Task 2's whole-app test, after adding from ⋮.
4. **Focus after adding from ⋮ on a phone.** It returns to Channel actions, not to the page heading. Covered in Task 2's whole-app test.
5. **A project's Chat tab on a phone.** It uses the same `ChannelView`: it has no Files tab, and its sticky project tabs sit above the channel's tabs. The same rules apply there. Covered by the UX matrix's phone loads (sideways scroll and `target-size`); no new test.

---

### Task 1: The bookmarks row on phones (`ChannelTabs`)

**Files:**
- Modify: `src/pages/chat/ChannelTabs.tsx:32-88`
- Create: `src/pages/chat/ChannelTabs.browser.test.tsx`
- Modify: `src/a11y.test.ts:110` (the `ChannelTabs.tsx` touch row: + no longer renders on phones, so `max-md:size-11` goes; drop the row)

**Interfaces:**
- Consumes: `usePhone()` from `@/components/sf/usePhone`.
- Produces: `ChannelTabs` props unchanged. On phones it never renders the "Add a bookmark" button, and it renders the strip only when `bookmarks.length > 0`.

- [ ] **Step 1: Write the failing browser tests** in `ChannelTabs.browser.test.tsx`. Import `page` from `vitest/browser` and `@/index.css`, and render inside `<div className="sf">`.
  - `'on a phone the bookmarks get their own row under the tabs'`:
    - At `page.viewport(390, 844)`, with 2 bookmarks: `list('Bookmarks').top >= tablist.bottom`.
    - The first link's rect lies within `[0, 390]` and is fully visible: `rect.right <= strip.getBoundingClientRect().right`.
    - `queryByRole('button', { name: 'Add a bookmark' })` is null.
  - `'on a phone with no bookmarks there is no row'`: at 390, with `bookmarks=[]` and `onAddBookmark`, there is no `Bookmarks` list and no Add a bookmark button. The container's height equals the tablist's (44).
  - `'from 768 px the bookmarks stay after the tabs, with +'`: at 1280×800, `list.top < tablist.bottom` (same row), and the + is present.
  - `'a long title or many bookmarks scroll inside the row, never the page'`: at 390, with 8 bookmarks (one titled `'x'.repeat(80)`), `document.documentElement.scrollWidth <= 390` and `strip.scrollWidth > strip.clientWidth`.
  - `'shrinking to a phone keeps an open Add a bookmark'`:
    - At 1280, click +, then type `wiki.spark-sys.com` in Address.
    - Then `page.viewport(390, 844)`.
    - The dialog is still there and Address still holds the text.

- [ ] **Step 2: Run them, watch them fail**
  Run: `npx vitest run --project browser src/pages/chat/ChannelTabs.browser.test.tsx`
  Expected: the phone tests FAIL (list on the tablist's row, + present, a no-bookmark strip drawn). The 768+ and dialog tests may pass already.

- [ ] **Step 3: Implement in `ChannelTabs.tsx`**
  - Outer container: `flex min-w-0 items-center max-md:flex-col max-md:items-stretch`.
  - Strip condition: `bookmarks.length > 0 || (onAddBookmark && !phone)`.
  - Strip classes: add `max-md:h-11 max-md:flex-none max-md:px-4`, with `pe-3` kept from `md`.
  - Separator: `max-md:hidden`.
  - +: render only when `onAddBookmark && !phone`, and drop `max-md:size-11` together with its comment.
  - Update the doc comment: "On phones the bookmarks get their own row and Add a bookmark is in Channel actions (UX follow-up to Phase 6)."

- [ ] **Step 4: Run them, watch them pass, then run the existing tab tests**
  Run: `npx vitest run --project browser src/pages/chat/ChannelTabs.browser.test.tsx && npx vitest run src/pages/chat/ChannelTabs.test.tsx src/pages/chat/ChannelHeader.test.tsx src/a11y.test.ts`
  Expected: PASS. The jsdom `ChannelTabs.test.tsx` still finds + because jsdom's `matchMedia` stub reports no phone.

- [ ] **Step 5: Commit**
  `git commit -m "fix(chat): a channel's bookmarks get their own row on phones"`

### Task 2: Add a bookmark in Channel actions on phones (`ChannelHeader`, `ChannelPage`) and docs

**Files:**
- Modify: `src/pages/chat/ChannelHeader.tsx` (prop, phone menu item, dialog state)
- Modify: `src/pages/chat/ChannelPage.tsx:322-349` (pass the save function to the header too)
- Modify: `src/pages/chat/ChannelHeader.test.tsx`
- Create: `src/bookmarkRow.browser.test.tsx` (whole app, `renderApp`)
- Modify: `docs/flow-chat/FLOW_CHAT_REDESIGN.md` §6.16 Channel line; `CLAUDE.md` "Touch and phones" rule (one clause); `tasks/todo.md` (section and review)

**Interfaces:**
- Consumes: Task 1's behaviour, where phones have no + in the tabs row.
- Produces: `ChannelHeaderProps.onAddBookmark?: (bookmark: { title: string; url: string }) => Promise<unknown>`. It has the same type as `ChannelTabs`'s, so `ChannelPage` passes one `addBookmarkTo` function to both:
  `mayBookmark ? (bookmark) => addBookmark.mutateAsync({ channelId: channel.id, bookmark }) : undefined`.

- [ ] **Step 1: Write the failing jsdom tests** in `ChannelHeader.test.tsx`, under `describe('Add a bookmark on phones (§6.16)')`. Stub `window.matchMedia` so `(max-width: 767px)` matches.
  - `'on a phone, Channel actions offers Add a bookmark and it saves'`:
    - Open "Channel actions", then select the menuitem "Add a bookmark".
    - The dialog "Add a bookmark" opens. Fill Address with `grafana.spark-sys.com/d/api`, then click Add.
    - `onAddBookmark` was called with `{ title: '', url: 'grafana.spark-sys.com/d/api' }` (`AddBookmarkDialog` sends the trimmed name), and the dialog has closed.
  - `'not on a laptop, and not where I can’t post'`: there's no menuitem with matchMedia false, nor on a phone without `onAddBookmark`.

- [ ] **Step 2: Write the failing whole-app test** in `src/bookmarkRow.browser.test.tsx`, with `renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'dark', size: 'phone' })` and `await app.settled()`.
  - `'on a phone, a bookmark added from Channel actions shows on its own row'`:
    - There's no `Bookmarks` list.
    - Open Channel actions, choose Add a bookmark, fill Address `wiki.spark-sys.com/runbook` and Name `Runbook`, then click Add.
    - The dialog closes.
    - `document.activeElement` is the Channel actions button.
    - `link 'Runbook'` is visible within 390 px and below the tablist.
    - The message log is still scrolled to its end: `scrollHeight - scrollTop - clientHeight < 2` on `getByRole('log', { name: /^Messages in / })`.
    - `pageProblems(app)` is empty.

- [ ] **Step 3: Run them, watch them fail**
  Run: `npx vitest run src/pages/chat/ChannelHeader.test.tsx && npx vitest run --project browser src/bookmarkRow.browser.test.tsx`
  Expected: FAIL, because there is no "Add a bookmark" menuitem.

- [ ] **Step 4: Implement**
  - `ChannelHeader`:
    - Add the `onAddBookmark` prop and `const [adding, setAdding] = useState(false)`.
    - In the menu, after Copy link, render `phone && onAddBookmark && <MenuItem icon={IconPlus} onSelect={() => setAdding(true)}>Add a bookmark</MenuItem>`.
    - After `</header>`'s content, render `adding && onAddBookmark && <AddBookmarkDialog onAdd={onAddBookmark} onClose={() => setAdding(false)} />`. Return a fragment, or place it inside the header the same way `ChannelTabs` does.
    - Doc comment: "On phones … and Add a bookmark."
  - `ChannelPage`: pass the same function as `onAddBookmark` to both.

- [ ] **Step 5: Run them, watch them pass, then run the chat suite**
  Run: `npx vitest run src/pages/chat && npx vitest run --project browser src/bookmarkRow.browser.test.tsx src/layers.browser.test.tsx`
  Expected: PASS. Layers' desktop "Add a bookmark" from + is unchanged.

- [ ] **Step 6: Docs**
  - Spec §6.16 Channel line: add "Bookmarks get their own row under the tabs, only when there are some; Add a bookmark is in the channel's more menu."
  - `CLAUDE.md` "Touch and phones": add the same as one clause.
  - `tasks/todo.md`: this plan's section, ticked as tasks land, plus a Review. Replace the Phase 6 "Open design question" bullet's ending with "→ fixed on `fix/chat-bookmark-row`".

- [ ] **Step 7: Commit**
  `git commit -m "fix(chat): Add a bookmark in Channel actions on phones"`

### Gates (before the final review)

- `npm run lint`, `npx tsc -b`, `npm test` (all green), `npm run test:ux` (968/968, in the background, about 7 min), `npm run build:prototype`.
- Then one Opus final review of the branch, and one fix pass if needed. The audit report's Phase 6 line drops the open question; it stays uncommitted.
