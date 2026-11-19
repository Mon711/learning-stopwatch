# Learning Stopwatch

A personal stopwatch with saved learning sessions, notes, history and totals.
Select an activity → Start → Pause/Resume as needed → Stop & save. Learning_Tracker
remains a separate main record; CSV export does not synchronize it automatically.

Read [AGENTS.md](AGENTS.md) before changing code and [status](docs/status.md) before
continuing development. See status for the current release and verification results.

## Features

- Four familiar screens: Stopwatch, Learning Totals, History and Goals. Navigation keeps
  the timer, selected activity, unsaved notes and correction drafts mounted.
- One Learning Area (subject) and one Activity Type (Course, Skill Practice,
  Project) per activity. No extra selection is required for each timer session.
- Create/rename areas, inspect their activities and change activity assignments.
  Deleting an occupied area requires reassignment and preserves every activity,
  lifecycle status and session. Unassigned is a reserved legacy recovery area.
- Totals default to Learning Area; Activity and Activity Type remain alternatives.
  Totals/History have independent, initially collapsed Area/Type/Activity filters.
  All selected conditions must match. Filters survive navigation, reset on reload,
  and never change the selected stopwatch activity or CSV contents.
- Archived activities can be restored. Deleted activities with retained history
  remain in History, totals, CSV and authorized MCP reads. Actual history deletion
  remains a separate, initially unchecked option in activity deletion.
- Manual session entry, corrections, notes and full-history CSV. Only completed
  sessions contribute to totals; paused time is excluded. Dates use Asia/Kolkata.
- Flexible time goals for all learning, multiple selected areas or one activity,
  with inclusive custom dates and week/fortnight/month presets. Current, upcoming
  and past goals persist, support edits and track progress from saved sessions.
- Light/dark themes, responsive layouts, keyboard controls, visible save/retry
  errors, and optional explicitly configured read-only mentor access.

Areas/types describe the activity today. Moving an activity regroups all its saved
history without changing session dates, notes or durations. Renaming an area
changes the same subject's label.

## Learning goals

Open **Goals → New goal**, choose a name, dates, target hours/minutes and scope,
then save. You can edit every setting later. Both dates count in Asia/Kolkata;
weeks run Monday–Sunday. Next 7/14 Days includes today. Presets only fill the date
fields; you can select any past or future range, including a single day.

Goals count completed, saved sessions using their start date and exact saved
milliseconds, excluding pauses and unfinished timers. Creating a goal includes
matching historical sessions immediately. Each overlapping goal counts the same
matching sessions independently; sessions are never copied. Above-target progress
can exceed 100%; the visual bar fills at 100%. Remaining time stops at zero.

A goal moves into Past Goals after its end date in India time and remains until
you explicitly delete it. **Past results remain live:** correcting/deleting a
session, moving its activity to another area, or explicitly deleting activity
history recalculates affected goals, including past goals. Renaming an activity
or area updates its displayed name. Archiving/deleting an activity while retaining
its history preserves its contribution. These rules match Learning Totals.

Goal details records the creation date and dated before/after descriptions of goal
name, date, target and scope edits. It records goal edits, not each session change.
To delete an area used by any goal, including a past goal or an empty area, first
edit those goals' scopes in Goals. The area deletion error names affected goals.
The app never silently replaces a goal's scope with the area's destination.
Old scope labels remain readable in the goal edit history after area deletion.

Goals save in the existing owner-scoped database, so they survive reloads and are
available on another signed-in device after refresh. The Goals view refreshes on
local saved-record changes, entry, window focus and every minute while visible;
Refresh goals checks immediately. Simultaneous edits use a revision number (a
saved edit counter) to reject an outdated form instead of overwriting newer work.
Read-only mentor access can view goals but cannot change them.

Back up goals downloads JSON with definitions, edit history and results as of the
last refresh. It contains no session copies and is not a database restore or import
feature. History's existing full-session CSV remains unchanged.

## Documentation map

| Need | Read |
|---|---|
| Purpose, features, setup and workflow | This README |
| Actionable agent constraints and required checks | [AGENTS.md](AGENTS.md) |
| Components, database, permissions, MCP and migration safety | [Architecture](docs/architecture.md) |
| Consequential choices and alternatives | [Decisions](docs/decisions.md) |
| Implemented/unfinished work and current verification | [Status](docs/status.md) |

Use Git for individual commits. Update the owning document with meaningful behavior
changes. Decisions explain why; status is a current handoff, not a growing diary.

## Architecture overview

React and TypeScript render the interface through Vinext/Vite. Server routes resolve
an authenticated owner or authorized read-only learner before reading Cloudflare D1
(hosted SQLite). Drizzle describes the tables and incremental SQL migrations. Sites
owns hosting, sign-in and runtime secrets.

The main screen coordinates the mounted timer and History; focused components own
Totals, shared filter controls and area management. Server services validate activity,
area and session mutations. The architecture document maps the owning files and the
compatible name-based/stable-ID references.

## Local development

Use Node >=22.13.0 and pinned pnpm 11.25.0. This change was tested with Node 22.20.0.
The default Node on this machine is older; select a compatible installed runtime.
Use the verified Node 22.20.0 for this change’s tests and migration runner, which
use Node’s SQLite backup API. No new application dependencies were added for Learning Areas or Goals.

Run commands from this source checkout, or from a fresh isolated browser-QA copy.
The `rtk proxy` prefix forwards the command without filtering its behavior.

1. `rtk proxy pnpm install --frozen-lockfile` restores exact existing dependencies,
   writes node_modules, may download packages/run their declared install scripts,
   and fails if the lockfile needs changing. Expect success with no lockfile diff.
   The existing install:ci shell helper assumes Linux tools; on macOS use the
   direct frozen install rather than adding unrelated GNU tools.
2. `rtk proxy pnpm test` checks TypeScript and runs synthetic SQLite tests. It
   compiles tests into a temporary directory and removes it afterward. It changes
   no application records. Expect all tests to pass.
3. `rtk proxy pnpm build` writes local build artifacts under ignored dist. It does
   not push/deploy. Expect a successful build and route list.
4. `rtk proxy pnpm dev -- --port 5187 --hostname 127.0.0.1` starts a local server.
   The port selects its local address; hostname restricts it to this computer.
   Open the printed Local URL and stop with Control-C. It writes ignored preview
   state; app actions change only that preview's local database.

Browser QA uses a fresh directory without .env files, prior .wrangler state or
production secrets. Keep the placeholder D1 ID configured by vite.config.ts.
Portable loopback preview sign-in at /signin-with-chatgpt?return_to=/ uses dummy
local_seedy identity. Hosted authentication remains platform-owned. Keep all local
Wrangler operations explicitly --local. Never seed a remote database.

Initialize a fresh local database with migrations 0000–0004 in order. Optionally
load tests/fixtures/legacy-local.sql before migration 0003; it contains invented
records. Apply the new area migration through the guarded runner below. Do not
blindly replay SQL files: SQLite ALTER TABLE ADD is not itself repeatable.
After 0005, apply 0006_learning_goals.sql once to that local preview; it only creates
the empty learning_goals table. Follow the local D1 procedure in Architecture.

## Backup and migration

Schema-only migration 0005 adds the area table, activity area/revision fields and
stable session references. A separate owner-scoped backfill preserves names, types,
statuses and session fields, materializes built-ins and retains unmatched history.
It runs atomically on the first authorized write; reads and mentor access never
initialize records. An initialization marker makes repeat writes harmless.

From the source root:

    rtk proxy node scripts/migrate-learning-areas.mjs /absolute/path/local.sqlite /absolute/path/private-backups

This changes the named LOCAL database. The first argument must be an existing
SQLite file; the second is a private backup directory outside Git. Before changes,
the runner makes a complete SQLite backup and SHA-256 checksum. In one transaction
it applies only a missing migration and checks original session/activity fields,
counts, exact durations and owner-safe references before committing. Failure rolls
back. A successful rerun reports already_applied without reseeding deleted areas or
replacing assignments. Its output identifies the backup and before/after totals.

The runner has no remote mode. Sites applies hosted schema migrations before
uploading the Worker. Before publication, take a complete private backup, verify
restoration and the current schema, and review mappings/open timers. After the first
authorized owner write, compare original fields, counts and exact durations. A failed
deployment may already have applied schema changes; inspect before retrying.

## CSV and read-only MCP

CSV exports ALL saved history regardless of report filters, including retained
inactive records. Its existing six columns and session IDs in Optional Notes remain
compatible with Learning_Tracker. Running/paused records are excluded.

POST /mcp exposes only read tools:

- get_learning_sessions: existing date/activity/include_in_progress arguments plus
  learning_area (name or stable ID) and activity_type. Filters combine with AND.
  Omitted date still means today in Asia/Kolkata. Use start_date/end_date for an
  inclusive date range, or all_dates=true for complete saved history. These date
  modes cannot be combined. Follow next_offset until null; each page has at most
  500 sessions, and its completed totals cover that page only. Keep filters the
  same on subsequent pages. If records change while paging, restart and reconcile
  by session ID. Exact duration_ms and current activity_status are also returned.
- get_learning_activities: all-time activity totals; optional status, activity,
  learning_area and activity_type filters, including retained inactive records.
- get_learning_areas: area IDs and all-time totals with active/inactive time splits.
- get_learning_goals: all saved current/upcoming/past goal definitions, resolved
  scope labels, exact target/progress, percentage, remaining/over-target minutes,
  status, timestamps and full definition edit history. Optional goal name/ID,
  period and target_reached filters. Past results stay live, matching the website.
- get_learning_totals: complete all-time or inclusive start_date/end_date reports,
  with Area/Type/activity/status filters and all three groupings, exact durations
  and active/inactive splits. Also returns matching saved running/paused timers
  across all dates, even when the report range excludes their start date.

For example, session tool arguments with learning_area AI Engineering, activity_type
Course and date 2026-11-17 retrieve that combination for that date. Use the activity
or area tools for all-time totals. New metadata is additive; callers cannot choose
an owner or write through MCP. Mentor reads use the same resolved learner.

The five tools cover the saved information behind Stopwatch, History, Learning
Totals, Goals and activity/area management. Session history supplies the data
behind the CSV export; goal reads include definitions/history/results corresponding
to the goal JSON backup. MCP returns data rather than clicking download buttons.
Theme preferences, unsaved notes/forms and timer recovery journals live only in
the owner's browser and are not server records. Explicitly deleted sessions/goals
cannot be recovered through MCP. Existing read-only mentor access is unchanged.

A mentor can ask the connected plugin: “Show all my learner's current, past and
upcoming goals with progress and changes”, “What is their current saved timer?”,
or “Summarize their learning by area and activity type for this month.” Shared
results identify the learner in data_owner and include access=read_only.
Installation/sign-in with the mentor's authorized account is still required;
another person's account connection cannot be verified from the owner's chat.
Complete MCP read coverage is published as Sites Version 19. A fresh chat may be
needed to discover the new tools after publication.

## Publication

The Sites source remote, optional GitHub mirror and live deployment are separate.
Preserve the existing Site ID and audience. Publish only with user authorization
and after the Sites/AGENTS checks; use the exact tested source state. Source pushes
are separate from deployments and must not be assumed to migrate production.
Never commit personal time logs, backups, databases, environment files, tokens or
screenshots containing real records. Test fixtures must contain invented data.

## Reliability repair — Version 18

Version 18 includes recovery for interrupted timer saves, request deadlines,
and reduced background report work. These changes are live. See docs/status.md
for verification and release limits. Recovery copies belong to this browser/account;
clearing browser storage removes them. If a conflict appears, download/review the
recovery details before choosing to load newer saved records. An older unsent action
is not automatically converted into invented historical data.
