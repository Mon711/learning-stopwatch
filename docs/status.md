# Current status

17 November 2026 · Flexible Goals is implemented locally; no source push or
publication is authorized. Production remains Learning Areas, Sites Version 16.

## Implemented locally

- Fourth Goals screen with current goals and expandable upcoming/past sections.
  Name, inclusive dates, target hours/minutes and all-learning/multi-area/single-
  activity scopes are editable. Week, rolling 7/14-day and month presets only fill
  editable dates; no personal goal or schedule is hardcoded.
- Owner-scoped database persistence, exact saved-session progress, above-target
  percentages, remaining time and creation/edit details. Past goals remain until
  explicitly deleted and recalculate with corrected source records/classifications.
- Server validation, mentor write rejection, reference/revision checks and
  confirmation for goal deletion. Referenced areas cannot be deleted until goal
  scopes are explicitly updated, including past/empty-area goals. Concurrent goal
  references block the entire area reassignment transaction.
- Additive schema-only migration 0006 creates learning_goals. No existing session,
  activity or area fields are rewritten by that migration. No stored progress
  ledger, new dependencies, MCP tools, recurrence, reminders or Activity Type goals.
- Separate JSON goal backup; the full-session CSV and timer workflows stay intact.
  README, AGENTS, architecture and decisions document the resulting behavior.

## Verification

- Node 22.20.0: TypeScript and all 49 automated tests pass; production build passes.
  The 12 Goals tests cover validation, inclusive India dates, rolling presets/leap
  month/year changes, exact durations, overlapping scopes, overnight/paused/manual
  sessions, corrections/deletion, past results, retained inactive records, renames,
  reclassification, revision/reference races, area protection and owner/mentor access.
- Migration preservation checks compare all existing session/activity/area fields.
  Goal operations preserve exact session rows, counts, totals and CSV output.
  Existing timer retries/conflicts, filters, activity lifecycle and read-only MCP
  regressions remain green.
- Isolated synthetic preview: /private/tmp/learning-stopwatch-goals-preview,
  backend http://127.0.0.1:5191, browser http://localhost:5192/#goals. Temporary
  preview/browser servers are stopped after QA. It uses exact
  existing dependencies and no production credentials or copied database state.
  The disposable 5192 loopback proxy supplies the existing dummy local identity
  because the browser cannot complete the preview's sign-in redirect. It lives
  outside shipped source; hosted authentication is unchanged.
- Delegated browser QA passes all three scopes, retrospective/zero/over-target
  results, presets/validation, meaningful edit history, reloads, goal confirmation,
  keyboard/Escape and focus restoration after deletion/date regrouping. Timer and
  notes survive navigation; pause/resume/save, manual add/correct/delete and goal
  refresh work. Referenced-area deletion is blocked with the goal named.
- Desktop 1280×900 and mobile 390×844/320×800 pass in both themes without horizontal
  overflow. The 320×640 form fits and scrolls with visible footer actions. Actual
  theme toggles persist correctly across reloads in both directions. Activity
  rename, archive and restore pass. Complete screenshots were visually reviewed.
- A filtered History download contains all five synthetic sessions present at
  export, not just matches. Separate JSON download parses with settings/history
  and timestamped results. Both downloads are saved as evidence before QA cleanup;
  the isolated preview now retains only the three seed sessions and four demo goals.
- Evidence and full test/build logs: sibling
  review-artifacts/2026-11-17-goals/ (outside source Git). Tests use browser viewport
  emulation rather than physical phones. Hosted Goals behavior is not yet tested.

The implementation is ready for an approved production release, subject to the
backup/migration/publication checks below. No known implementation blockers remain.

## Release boundary

No Goals migration, goal creation, session mutation, source push or deployment has
been performed against production. After explicit approval, take a fresh private
backup, verify restoration/schema and preservation, then follow Sites publication
checks for the exact tested source. Migration 0006 has only been applied locally.
Keep the existing Site ID, audience and mentor configuration.

## Existing live baseline

Learning Areas is live as Version 16 from runtime source
b8c44f9a5acfdda8ae29de18d14480e67813ddc6. Its first authorized owner backfill was
verified against a restored private logical backup: original fields, counts and
exact durations were unchanged. No session was created/edited during that release.
Live area grouping, combined filters, retained history and read-only MCP were
verified. A live CSV download was not confirmed; synthetic browser download and
full-history CSV regression checks passed. Native D1 recovery was not exposed.

Private backups and review artifacts remain outside Git. iCloud placeholder reads
can stall Git or dependencies; use resident isolated verification with unchanged
locked versions rather than weakening checks or changing dependencies.
