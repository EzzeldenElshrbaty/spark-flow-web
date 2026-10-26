# 04 · Page patterns

How Spark CRM pages are assembled. When building a Spark Flow page, pick the matching pattern and follow it top-to-bottom. Example files are in `reference-code/src/pages/`.

---

## A. List page (Leads, Clients, Opportunities, Payments, Projects…)

Screenshots: `03-leads-list-light.png`, `04-leads-list-dark.png`, `09-clients-list.png`, `12-payments.png`, `41-phone-leads.png`. Reference: `pages/leads/LeadsPage.tsx`.

Top to bottom:

1. **PageHeader** — title, one-line subtitle ("Your leads."), primary action right (`+ New lead`).
2. **Needs-attention tiles** — 4 (or 5) clickable tiles that act as **filters** (click again to clear). `grid grid-cols-2 gap-3 lg:grid-cols-4 mb-5`:
   ```tsx
   <button aria-pressed={active} className={clsx(
     'flex items-center gap-3 rounded-xl border bg-surface p-3 text-left shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 sm:p-4',
     active ? 'border-brand-500 ring-2 ring-accent-soft' : 'border-line hover:border-line-strong')}>
     <span className={clsx('rounded-lg bg-surface-muted p-2', tone)}><Icon className="size-4" /></span>
     <span><span className="block text-xl font-semibold tabular-nums text-fg">{count ?? '–'}</span>
           <span className="block truncate text-xs text-fg-muted">{label}</span></span>
   </button>
   ```
   Tones: red (Overdue, SLA breach), amber (waiting / no next step), sky (Due today).
3. **Sticky controls bar** (stays under the top bar while scrolling):
   `sticky top-16 z-10 -mx-4 mb-3 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6 xl:-mx-8 xl:px-8` containing:
   - **Underline tabs with counts** (All 232 · Not now 26 · Disqualified 66),
   - row: **search** (`flex-1`, debounced 300ms) · **sort select** (`w-56`, desktop only) · **Filters** button (secondary, shows a red count when filters are active),
   - **filter panel** (when open): `mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6`, small selects "Status: any",
   - **active filter pills**: `rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent` with ✕, then "Clear all".
4. **Body**
   - First load: `TableSkeleton`. Refetch: **dim to `opacity-60`**, never a skeleton again.
   - **Desktop/tablet (`sm+`)**: `DataTable`, whole row clickable → detail page.
   - **Phone**: a compact list instead of the table:
     ```tsx
     <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
       <li><Link className="flex items-start gap-3 px-4 py-3 active:bg-surface-sunken"><Avatar/> …</Link></li>
     ```
     rows fade in with a 20ms stagger.
   - **Empty**: dashed box —
     ```tsx
     <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
       <span className="rounded-full bg-accent-soft p-3 text-accent"><Inbox className="size-6" /></span>
       <p className="mt-3 text-sm text-fg-muted">Nothing matches “abc”.</p>
       <button className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent"><X className="size-3.5" /> Clear search and filters</button>
     ```
     Empty text is a friendly sentence per tab ("Nothing waiting. Every lead has a salesperson.").
5. **Pagination**.

**All list state lives in the URL** (`?tab=&q=&status=&sort=&page=&size=&new=1`). Back button works, links are shareable, `?new=1` opens the "New" sheet. Any change except page resets to page 1.

---

## B. Detail (record) page (Lead, Opportunity, Client, Project)

Screenshots: `05-lead-detail-light.png`, `06-lead-detail-dark.png`, `08-opportunity-detail.png`, `10-client-detail.png`, `42-phone-lead-detail.png`. Reference: `pages/leads/LeadDetailPage.tsx`.

1. **Back link**: `mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg` + `ArrowLeft size-4` + "Leads".
2. **RecordHeader** (avatar, name, status, meta row, actions).
3. **Stage progress bar** (`mb-6`) for things that move through stages — or a **KPI row** (`grid grid-cols-2 gap-3 lg:grid-cols-4`, small stat boxes) for things that don't.
4. **Two-column grid**:
   ```tsx
   <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
     <div className="min-w-0 space-y-6 xl:col-span-2"> Next step card · main cards · Timeline </div>
     <div className="min-w-0 space-y-6"> Summary / Contacts / Details / Files </div>
   </div>
   ```
5. `<RecordActionBarSpacer />` at the end.

**Next-step card** (top of the main column, the "what do I do now" box): `rounded-xl border bg-surface p-5 shadow-sm`, border **red** when overdue, **amber** when nothing planned; eyebrow `text-xs font-medium uppercase tracking-wide text-fg-muted` "NEXT STEP"; actions "Change" (secondary) + "Done? Add update" (primary).

**Timeline** (newest first) inside a Card:
```tsx
<li className="relative flex gap-3 pb-5 last:pb-0">
  {!last && <span className="absolute left-4 top-8 -ml-px h-[calc(100%-2rem)] w-px bg-line" />}   // vertical connector
  <span className="flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset {type color}"><Icon className="size-4" /></span>
  <div className="min-w-0 flex-1 pt-1">
    <p className="text-sm font-medium text-fg">Call</p>
    <p className="mt-0.5 whitespace-pre-line text-sm text-fg-secondary">{text}</p>
    <p className="mt-0.5 text-xs text-fg-muted">Omar Khaled · Fri 23 Oct, 5:51 PM</p>
```
System events (assigned, moved) use a grey circle and one line.

**Key-value details**:
```tsx
<dl className="divide-y divide-line-subtle text-sm">
  <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-5 py-2.5"><dt className="text-fg-muted">Source</dt><dd className="min-w-0 break-words text-fg">Website</dd></div>
```
Missing → `—`; inline "Edit" link `text-xs font-medium text-accent`.

**Stat tiles in a card**: `grid grid-cols-2 gap-3 p-5`, sub-tiles `rounded-lg bg-surface-sunken p-3` (label `text-xs text-fg-muted`, value `mt-1 font-semibold tabular-nums`).

**Contact rows**: avatar + name + "Primary" pill (`bg-accent-soft text-accent text-[10px]`), phone/email lines, square icon actions (call / WhatsApp / email: `rounded-lg border border-line p-1.5`), text actions "Edit · Make primary · Remove".

**Not found / no access**: centered Card `mx-auto mt-10 max-w-md p-8 text-center` with a grey icon, "Lead not found", "It may have been removed, or the link is wrong.", accent link "Back to leads".

---

## C. Dashboard / Home

Screenshots: `01-home-light.png`, `02-home-dark.png`, `22-menu-market.png` (company view), `40-phone-home.png`. Reference: `pages/home/*`.

1. **Greeting header**: "Good morning/afternoon/evening, {firstName}" + one-line situation summary ("27 overdue next steps on your leads"). Managers: "Company overview" / "{Market} overview".
2. **Period bar**: segmented control (This cycle / 30 days / 90 days) left, market flag + currency right (`text-xs text-fg-muted`).
3. **4 KPI StatCards**: `grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4` (number counts up, delta vs last period, sparkline).
4. **Rows of cards on a 3-column rhythm** (`mt-6 flex flex-col gap-6 xl:flex-row`): each card is *wide* (2/3) or *narrow* (1/3). Typical: "Today and overdue" list (wide) + "No next step" (narrow); attention list + money; charts.
5. Content depends on role — each role lands on the page most useful to them.
6. Loading skeleton mirrors the layout (title bar, 4 × `h-36` tiles, `h-72` blocks).

---

## D. Kanban board

Screenshot: `07-opportunities-board.png`. Reference: `pages/opportunities/OpportunityBoard.tsx`, `DealCard.tsx`.

- Horizontal track; on phones each column is full width with **scroll-snap** and a sticky chip strip of stages.
- Column: `md:w-[296px] rounded-xl border`, each stage a **pastel tint** (sky, violet, amber, rose, teal; Won emerald, Lost slate), header with color dot, name, count pill, and "EGP 1.2M · 40% chance".
- Card: `rounded-xl border border-line bg-surface p-3.5 shadow-sm hover:shadow-md` — name + amount, contact + "12d in stage", next-step line colored by urgency, owner avatar.
- Native drag & drop: dragged card `opacity-40`, target column `border-brand-500 ring-2 ring-brand-500/30`; a drop **opens a small dialog** to confirm/log the move. Blocked moves show an amber notice for 3.5s.
- Board / List switch at the top (segmented control B).

---

## E. Forms (create / edit)

Screenshots: `25-sheet-new-lead.png`, `45-phone-new-lead-sheet.png`. Reference: `pages/leads/NewLeadSheet.tsx`, `dialogs.tsx`.

- New-record forms → `Sheet variant="drawer"`; small actions → default dialog.
- `<form id="x" noValidate className="space-y-4">` and the footer submit button uses `form="x"`.
- Single column; pairs side by side with `grid gap-4 sm:grid-cols-2`.
- Optional groups in `fieldset rounded-lg border border-line p-3` with legend "Next step (optional)".
- **Progressive disclosure**: "⌄ Add company details" accent toggle reveals more fields (`animate-fade-up`).
- Repeated groups (contacts): bordered box per item + dashed "+ Add another contact".
- Validate **on submit**, then live; errors as full sentences under each field ("Choose how the lead reached us."). Form-level errors at the bottom in red text.
- Footer: Cancel + "Save lead" → "Saving…". On success the sheet just **closes** and the page refreshes behind it. **No toasts.**
- Duplicate / risk warnings: amber box `rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900` with `TriangleAlert`.

---

## F. Settings

Screenshot: `16-settings.png`. Reference: `pages/settings/shared.tsx`.

- **Settings home**: `mx-auto max-w-2xl`, grouped lists (uppercase group label), rows = accent icon tile (`size-9 rounded-xl bg-accent-soft text-accent`) + name + one-line description + `ChevronRight` — iOS-settings style in a `rounded-2xl border` card.
- **Sub-page**: left sticky nav (`lg:grid-cols-[14rem_minmax(0,1fr)]`, active item `bg-surface shadow-sm ring-1 ring-line`) + content `max-w-3xl`, sections spaced `space-y-8`.
- **Section** = title + description outside, then a `rounded-2xl border border-line bg-surface shadow-sm` panel with `divide-y` rows (`px-5 py-3`).
- **Sticky save bar** appears only when something changed: `sticky bottom-20 lg:bottom-4 rounded-2xl border bg-surface/95 p-3 shadow-lg backdrop-blur` → Cancel / Save.
- Inline editing: blur-to-save inputs, "Rename" swaps in a mini form, ↑/↓ reorder buttons, delete icon only for unused rows. Small "Saved" text in emerald confirms.

---

## G. Reports

Screenshots: `14-reports.png`, `15-report-funnel.png`. Reports index = grid of report cards (`sm:grid-cols-2 xl:grid-cols-3`). A report page = header + "Show by" segmented control + KPI tiles + `ChartCard` (chart ⇄ table toggle) + data table + Export.

---

## H. Sign-in

Reference: `pages/auth/AuthScreens.tsx` (no screenshot — the prototype skips sign-in).

- Desktop: split screen. Left 52–56% = **brand panel**: maroon→red gradient `bg-[linear-gradient(150deg,#4a0d0f_0%,#671416_38%,#9e1d21_78%,#b72126_100%)]`, a slow drifting red glow (`animate-drift`), faint 44px grid masked radially, giant faded Spark mark watermark, uppercase eyebrow, big headline with a highlighted phrase in `#ffb3b5`, and a decorative glass "pipeline" card with a floating KPI card (`animate-float`).
- Right = form, max width 400px: "Welcome back" (`text-[28px] font-semibold`), inputs `h-12 rounded-xl pl-10 text-[15px]` with leading icons, password show/hide, gradient submit `h-12 rounded-xl` with an arrow that nudges on hover, "Forgot password?" link.
- Phones: red band on top, white sheet with `rounded-t-[28px]` sliding over it. `theme-color` → `#671416` while signed out.
- Screens: Sign in · Forgot password · Check your email · Link expired · Choose your password.

---

## I. Help

Screenshot: `27-page-help-panel.png`. Reference: `pages/help/HelpPage.tsx`, `help.css`.

Full guide page: 3 columns (chapter list · article · "On this page" scrollspy), searchable, Previous/Next cards. Plus the contextual **? panel** from the top bar (02-app-shell §7). Help content uses `.help-doc` styles (steps, callouts, UI-button chips, figures that zoom).
