# Spark Flow — instructions for Claude

Spark Flow is a sister product of **Spark CRM** (Spark Systems). The two apps must look and behave like **one product**. The full design system, extracted from Spark CRM, is in `design/` (this kit). Read it before building any UI.

## Read first (every new session)

1. `design/README.md`
2. `design/01-foundations.md` — stack, tokens, dark mode, type, motion
3. `design/02-app-shell.md` — layout, sidebar, top bar, menus, search, loader
4. `design/03-components.md` — buttons, inputs, sheets, tabs, tables, charts
5. `design/04-page-patterns.md` — list / detail / dashboard / board / form / settings pages
6. `design/05-ux-rules.md` — behavior, phone rules, microcopy, do/don't
7. Look at `design/screenshots/` for the visual target.

## Hard rules

- **Stack**: React 19 + TypeScript + Vite, Tailwind CSS v4 (tokens in `src/index.css` `@theme`, no tailwind.config), lucide-react, clsx, TanStack Query, React Router. Inter font.
- **Copy, don't reinvent**: start from `design/reference-code/` — `src/index.css`, `index.html` (theme script, PWA meta), `components/ui/*`, `components/charts/*`, `layout/*`, `lib/{ThemeProvider,useTheme,loading,format}.ts`. Adapt imports; keep class strings identical. Remove CRM-only features (market switcher, View as, presales…) unless Spark Flow needs them.
- **Colors**: only semantic tokens (`bg-canvas`, `bg-surface`, `bg-surface-sunken/muted/strong`, `border-line(-subtle/-strong)`, `text-fg(-secondary/-tertiary/-muted/-subtle)`, `text-accent`, `bg-accent-soft`) and `brand-*`. Never raw `white`/`slate`/`gray` for surfaces or text. Status colors use `bg-{c}-50 text-{c}-700 dark:bg-{c}-500/15 dark:text-{c}-300`.
- **Every screen must work in light and dark** and **on a 390px phone**.
- **Shell**: dark ink sidebar with grouped nav, content as a floating rounded panel on desktop, sticky blurred top bar with search + round icon buttons + avatar, phone bottom nav + drawer. Logo lockup = white Spark logo + divider + `FLOW`.
- **Loader**: only the 2px red top `LoadingBar` + pulse skeletons. No spinners, no overlays.
- **Modals**: only `Sheet` (dialog / drawer, full-screen on phones, doesn't close by accident). Menus: only `MenuPanel` (dropdown → bottom sheet on phones).
- **Feedback**: no toasts; invalidate all queries after a mutation and close the sheet. Errors as sentences near the cause.
- **Microcopy**: English, sentence case, verb-first buttons, `…` for pending ("Saving…"), ` · ` separators, `—` for empty.
- **Formatting**: use `lib/format.ts` (money "EGP 1.2M", "3h ago", "Today 2:00 PM", "3 Oct 2026"). `tabular-nums` for numbers.
- **One primary (red) button per view.**
- When unsure how something should look, find the closest Spark CRM screen in `design/screenshots/` or pattern in `design/04-page-patterns.md` and match it.

## Shared identity with Spark CRM

- Same theme storage key style (`spark-flow.theme`) and same Light/Dark choice; if both apps share sign-in later, the theme is saved on the account.
- Same roles vocabulary and the same tone of voice.
- Cross-links between the apps should feel like moving between sections of one app.
