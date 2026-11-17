# Decisions

Git tracks individual changes. Record consequential choices, rationale and status
here; explicitly supersede a decision when changing its semantics.

## 001 — Independent classifications

Accepted, 17 November 2026. One user-managed Learning Area describes the subject;
the existing Activity Type describes how. Store both on the activity so the timer
requires no extra choices. Multi-area membership and weekly targets are deferred.

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

Accepted with Phase 2 adjustment, 17 November 2026. Keep three navigation screens;
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
