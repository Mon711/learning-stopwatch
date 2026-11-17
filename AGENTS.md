# Learning Stopwatch working agreements

## Start here

- Work locally in this checkout. Read README and `docs/status.md` before significant
  work; read `docs/architecture.md` for data/permissions/migrations/MCP, and `docs/decisions.md` before
  changing product semantics. Keep these documents current with meaningful changes.
- Publish or push source only with user authorization for that release. Goals is
  local-only until explicitly approved; the earlier Learning Areas approval does
  not cover it. Keep real records/secrets outside Git and synthetic fixtures.
- Use Git for individual commits; status records current unfinished work and limits.

## Verify before publishing

1. Open the existing Site source locally and preserve its project ID and audience.
2. Implement changes in the local checkout. Use an isolated local database and synthetic records for tests; keep production credentials and data out of local fixtures.
3. Run the relevant automated tests and production build, then test the changed user journeys in a real local browser. Verify history, totals, CSV and MCP when activity/session behavior changes.
4. Delegate browser work to a focused subagent. At dispatch time, select a currently available fast, lower-cost model with browser/tool support and medium reasoning (or the nearest supported level). Recheck available models and current official guidance; keep model names out of durable instructions. Give it the local URL, scenarios, expected outcomes and a prohibition on production writes. Require a concise pass/fail report and evidence.
5. Fix observed failures and rerun affected checks. Passing automated tests AND browser QA are required before pushing source or publishing. If either is unavailable, report the blocker and keep changes local unless the user explicitly changes this requirement.
6. Push only the tested source state, package that same commit through the Sites workflow, deploy the saved version, and confirm deployment success. Recheck any code changed after validation. Preserve the existing audience.

## Activity data rules

- Archiving always preserves session history and tracked time; archived activities can be restored.
- Deleting an activity preserves history and tracked time by default. Delete its sessions only when the user explicitly selects the separate history-deletion option; the option starts unchecked each time.
- Keep archived/deleted activity records available to authorized MCP reads. Retained sessions continue contributing to totals and exports. Explicitly deleted history cannot be returned.
- Enforce ownership and read-only mentor restrictions on the server. Block removal while the activity has a running or paused session.
- Area and type are independent current activity metadata. Moving an activity
  regroups historical time without rewriting session timing/notes. Default totals
  grouping is Learning Area. CSV always includes all saved history despite filters.
- Occupied area deletion requires atomic reassignment of all members, including
  inactive records. It must never delete an activity/session. Keep stable IDs and
  compatible names/CSV fields; handle virtual built-ins per owner.
- Back up before migrations and compare original fields/counts/exact durations.
  Keep hosted migrations schema-only; owner backfill lives in learning-area-backfill.ts.
  The local runner has no remote mode; verify the live schema and backfill after publication.
- Goals store definitions and lightweight edit history; derive progress from saved
  completed sessions and current activity classifications, including past goals.
  Respect inclusive India start-date ranges and sum exact milliseconds.
- Block area deletion while any current, upcoming or past goal references it;
  users must edit goal scopes explicitly. Keep reference/revision guards inside
  writes so concurrent edits cannot leave dangling scopes or partially move areas.
- MCP stays read-only with owner-safe activity/area reads. Recurrence, Activity
  Type goals and Graphify remain deferred. Add no dependencies for these features.

## Explanations

Explain technical changes in beginner-friendly language: purpose, previous/new behavior, important steps, assumptions, risks and how to verify.

## Workflow sources

For instruction discovery or agent selection changes, consult [OpenAI AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md) and [OpenAI subagents](https://developers.openai.com/codex/subagents). For browser test design, follow [Playwright best practices](https://playwright.dev/docs/best-practices): isolated data and checks of user-visible behavior.
