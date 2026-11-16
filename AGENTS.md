# Learning Stopwatch working agreements

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

## Explanations

Explain technical changes in beginner-friendly language: purpose, previous/new behavior, important steps, assumptions, risks and how to verify.

## Workflow sources

For instruction discovery or agent selection changes, consult [OpenAI AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md) and [OpenAI subagents](https://developers.openai.com/codex/subagents). For browser test design, follow [Playwright best practices](https://playwright.dev/docs/best-practices): isolated data and checks of user-visible behavior.
