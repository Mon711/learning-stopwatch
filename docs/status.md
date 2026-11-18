# Local reliability repair — 18 November 2026

Local implementation only, uncommitted and not pushed or published. Production
remains Version 17. Pending timer commands now have account-scoped browser recovery,
with a tab-lifetime browser lock, original click timestamps/notes, automatic safe
retry, explicit conflict review and a downloadable recovery copy. Manual forms keep
an account-specific recovery draft. Browser storage is a recovery aid, not a backup;
clearing browser data removes it. Keep the tab open if storage is unavailable.

Compact write acknowledgements separate committed changes from report reads. Timer
mutations return their affected row atomically with SQL RETURNING; older clients
still receive their original snapshots. Identical manual retries remain safe;
changed-input retries require correction. Duplicate operation checks precede the
24-hour clock guard. Unsaved old/conflicting commands remain available for review.

Browser reads time out after 10 seconds and writes after 15 seconds. Retryable timer
failures receive three retries, respecting Retry-After, with online/manual recovery.
Hidden reports no longer fetch; visible refresh triggers are coalesced. Metadata
reads share areas. History calculations/rows and report rendering are memoized;
the display tick is one second while click timestamps retain exact milliseconds.
Safe error diagnostics include phase and session action/operation/duration.

Publication preparation must retain the prior release's hashed client files with
scripts/retain-client-assets.mjs after building and before packaging. This helper
is not automatically invoked by ordinary builds. It refuses same-name/different-
content collisions. The initial HTML has a missing-script recovery message. Actual
Sites serving of retained assets and cross-release propagation remain unverified;
publication stays blocked until the prepared artifact passes that hosting check.
The original production D1 failure's infrastructure cause remains unresolved.

Verification: TypeScript and all 54 automated tests pass. Fresh isolated production
build and delegated browser tests pass the core recovery/loading/management journeys.
See the sibling review-artifacts/2026-11-18-reliability-implementation/
folder for the final browser report. Automated checks and final browser results are
recorded there when complete. No production records or credentials are test fixtures.

---

# Current status

17 November 2026 · Flexible Goals is live as Sites Version 17 after explicit
backup, source push and deployment approval.

## Implemented

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
  emulation rather than physical phones. Hosted verification is recorded below.

The release is deployed and verified. No known implementation blockers remain.

## Production release verification

- Fresh complete logical backup: two read-only passes matched without truncation.
  Its SHA-256 was verified; every field restored into private local SQLite, passed
  integrity_check, and survived migration 0006 unchanged. Backup and restoration
  evidence are in sibling local-backups/2026-11-17/goals-release/ outside Git.
  This is a verified logical backup, not a native D1 recovery bookmark or atomic
  export. No production records were copied into synthetic test fixtures.
- Release checkout reran TypeScript/all 49 tests and built successfully. The
  generic package-manager launcher failed before building due to its Corepack
  signature setup; direct verified Node 22.20.0 used the existing build script.
  No dependency, runtime source or hosting identity was changed to fix tooling.
- Sites source ae70bd9daad26f8cac02e4324493e205454ac1e8 was packaged and deployed
  successfully as Version 17. GitHub main c4611f3b490d55abfd13d63d215988abd878aca9
  preserves its separate history. Both and local approved 85b5bfb have identical
  source tree 5485501c104ffcc7ca12b3dca77e5036dcba7fac. Later documentation-only
  commits record this release without changing the deployed runtime.
- Live migration created the expected learning_goals columns and an initially
  empty table. Full pre/post comparison and a second comparison after live QA
  verified every original session/activity/area field and row unchanged, with the
  same counts and exact duration sums. Existing audience/mentor settings remain.
- Native Chrome verified live goal create, edit, retrospective monthly progress,
  meaningful change history and reload persistence. Its precise progress matches
  the saved-session sum independently calculated from the backup. The explicitly
  authorized temporary verification goal was deleted; no goals or test sessions
  remain from release QA. No existing session/activity/area was written.
- Live History and Learning Totals show the preserved records. Read-only MCP area
  reads work. Chrome reports the production CSV download completed (7.4 KB); its
  downloaded bytes were not available in the executor for a second content check.
  Local full-history CSV tests and browser download content checks remain green.
- The first post-deployment page reused old cached JavaScript hashes and received
  two chunk 404 responses. A hard refresh loaded Version 17 successfully; repeated
  subsequent page/API journeys succeeded. If an already-open tab shows a load
  error after an update, use a hard refresh. This did not affect saved data.

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
