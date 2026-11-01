# Lessons

Patterns from corrections. Review at the start of every session.

## 2026-10-26 — Look at the screenshots before proposing any layout

- **What happened:** I proposed the Phase 1 shell (workspace switcher in the sidebar, user at the sidebar bottom, breadcrumbs in the top bar) from the written docs alone. The screenshots showed Spark CRM does all three differently; the user had to point me at them.
- **Rule:** before proposing or changing any screen, open the closest screenshots in `design/screenshots/` (index in `INDEX.md`) and the matching reference component in `design/reference-code/`, and quote what they show. A design doc's wording is not enough.

## 2026-10-26 — Read every design document in the repo, even ones scoped elsewhere

- **What happened:** I set `spark-design-system.md` aside as "marketing only" without comparing it. The user asked me to consider it; it held rules the app should adopt (voice, charts, Western digits, RTL readiness).
- **Rule:** when a repo has more than one design source, compare them side by side (table of conflicts and overlaps), recommend which wins per topic, and ask — never drop one on its scope note alone.

## 2026-10-28 — Test keys that cross listeners with real key presses

- **What happened:** the review found Esc closing an image preview also marked the channel read. jsdom tests passed because a script's `dispatchEvent` runs every listener in one go; a real key press lets the browser run React's pending work between listeners, so the dialog was gone before the page's listener checked for it.
- **Rule:** when one key is shared by several listeners (a layer and a page key), test it in the browser project with `userEvent.keyboard` from `vitest/browser`, and decide ownership from state taken in the capture phase, not from the DOM after other listeners ran.

## 2026-10-31 — Check the dev server too, and say when a commit needs it restarted

- **What happened:** after slices 2 and 3 reached the user's branch, `npm run dev` showed "Failed to resolve import @/components/ui/LoadingBar". The code was fine: a fresh dev server, in the cloud and on a copy of the user's tree, resolves it and every page loads. My checks had only used vitest, `build:prototype` and `vite preview`. Applying slice 2 replaced `vite.config.ts` (git deletes and writes it again), and the user's running dev server most likely restarted while the file was missing, without the `@` alias. Every `@/` import then fails, and `LoadingBar` is the first one in `main.tsx`.
- **Rule:** before saying a slice is done, also start `npm run dev` and load the main pages in Playwright with no Vite overlay and no console errors. When a commit changes `vite.config.ts`, `package.json` or `index.html`, tell the user to restart the dev server after it lands.
