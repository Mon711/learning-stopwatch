# Current status

17 November 2026 · Learning Areas is live as Sites Version 16.

## Implemented

User-managed areas, activity assignments, area-default totals with Activity/Type
alternatives, combined History/Totals filters, current-classification reporting,
status-preserving reassignment/deletion, full-history CSV, stable references and
read-only MCP activity/area queries. Styled dropdown menus have padded animated
right/down arrows, both themes and reduced-motion support. Weekly targets and
Graphify remain deferred.

## Verification

- TypeScript and all 37 automated tests pass; production build passes using Node
  22.20.0 and unchanged locked dependencies in the isolated verification copy.
- Delegated local browser QA passes area creation/rename/deletion, grouping, combined
  filters/reset, light/dark themes and 320px layouts. Earlier full QA covers timer
  saves/notes, inactive history, reassignment, keyboard/Escape and full CSV download.
- Tests cover owner isolation, migration backups/reruns, exact preservation,
  retained history, reporting combinations, CSV, timer retries and MCP permissions.
- Fresh private production backup has a verified checksum and full-field local
  restoration. Migration rehearsal preserves original session/activity fields,
  session count and exact durations. Personal counts/totals stay outside Git.
- Hosted migration is schema-only. The owner-scoped atomic backfill runs on the
  first authorized write, marks completion last and does not mutate on reads.

## Publication status

Published successfully through Sites from runtime source commit
`b8c44f9a5acfdda8ae29de18d14480e67813ddc6`. GitHub main received the same source
tree, preserving its existing history. Hosting applied the additive schema before
Worker upload. The owner-scoped backfill completed through an authorized area write.
A temporary empty release-check area was removed; no sessions were created or edited.

Live pre/post comparison verified unchanged original session/activity fields, counts
and exact duration sums, with every stable session reference and area mapped. Exact
personal counts/totals and complete snapshots remain only in private local backups.
Live UI verified area grouping, combined area/type filters, reset and retained history.
MCP reads verified area names/IDs and combined activity/type filters against the
saved records. Existing audience and read-only mentor configuration are unchanged.

The automated live CSV download check timed out. Full-history CSV regression checks
and an actual synthetic browser download passed locally; a live download was not
confirmed. Native D1 recovery is not exposed by the connector; the private logical
backup was restored locally and the migration rehearsed before deployment.

## Working notes

Source is maintained in the Sites checkout. Private backups and review artifacts
are in sibling directories outside Git; never publish them. Synthetic verification
uses `/private/tmp/learning-stopwatch-phase2-qa`, which is disposable and contains
no production credentials. Some iCloud placeholder dependency reads hang; use the
resident verification copy with exact locked dependencies rather than changing versions.
The starter Linux install helper needs GNU tools; portable checks use direct frozen
pnpm. No extra tools were installed.
