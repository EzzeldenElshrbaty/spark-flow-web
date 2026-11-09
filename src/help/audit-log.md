---
title: Audit log
group: Settings
order: 4
summary: Who did what, when and from where, and the check that nothing was changed.
needs: audit.view
---
The audit log records every change in Flow: who, when, from which IP and device, and what changed. Nothing in it can be changed or removed.

![The audit log](audit-log.jpg "Each entry with what changed")

## Reading it

Search, or narrow by kind (data, status and archive, access, settings, exports), person, result and period. Click an entry to see each change, from and to. **Needs a look** at the top points out what’s unusual, such as several failed sign-ins in a few minutes.

## The tamper check

Each entry is chained to the one before by a fingerprint. If an entry is changed or removed, the check says where the chain breaks.

## Downloading

**Export CSV** saves the entries on screen as a CSV. The export is itself recorded.
