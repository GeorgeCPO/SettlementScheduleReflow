# 06 — Basic reflow (dependencies, channel conflicts, regulatory holds)

## Prompts

> Plan the core scheduling pass before writing code. Cover dependencies, one task at a time per channel, and
> regulatory holds that never move. Leave operating hours and blackout windows for the next step, since both
> come from the same working-time calendar. Say which e2e cases should pass afterwards.

> Go ahead with the plan: tasks never start earlier than originally planned, and blackouts wait for the next step.
> Write the unit tests first.

> The solution is hard to follow. Refactor it so the main method reads like the algorithm, with each step in a small
> named function, and walk me through it using scenario 1.

> Prefer verbose, explicit code over dense one-liners such as assignments inside expressions or spreading into
> `max(...)`. Plain `if` blocks, named variables and loops read better.

> Leave `prepTimeMinutes` out of this phase so it stays focused on placement. Move `Booking` into `types.ts`
> with the other domain types.

> Have a sub-agent review the change with the full context: scope, decisions already made, and style preferences.
> Apply the style fix and the missing edge-case tests. Mark overlapping regulatory holds as an `@upgrade` instead
> of handling them now.

## Outcome / decisions

- `ReflowService.reflow` places tasks in two steps:
  1. Book every regulatory hold on its channel at its fixed dates.
  2. Walk the tasks in `sortByDependencies` order. Each task's earliest start is the later of its original start
     and its last dependency's end. A hold only checks that it can still start on time, and throws otherwise.
     Any other task moves to the first free gap on its channel at or after its earliest start, and that slot is
     booked.
- Tasks never move earlier than originally planned. Bookings are half-open `[start, end)`, so back-to-back tasks
  don't clash.
- `findFreeSlot` walks the channel's bookings in time order with a candidate start. A booking that's already over
  is skipped. The search stops when the task ends before the next booking starts. Otherwise the candidate moves to
  that booking's end.
- `Booking { start, end }` lives in `types.ts`. It replaced Luxon's `Interval`, whose nullable start and end forced
  `!` assertions. `toUtcIso` was added back to `date-utils.ts` and writes dates as `2024-01-15T13:00:00Z`.
- Out of scope for now: operating hours, blackouts, `prepTimeMinutes`, and `changes`/`explanation` in the result.
- Marked `@upgrade`:
  - greedy placement can be valid but not optimal
  - overlapping holds on the same channel are accepted without complaint
- `tests/reflow.service.test.ts` covers:
  - dependencies, including waiting for the latest of several
  - the never-earlier rule
  - channel conflicts, and tasks on different channels overlapping
  - holds: kept fixed, gap filling, back-to-back placement, dependents of a hold, and a hold that can't start on
    time
  - skipping a gap too small for the task
  - caller order is kept and the input isn't changed
- E2e: scenario 1 `task-001` to `task-003` pass. `task-004` and scenario 2 wait for operating hours and blackouts.
- Review follow-ups for later:
  - decide whether a hold's `endDate` or its `durationMinutes` is authoritative
  - compare `DateTime` values rather than strings when `changes` is added
  - put `start.plus({ minutes })` in one working-time helper
  - blackouts should pause tasks, not become bookings
