# 09 — Scenario 3: regulatory hold and channel conflict

## Prompts

> Propose a third scenario covering what the first two don't: a regulatory hold, competing tasks on one channel,
> and a task with several dependencies. Combine it with a blackout and an overnight pause so one scenario exercises
> every constraint together.

> Add it as a scenario file with the expected results in its `description`, plus an e2e block matching the others.

## Outcome / decisions

- Added `data/scenarios/03-regulatory-hold-conflict.json`: a compliance hold lands on a busy FX desk, and the
  displaced work cascades across two trade orders.
- One trade order deliberately misses its settlement date, so SLA detection has a case to flag later.
- Added a Scenario 3 block to `tests/scenarios.e2e.test.ts`.
- No algorithm changes were needed.
