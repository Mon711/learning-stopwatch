# Architecture and data rules

## Responsibilities

| Responsibility | Owning source |
|---|---|
| Resolve owner/mentor identity | `app/page.tsx`, `app/log-access.ts`, `lib/log-access.ts` |
| Timer, navigation, activity dialog, History | `app/stopwatch.tsx` |
| Goals UI, presets and exact progress calculation | `app/learning-goals.tsx`, `lib/goals.ts` |
| Goal persistence and authorized API | `lib/goals-store.ts`, `lib/goals-api.ts`, `app/api/goals/route.ts` |
| Immediate timer state, queued saves, retries/conflicts | `lib/instant-timer.ts` |
| Totals grouping, refresh and notices | `app/learning-totals.tsx` |
| Shared filter controls and predicates | `app/learning-filters.tsx`, `lib/learning-filters.ts` |
| Area management dialog view | `app/area-manager.tsx` |
| Activity validation, stable references, lifecycle | `lib/courses.ts`, `lib/courses-api.ts` |
| Area validation and atomic reassignment | `lib/learning-areas.ts`, `lib/areas-api.ts` |
| Session reads/mutations and totals | `lib/session-api.ts`, `lib/totals-api.ts`, `lib/learning-totals.ts` |
| Shared types, dates, durations, CSV | `lib/stopwatch.ts` |
| Read-only MCP | `app/mcp/route.ts`, `lib/learning-mcp.ts` |
| Schema, ordered changes, local migration runner | `db/schema.ts`, `drizzle/`, `scripts/migrate-learning-areas.mjs` |
| Appearance and responsiveness | `app/globals.css`, `app/theme-toggle.tsx`, `lib/theme.ts` |

## Save/read flow

The mounted timer records click times and immediately updates its display.
InstantTimer queues operations with retry IDs. The server resolves the authorized
owner, rejects mentor writes and validates activity state, timing, note length,
origin and versions. D1 persists sessions; completed totals exclude running/paused
records and paused time. Conflicts refresh saved state; failed saves remain explicit.

Reads return current activity metadata with sessions/areas. History and Totals use
the same matching rules. CSV deliberately receives the full saved-session list.
The four hash-navigation screens stay mounted, preserving timer and form state.

## Stable identities and compatibility

- `courses` remains the activity table for compatibility. Existing IDs are preserved.
  Original built-in client IDs stay the three UUIDs; `recordId` identifies their
  owner-specific stored row (`builtin UUID:owner`).
- `learning_areas` uses owner + stable ID as its key and owner-scoped normalized
  unique names. Rename updates the name/revision, not identity.
- Activity area/type/status are independent current metadata. Revision detects
  stale activity writes. Area moves never rewrite session timing or notes.
- `sessions.activity_id` is the stable association. Existing names remain for old
  clients and CSV. Activity renames retain existing atomic name/version handling.
- Reads prefer stable IDs; null references support old in-flight timer snapshots
  through name fallback. Unknown history stays visible in Unassigned.

Migration materializes previously virtual built-ins for existing owners without
overwriting overrides, valid types or lifecycle states. Both existing and new accounts initialize
on authorized writes, never reads or mentor access. Reserved Unassigned marks initialization so removed
starting areas are not recreated. New UI activities require an area; older clients
omitting it remain compatible through Unassigned. Retained unknown activity names
are represented as deleted records and cannot silently become stopwatch choices.

## Reporting and area deletion

Areas answer what subject; types answer how; activities name the actual task.
Reports use current classifications across all dates. Filters combine with AND;
activities narrow by area/type. An invalidated activity filter clears with an
explanation. Totals default to Learning Area and keep status splits inside groups.
Sum raw milliseconds before formatting. Inactive history remains in overall sums.

Occupied area deletion requires another non-system destination. The service
rechecks revision, destination, membership and open timers, then moves all members
and deletes only the label in one D1 batch transaction. Archived/deleted statuses
and complete sessions remain intact. Empty areas also require confirmation.
Archived activities can change area without restoration; other editing restrictions
remain. Activity history deletion is a separate flow.

## Goals

Migration 0006 creates only learning_goals. It does not alter existing tables,
backfill sessions or create example goals. Its composite owner/id key isolates
records per account. Each row stores name, inclusive start/end days, target in
whole-minute milliseconds, a JSON scope, revision counter, creation/update times
and a JSON array of meaningful goal edits. Scopes are all learning, area IDs, or
one stable public activity ID; owner-specific built-ins resolve through recordId.
There is no stored progress total, scheduled job, recurring goal or session ledger.

GET /api/goals resolves the authorized learner, reads definitions/current metadata
and completed sessions within the goals' combined date range. goalProgress maps
stable activity references (legacy null references fall back to names), matches
saved session.day inclusively, sums raw elapsed_ms per goal and returns results.
Paused/running sessions never count, even if the timer's optimistic local state
already shows stopped. Goals refresh after successful session saves, not local
stopwatch clicks. Independent overlapping goals never multiply saved session rows.
A per-request activity map avoids scanning the activity list for every session.

Current/upcoming/past is derived from today's India date. Past results use the
same current-classification calculation as all other goals: later session edits,
history deletion or activity reassignment update their results. Display rounding
never changes matching, completion checks or stored durations. Labels follow
renames; archive/retained deletion keep stable IDs and contributions.

POST /api/goals shares the owner/mentor write gate and origin checks. Validation
rejects invalid/reversed dates, empty selections, missing/foreign references,
non-positive or fractional-minute targets. Goal IDs and scope references are
server-validated. A guarded INSERT/UPDATE rechecks reference existence; updates
and deletes require the loaded revision so outdated forms cannot overwrite changes.
Edits append dated before/after field descriptions in the same UPDATE; no-op edits
do not produce history. Descriptions preserve old labels without keeping session
snapshots. Creating with the same ID/definition is retry-safe. Failed requests
preserve form input and instruct refresh before retrying ambiguous writes.

Area deletion first names referencing goals and blocks deletion, even for empty
areas and past goals. Its atomic membership-move/delete batch also guards against
concurrently created/edited goal references. Users edit goal scopes explicitly
before removal; automatic scope expansion to a destination area was rejected.
Other goals and every session survive goal deletion. Goal JSON backup exports
settings/history and derived results with a result timestamp; it is separate from
session CSV and does not implement import. Existing MCP tools are unchanged.

For a fresh isolated preview only, build to generate dist/server/wrangler.json,
apply earlier migrations as described in README, then apply the pending Goals
migration from that preview root:

    rtk proxy node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_learning_goals.sql

This changes only the named preview's local D1 database: --local prevents a remote
operation, --config identifies preview bindings, --persist-to selects preview
state and --file supplies the schema SQL. Expect a successful CREATE TABLE; verify
the Goals view can save and reload a synthetic goal. Apply once after checking the
local schema; do not replay an already-applied CREATE TABLE. Before a later approved
production release, take/verify a private backup and compare existing fields,
counts and exact durations. Sites will apply 0006 before uploading the Worker.

## Permissions and MCP

Sites supplies trusted identity headers. getLogAccess resolves the user's own
records or an explicit learner grant. All queries use that owner; no request may
choose an owner. withLogWriteAccess rejects mentor writes before database access.
UI hiding supplements these server checks. Origin/input checks cover area writes.

Mentor settings remain Sites secrets only: LEARNING_SHARED_OWNER_ID (the existing
learner Site-scoped ID), LEARNING_SHARED_VIEWER_EMAIL and LEARNING_SHARED_OWNER_NAME.
No records are copied. Authorized revocation removes the Site invitation and
sharing configuration; already exported records cannot be retracted. Plugin
installation in another account is separate from Site access.

MCP discovery exposes no private records. All three tools remain read-only.
Session filters apply before the 500-result cap and retain the existing date
default. Area name/ID resolution is owner-scoped. All-time activity/area summaries
include preserved inactive history. Additive metadata retains older response fields.

## Migration safety

SQL 0005 is a schema-only ordered migration, applied by Sites before Worker upload.
It adds nullable references and constant-default revision fields without changing
original records. Applied migration history is immutable. Inspect live schema after
failed publication before retrying.

The separate `lib/learning-area-backfill.ts` contains owner-scoped data statements.
`ensureAreas` runs them in one D1 transaction on the first authorized write; the
reserved Unassigned marker is written last. Every statement checks that marker, so
concurrent initialization and retries cannot overwrite assignments or recreate areas.
Mentor and ordinary reads never run it. The local backup-first runner uses the same
statements after applying a missing schema migration.

Mapping recognizes built-in IDs after renaming and the requested starting names.
Existing types/statuses are preserved. Unknown history is retained under Unassigned.
Do not infer classifications from notes.

Keep complete backups and checksums outside Git. Verify restoration and rehearse
backfill privately; compare pre/post original fields, counts and exact durations.
Sites offers bounded table reads but no native restore tool in this connector. A
verified logical backup is separate from [D1 native recovery](https://developers.cloudflare.com/d1/reference/time-travel/);
never claim a native recovery bookmark exists without checking it. Schema changes
are additive, so the previous Worker remains compatible if a code rollback is needed.

## Tooling lesson

iCloud placeholders can block a compiler in a dependency read without an error.
Confirm the file-read problem before changing app logic. Verification used resident
source plus the local changes and a frozen install of existing dependencies outside
iCloud. Keep tests strict. The older starter pnpm shell installer also assumes
Linux tools; portable setup uses direct frozen pnpm, not extra GNU installations.

## Local reliability repair (not published)

The page passes only the authenticated writable owner's ID as the recovery namespace.
InstantTimer persists its pending commands and the necessary confirmed session rows
before sending; promises are never serialized. A browser lock held for the tab's
lifetime prevents a second tab adopting its journal. Reload/new-tab recovery chooses
an unlocked owner journal and replays original IDs/times. A stale version or expired
unsent timestamp preserves the draft for review rather than abandoning the queue.
Explicit conflict review saves a separate local copy before loading server state.
Browser data remains on the user's device; no recovery payload is logged.

response_mode=ack is opt-in on browser write requests. Session acknowledgements
contain saved/id/operation_id/session/now; deletion returns session=null. Mutations
use RETURNING so confirmation does not require a subsequent SELECT. Already-applied
operations can read the affected row. Existing clients retain full-snapshot responses.
Goal/activity/area acknowledgements return saved and affected identifiers, followed
by independent reads. Post-save report errors must not imply that a write failed.

The shared boundedFetch supplies read/write deadlines, composed with caller abort
signals. A browser abort says nothing about whether the database committed. Timer
retries reuse operation IDs; other management actions remain explicit. Hidden
report effects do not fetch; request controllers coalesce simultaneous focus events.
Browser journals are not a substitute for server backups or missing-history repair.
