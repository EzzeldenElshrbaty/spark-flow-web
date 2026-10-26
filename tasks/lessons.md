# Lessons

Patterns from corrections. Review at the start of every session.

## 2026-10-26 — Look at the screenshots before proposing any layout

- **What happened:** I proposed the Phase 1 shell (workspace switcher in the sidebar, user at the sidebar bottom, breadcrumbs in the top bar) from the written docs alone. The screenshots showed Spark CRM does all three differently; the user had to point me at them.
- **Rule:** before proposing or changing any screen, open the closest screenshots in `design/screenshots/` (index in `INDEX.md`) and the matching reference component in `design/reference-code/`, and quote what they show. A design doc's wording is not enough.

## 2026-10-26 — Read every design document in the repo, even ones scoped elsewhere

- **What happened:** I set `spark-design-system.md` aside as "marketing only" without comparing it. The user asked me to consider it; it held rules the app should adopt (voice, charts, Western digits, RTL readiness).
- **Rule:** when a repo has more than one design source, compare them side by side (table of conflicts and overlaps), recommend which wins per topic, and ask — never drop one on its scope note alone.
