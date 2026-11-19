# Decisions

Git tracks individual changes. Record consequential choices, rationale and status
here; explicitly supersede a decision when changing its semantics.

## 010 — Complete saved-data access for MCP-only mentors

19 November 2026, implementation and publication authorized by the user.
The user requires a mentor to read all Learning Stopwatch information through the
plugin without using the website. Add goal details/progress/history and complete
reports using the existing website services; extend session reads with date ranges,
all-date history and explicit continuation past 500 rows. Retain today's default,
existing fields, current-classification semantics and owner/mentor restrictions.
All tools stay read-only. CSV/goal backup information is exposed as structured data,
without adding download or write tools. Browser-only preferences and unsaved drafts
remain on the owner's device. No schema changes or dependencies are needed.

## 001 — Independent classifications

Accepted, 17 November 2026. One user-managed Learning Area describes the subject;
the existing Activity Type describes how. Store both on the activity so the timer
requires no extra choices. Multi-area activity membership remains deferred. Flexible period goals are
implemented by Decision 008.

## 002 — Current-classification reporting

Accepted explicitly, 17 November 2026. Moving an activity regroups all its historical
time; area rename relabels that same subject. Session date/duration/notes remain.
This matches existing current-type reporting. Historical snapshots were rejected
because they require extra session state and a second reporting interpretation.

## 003 — Reassignment before deletion

Accepted explicitly, 17 November 2026. Require a real destination for an occupied
area and move all members atomically, including archived/deleted records. Preserve
every session and lifecycle state. Reject stale writes/open affected timers.
Automatic Unassigned movement was rejected as normal UX; it remains legacy recovery.

## 004 — Progressive filtering and default area grouping

Accepted with Phase 2 adjustment, 17 November 2026. Originally three navigation
screens; Decision 008 adds Goals. Continue to
manage areas inside activity management. Reveal three labeled filters when needed,
combine with AND, narrow activity choices and keep removable chips visible.
Learning Area is the default grouping per the Phase 2 instruction. Activity/Type
remain options. Independent temporary filters survive navigation, reset on reload.

## 005 — Full CSV and read-only MCP

Accepted explicitly, 17 November 2026. CSV keeps all saved history and its existing
six columns regardless of screen filters, protecting Learning_Tracker imports from
silent omissions. No extra export menu was added. At the user's follow-up request,
MCP adds Area/Type filters and area summaries while retaining existing arguments
and fields. No MCP writes or new access grants are introduced.

## 006 — Additive stable references

Approved for publication, 17 November 2026. Preserve existing course IDs
and names, add stable session references and area IDs, materialize owner-specific
built-ins and retain orphan history. Avoid destructive table rewrites. A local
backup-first runner validates preservation and safe reruns. Hosted migrations remain schema-only. The same owner-scoped backfill is used by
the local runner and first authorized write, with its marker written last. This
respects hosting constraints and avoids mutating records through read requests.
Publication requires a fresh backup and preservation comparison.

## 007 — Lightweight documentation and tooling

Accepted direction, 17 November 2026. README is the entry point; AGENTS holds
action rules; architecture/decisions/status each own one purpose. Update the owning
file with significant behavior changes, using Git for commits. No separate changelog
or lesson diary is needed. Graphify is deferred: direct search and a small accurate
map are sufficient until a demonstrated navigation problem justifies another tool.


## 008 — Flexible goals from saved records

Approved and published as Sites Version 17, 17 November 2026.
Supersedes the weekly-target deferral with user-defined, non-recurring periods.
Add a dedicated fourth Goals screen, leaving the primary timer workflow intact.
Dates are inclusive India start dates; week presets use Monday–Sunday and rolling
7/14-day presets include today. Every field stays editable. Target time is stored
as integer milliseconds for consistency, with whole-minute input. Scope uses stable
area/activity IDs and supports all learning, selected areas, or one activity only.

Compute progress from existing completed sessions and today's classifications.
Past goals remain permanently available until deleted, but their results remain
live when source sessions or classifications change. Freezing results was rejected
because it would conflict with corrections, current-area reporting and the single
source of truth. Independent overlapping goals intentionally share contributions.
No second session ledger or background expiry job is needed.

Block deletion of areas referenced by any goal until the user explicitly updates
those goal scopes. Automatically moving a goal to a destination area could include
unrelated activities and silently alter its meaning. Keep checks inside both goal
writes and the area transaction for concurrency safety. Activity lifecycle actions
retain stable records; explicit history deletion recalculates goals normally.

Keep a dated before/after description for meaningful goal-definition edits in its
row, atomically with the revision update. This makes past changes understandable
without a separate audit service. Source-record corrections are reflected live,
not logged as goal edits. An optional JSON backup preserves definitions/edit history
and timestamped derived results; no new import or CSV format is introduced.
Recurrence, reminders, Activity Type targets, nested rules and streaks are deferred.

## 009 — Local reliability recovery

18 November 2026, published as Version 18 after explicit approval. Preserve original timer
commands in owner-scoped browser journals and use existing operation IDs/revisions
for safe recovery. Compact opt-in write acknowledgements preserve old-client
compatibility. Keep full history/CSV semantics, avoid dependencies/schema changes,
and make loading failures recoverable. Conflicts retain a review copy rather than
overwriting newer records. Publication requires separate authorization plus fresh
build/browser checks and validation of retained prior client assets on Sites.
