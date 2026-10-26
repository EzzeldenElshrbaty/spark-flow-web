# 02 · App shell — layout, menus, top bar, loader

The shell is what makes the two apps feel like one product. Rebuild it **exactly**. Source: `reference-code/src/layout/*` and `reference-code/src/components/ui/{Menu,LoadingBar,styles}.tsx`.

Screenshots: `01-home-light.png` (full shell), `24-sidebar-collapsed.png`, `40-phone-home.png`, `43-phone-more-drawer.png`.

## 1. Overall layout (`AppLayout.tsx`)

```
Desktop (lg ≥ 1024px)                         Phone (< 1024px)
┌────────┬──────────────────────────────┐    ┌──────────────────────┐
│        │ ┌──────────────────────────┐ │    │ ☰        🔍 ? 🔔 🏳 OK│  top bar (sticky)
│ SIDE-  │ │ top bar (sticky, blur)   │ │    ├──────────────────────┤
│ BAR    │ ├──────────────────────────┤ │    │                      │
│ ink-900│ │                          │ │    │   page content       │
│        │ │  page content (scrolls)  │ │    │                      │
│        │ │                          │ │    ├──────────────────────┤
│        │ └──────────────────────────┘ │    │ 🏠  👤  ▦  📅  ⋯     │  bottom nav (fixed)
└────────┴──────────────────────────────┘    └──────────────────────┘
```

**The signature look on desktop:** the whole window is the dark sidebar color (`lg:bg-ink-900`), and the content floats on it as a **rounded panel** with an 8px margin: `lg:m-2 lg:rounded-2xl lg:border lg:border-line lg:bg-canvas lg:shadow-lg`, and the panel scrolls on its own (`lg:h-screen lg:overflow-hidden` on the root, `lg:overflow-y-auto` on the panel). In dark mode the frame is `lg:dark:bg-surface-sunken`.

```tsx
<div className="flex min-h-screen lg:h-screen lg:overflow-hidden lg:bg-ink-900 lg:dark:bg-surface-sunken">
  <Sidebar collapsed={collapsed} />
  <div className="relative flex min-w-0 flex-1 flex-col lg:m-2 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-line lg:bg-canvas lg:shadow-lg">
    <div className="sticky top-0 z-20">
      <ViewingAsBanner />
      <TopBar … />
    </div>
    <main className="w-full flex-1 px-4 pb-24 pt-6 md:px-6 lg:pb-10 xl:px-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface-strong" />}>
        <Outlet />
      </Suspense>
    </main>
  </div>
  <PageHelpPanel />            {/* right side panel, see §7 */}
  <MobileBottomBar … />        {/* lg:hidden */}
  <MobileDrawer … />           {/* lg:hidden */}
</div>
```

Content is **full width** (no max-width container) — tables and boards use the space.

## 2. Sidebar (`Sidebar.tsx`)

- `sticky top-0 hidden h-screen shrink-0 flex-col bg-ink-900 dark:bg-surface-sunken lg:flex`, width `w-64` expanded / `w-[72px]` collapsed, `transition-[width] duration-200`.
- Logo area `h-20 px-4`: white Spark logo + divider + product name (`CRM` → use `FLOW`). Collapsed: just the white mark, centered. Logo links to Home.
- Nav = **groups with uppercase labels** (`Sell`, `Team`, `Money` in CRM). Group label: `mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500`. Groups separated by `space-y-6`, items `space-y-0.5`, nav padding `px-3 py-4`.
- **Item**: `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors`
  - idle: `text-neutral-400 hover:bg-white/5 hover:text-white`
  - active: `bg-white/10 text-white` and **the icon turns Spark red** `text-brand-400`
  - icon `size-[18px]`
  - count badge on the right (e.g. pending approvals): `rounded-full bg-brand-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white`
  - collapsed: icon only, centered (`justify-center px-2`), label in `title` tooltip, no group labels.
- **Settings** is pinned at the bottom, separated by `border-t border-white/10 px-3 py-3`.
- Items are filtered by role (`roles` on each nav item). Nav config lives in one file (`navigation.ts`) — each item has `path, label, icon, roles, description` (description is reused by search and placeholders).
- Collapse toggle lives in the **top bar** (left), icon `PanelLeftClose` / `PanelLeftOpen`.

## 3. Top bar (`TopBar.tsx`)

`sticky top-0 z-20 flex h-16 items-center gap-1.5 sm:gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6 xl:px-8`

Left → right:
1. Phones: hamburger (`Menu` icon) opens the drawer. Desktop: collapse-sidebar button. Both `-ml-2 rounded-md p-2 text-fg-tertiary hover:bg-surface-muted`.
2. **Search box** (md+): `max-w-md flex-1`, see §5.
3. `ml-auto` then a row of **round 36px buttons** (`gap-1 sm:gap-2`):
   - phone search 🔍 (md:hidden) · help **?** · notifications 🔔 · market flag · **avatar** (initials).

**Round button recipe** (`styles.ts`) — every top-bar icon uses it:
```ts
export const roundButtonClass =
  'relative flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-line transition hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
export const roundButtonFill = 'bg-surface hover:bg-surface-muted'
```
Icons inside: `size-[18px] text-fg-tertiary`.

- **Avatar button**: same circle filled `bg-ink-800 text-xs font-semibold text-white hover:bg-ink-700 dark:bg-surface-strong` with 2 initials; on `xl` it also shows name (`text-sm font-medium`) + title (`text-xs text-fg-muted`) and a `ChevronDown` that rotates 180° when open.
- **Unread badge** on the bell: `absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white ring-2 ring-surface` (shows `99+` above 99).
- Help "?" when open: `bg-accent-soft text-accent ring-brand-500`.

## 4. Dropdown menus (`Menu.tsx` → `MenuPanel`) — **one component for all top-bar menus**

Screenshots: `20-menu-user.png`, `21-menu-notifications.png`, `22-menu-market.png`, `26-more-actions-menu.png`, `44-phone-user-menu-sheet.png`.

- **Desktop**: anchored under the trigger, right-aligned: `sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:max-h-[80vh] sm:rounded-xl` + `border border-line bg-surface shadow-xl` + `animate-pop-in`.
- **Phone (<640px)**: becomes a **bottom sheet**: `fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-fade-up`, with a dim backdrop `bg-black/40`. Rendered via portal to `document.body` (the top bar's backdrop-blur would otherwise trap it).
- Behavior: focuses first item on open · Esc closes and returns focus to the trigger · click outside closes · Tab is trapped inside · `role="menu"`, items `role="menuitem"` / `menuitemradio` + `aria-checked`.
- Widths: market/more `sm:w-56`, account `sm:w-80`, notifications `sm:w-96`. Inner padding `p-1.5`.
- **Menu item**: `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg-secondary hover:bg-surface-muted hover:text-fg` + lucide icon `size-4`. Selected: `font-medium text-fg` + a `Check` icon `size-4 text-accent` on the right. Danger item: `text-red-600 dark:text-red-400`.
- **Section label** inside menus: `px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fg-muted`. Sections separated by `border-t border-line-subtle`.
- Small tag in a label (e.g. "Prototype only", "Soon"): `rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium`.

### Account menu (avatar) content, top to bottom
1. Header: big avatar `size-10` + name (`font-medium`) + role + markets (`text-xs text-fg-muted`), `border-b border-line-subtle px-4 py-4`.
2. (Management only) **View as** someone — searchable list when > 8 people.
3. **Preferences → Theme**: a segmented control Light ☀ / Dark 🌙 (see segmented control recipe in 03-components).
4. **Help** (LifeBuoy) → `/help`.
5. **Change password** (KeyRound) · **Log out** (LogOut).

### Notifications menu
- Sticky header: "Notifications" (`font-semibold`) + "Mark all as read" text button (`text-xs font-medium text-accent`), then a segmented control **All / Unread (n)**.
- Rows: `flex items-start gap-3 px-4 py-3 hover:bg-surface-muted`, unread rows tinted `bg-accent-soft/40`; a **round tone icon** `size-8 rounded-full` using the status-color pattern per kind; title (unread = `font-semibold text-fg`), time on the right (`text-[11px] text-fg-muted`, "25 min ago"), text `line-clamp-2 text-xs text-fg-muted`; unread dot `size-2 rounded-full bg-brand-500`.
- Empty: centered `px-4 py-8 text-sm text-fg-muted` — "You’re all caught up." / "No notifications yet."
- Polls every 2 minutes **silently** (does not trigger the loading bar) and refreshes on open. Clicking a row marks it read and navigates.

### Market switcher
Round button showing the market's **flag** (globe for "All markets"). Menu: "MARKET" label + radio items with flag `size-5`. If the user has only one market it's a static flag, not a button.

## 5. Global search (`GlobalSearch.tsx`) — screenshots `23-search-open.png`, `46-phone-search.png`

- Input: `w-full rounded-lg border border-line bg-surface-sunken py-2 pl-9 pr-3 text-sm placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft` with a `Search` icon at `left-3`.
- Shortcuts: **Ctrl/⌘ + K** or **/** focuses it.
- Results dropdown: `absolute inset-x-0 top-full mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl animate-pop-in`.
- Results are **grouped**: Pages, Actions (instant, local), then records from the server (Leads, Opportunities, Clients, Contacts). Group header: icon + uppercase label + count. Each hit: small icon tile `size-7 rounded-md bg-surface-muted`, title with the **matched part in bold**, subtitle `text-xs text-fg-muted`. Group ends with "See all N …" in `text-accent`.
- Keyboard: ↑/↓ move, Enter opens, Esc closes (ARIA combobox/listbox). Debounce 200ms, min length before searching.
- States: hint text before typing, "Searching…", “Nothing matches “term”.”
- **Phone**: round 🔍 button opens a **full-screen search** (input `text-base`, "Cancel" text button in accent, clear ✕).

## 6. Mobile navigation (`MobileNav.tsx`)

- **Bottom bar**: `fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden`. 4 pinned items + **More**. Each: `flex flex-col items-center gap-1 py-2 text-[11px] font-medium`, icon `size-5`; active `text-accent`, idle `text-fg-muted`.
- **More / hamburger** opens a left **drawer** with the same dark sidebar content: `w-72 max-w-[85vw] bg-ink-900`, header `h-16` with logo + ✕, backdrop `bg-black/50`.
- Record pages pin their main action in a **bar above the bottom nav** (see RecordHeader in 03-components): `fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden`.

## 7. Page help panel (`PageHelpPanel.tsx`) — `27-page-help-panel.png`

The round **?** opens help for the current page:
- `2xl+`: sits **beside** the content as a second rounded panel (`2xl:relative 2xl:m-2 2xl:ml-0 2xl:rounded-2xl 2xl:border 2xl:shadow-lg`, width `24rem`) — read and work at the same time.
- `sm–xl`: slides over from the right (`fixed right-0 top-0 h-full w-[24rem] border-l animate-slide-in-right`). Does **not** dim the page.
- Phone: bottom sheet `h-[85vh] rounded-t-2xl animate-fade-up`.
- Header: eyebrow `text-xs font-semibold uppercase tracking-wider text-accent` ("HELP · SALESPERSON") + title; footer: "Salesperson guide" + "Open full guide ↗" link. Stays open across pages.
- (Screenshot shows the error state because the prototype has no API — "Help isn't available right now. Try again in a moment.")

## 8. The loader — **top loading bar** (`LoadingBar.tsx`) + skeletons

This is the only page loader. **No spinners, no full-page overlays.**

- A **2px Spark-red line** fixed at the very top of the window: `pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5`, inner bar `origin-left bg-brand-500 dark:bg-brand-400`.
- Shows whenever **any** React Query fetch or mutation is running (`useIsFetching` + `useIsMutating`), plus anything wrapped in `trackLoading(promise)` (sign-in, boot data).
- **Waits 200ms** before appearing → instant loads never flicker.
- While loading: `animate-loading-bar` = scaleX 0 → 0.92 over 12s with ease `cubic-bezier(0.1,0.7,0.2,1)` (fast at first, then crawls, never finishes on its own).
- When done: jumps to 100% (`scale-x-100`) and **fades out** (`transition-[transform,opacity] duration-300`, opacity delayed 150ms), then unmounts after 500ms.
- Background polls marked `meta: { silent: true }` (e.g. notifications) don't show it.
- Copy `LoadingBar.tsx` + `lib/loading.ts` verbatim and mount `<LoadingBar />` once at the root, inside `QueryClientProvider`.

**Skeletons** (inside content while the first data loads):
- Route code loading (Suspense fallback): `h-64 animate-pulse rounded-xl bg-surface-strong`.
- Lists / panels: stacked blocks `h-16 animate-pulse rounded-lg bg-surface-muted` with `space-y-3`, `aria-busy="true"`.
- Small inline: plain text "Loading…" in `text-sm text-fg-muted`.

**Data-freshness rules that go with it** (`main.tsx`):
- `staleTime: 30_000` — reopening a page within 30s shows cached data instantly.
- After **any** successful mutation, `queryClient.invalidateQueries()` reloads everything on screen (counts, badges, bell), and the mutation is only "done" after that reload (so the dialog closes onto fresh data). Uploads can opt out with `meta: { closeFirst: true }`.

## 9. "Viewing as" banner

When an admin is impersonating someone, a strip above the top bar on every page: `border-b border-accent-line bg-accent-soft px-4 py-2 text-sm` with an `Eye` icon in accent, text, and "Back to {name}" text button in accent.

## 10. Routing conventions

- Every page is lazy-loaded (`lazy(() => import(...))`), Suspense skeleton covers the blink.
- List page `/things`, detail `/things/:id`, sub-flows `/things/:id/proposal`.
- Unbuilt nav items route to a **Placeholder page** (title + description from the nav config + "next in line").
- Old URLs redirect with `<Navigate replace />` instead of 404.
