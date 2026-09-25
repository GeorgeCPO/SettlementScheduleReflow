# 10 — Settlement deadlines

## Prompts

> Make the reflow reject schedules that are impossible to meet. Every task belongs to a trade order, and the
> order's `settlementDate` is its SLA deadline. After all tasks are placed, check each task's new end against its
> deadline. Collect every breach and throw once, so the user sees the whole problem rather than one breach at a
> time. Each breach names the task, its new end, the deadline and the reasons it moved, reusing the reasons already
> recorded during placement. A task whose trade order is missing from the input is an error too.

> Test first: unit tests for a single breach, several breaches, ending exactly on the deadline (allowed) and a
> missing trade order. Existing scenarios must still pass.

## Outcome / decisions

- `ReflowService` gained a step 3, `assertSettlementDeadlines`, run after placement:
  - It checks every task and joins all breaches into one error, one per line, e.g. "Task STL-004 cannot meet
    settlement deadline 2024-01-17T16:00:00Z: ends 2024-01-18T09:00:00Z (waited for STL-003, outside operating
    hours)". A task with no recorded reasons (it wasn't moved) gets no brackets.
  - Ending exactly on the deadline is allowed.
  - A missing trade order throws "Task X belongs to unknown trade order Y", like the unknown-channel error.
- Scenario 3: `trd-202` settled Wed 16:00 but STL-206 ends Thu 08:30, so the new check rejected it. Its
  `settlementDate` moved to Thu 2024-01-18T16:00:00Z so the scenario's expected schedule still holds.
- Tests: `tests/reflow.service.test.ts` has a `tradeOrder()` fixture, the helpers default to an order with a
  far-off deadline, and there are four deadline tests.
