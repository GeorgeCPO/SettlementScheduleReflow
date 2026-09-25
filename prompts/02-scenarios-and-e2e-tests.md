# 02 — Scenarios and end-to-end tests

## Prompts

> Wire up the main flow: a `ReflowService.reflow()` that follows the brief's example usage, called from
> `index.ts`. It can be a pass-through for now — I want the pipeline in place before the logic.

> Build the two required scenarios: a delay cascade through a dependency chain, and a task that crosses market
> hours and a blackout window. Make the expected outcome of each explicit, so it can be verified by hand.

> Let's go test-first. Write an end-to-end suite that runs the reflow on each scenario and asserts every task's
> expected start and end. It should fail now and tell us exactly what the algorithm still has to do.

> Make the scenarios to JSON files. Reviewers should be able to read and tweak the data without reading TypeScript.

## Outcome / decisions

- `ReflowService.reflow({ settlementTasks, settlementChannels, tradeOrders })` returns `updatedTasks`; it's a
  pass-through until the algorithm lands. `changes` / `explanation` stay loosely typed until then.
- `data/scenarios/01-delay-cascade.json`: a late fund transfer pushes margin check → disbursement → reconciliation,
  with the last task spilling past closing time into the next morning.
- `data/scenarios/02-market-hours-blackout.json`: the brief's own example (120 min from Mon 15:00, desk closes
  16:00 → completes Tue 09:00) plus a task pausing around a Fedwire maintenance blackout.
- Each scenario carries a `name` and a `description` stating the expected result, since JSON can't hold comments.
- `tests/scenarios.e2e.test.ts` asserts per-task dates, normalised to ISO so output formatting doesn't matter.
  It starts red (5 failing, 1 passing) — the failing cases are the roadmap for the algorithm.
