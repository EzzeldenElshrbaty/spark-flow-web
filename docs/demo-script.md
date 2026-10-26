# Spark Flow demo script (Thursday 29 Oct 2026)

Before you start: Settings → Database → **Reload seed data** (type "reload"). The seed is built around the time you
reload it, so do it shortly before the demo. Switch people with the user menu → **View as** (demo only).

## People

| Person | Role | Use them for |
|---|---|---|
| Youssef Abdelrahman | Admin (the manager) | Dashboard with cost, Time & cost, hourly costs |
| Karim Hassan | Sales | Selling a new project |
| Ahmed Shawky | PM (Mobile App, Sela) | Phases, tasks, his own dashboard |
| Nour El-Sayed | PM (Nexus Core, El Moasser) | Mentions in the bell |
| Salma Ibrahim | Member (QA) | A member's day: check in, bug report |
| Tarek Lotfy | Member (Android) | Checking in on a new project |
| Mariam, Hossam | Members | Already checked in "now" with timers running |

## Story 1: a project from sale to dashboard (about 5 minutes)

1. **Karim** → Projects → **New project**: "Sela kiosk", waterfall, manager Ahmed, add Tarek, due in the spring. It
   opens with 5 phases and its own chat.
2. **Ahmed** → the project → **New task** twice: one with a due date, one with an estimate (6 h), both for Tarek.
   Show Manage phases (rename, reorder).
3. **Tarek** → Home → **Check in** with a plan, starting the timer on the first task (the timer shows in the top bar
   and, on a phone, above the bottom bar). Then the second task → **Add time** (1 h yesterday).
4. **Ahmed** → **Dashboard**: only his projects; Sela kiosk with hours against the estimate; Tarek under
   "Checked in now".

## Story 2: a member's day (about 4 minutes)

1. **Salma** → Home → **Check in**. Open **NEX-105** → **Start timer**.
2. NEX-105 → **Activity** → **Bug**: attach a screenshot (a screen recording works too), type `@mar` and pick Mariam,
   **Report bug**. The card appears in **#nexus-core**.
3. **Mariam** → the bell: "Salma Ibrahim mentioned you". Click it.
4. **Salma** → **NEX-108** → **Start timer** (the NEX-105 entry stops by itself). Home → **Check out**: the day's
   summary.

## Story 3: the manager's view (about 3 minutes)

1. **Youssef** → **Dashboard**: every project, cost to date, overdue tasks, who worked in the last 7 days, and who is
   checked in now (with what they're on).
2. **Time & cost**: 7 / 30 / 90 days; By project, By person, By week (the chart). **Edit hourly costs** → change one
   rate and come back: the cost moves.
3. A Member typing `/dashboard` or `/time` is told they don't have access.

## If something looks off

- Reload the seed (Settings → Database). It replaces everything in this browser, including uploads.
- Light/Dark is in the user menu. Every screen also works on a phone width.
