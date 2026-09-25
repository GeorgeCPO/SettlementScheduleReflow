# Settlement Schedule Reflow

Reschedules settlement tasks around dependencies, channel conflicts, operating hours and blackout windows.

Needs Node 24+.

```bash
npm install
npm start                              # run all scenarios
npm run scenario -- 01-delay-cascade   # run one
npm test
npm run typecheck                      # tsc; tests and start don't typecheck
```

Scenarios live in `data/scenarios/*.json`. Add a file there and it gets picked up. All dates are UTC.

## Approach

`ReflowService.reflow` ([src/reflow/reflow.service.ts](src/reflow/reflow.service.ts)) works on a copy of the input in four steps:

1. **Book the regulatory holds.** Each hold's original start–end span goes onto its channel's list of bookings before anything else is placed. Holds never move.
2. **Sort by dependency.** `sortByDependencies` ([src/reflow/dag.ts](src/reflow/dag.ts)) uses Kahn's algorithm. When several tasks are ready at once, the one with the earliest original start goes first, so the order is deterministic and stays close to the original plan.
3. **Place each task in that order.**
   - **Earliest start:** `max(original start, end of each dependency)`.
   - **Working time:** prep time (if any) plus duration. Prep runs first, in the same slot.
   - **End date:** working time is counted only while the channel is open, which means operating hours minus blackouts. When the channel closes, the count pauses and resumes at the next opening.
   - **Finding a slot:** start at the first open minute from the earliest start and work out the end. Then go through the channel's existing bookings in time order:
     - If the task ends before the next booking starts, it fits.
     - Else If the two overlap, move the start to the first open minute after that booking, work out the end again, and check the next booking.
   - **Booking:** the chosen start–end span is added to the channel's bookings, so later tasks can't use it.
   - **Holds** aren't placed. If a dependency ends after the hold starts, the reflow throws an error.
4. **Check settlement deadlines.** Every task must end on or before its trade order's `settlementDate`.

A task's start never moves earlier than its original start: tasks only ever move later.

### Example: Mon 15:00 → Tue 09:00

A 120-minute task starts Mon 15:00 on a channel that is open Mon–Fri 08:00–16:00:

- Mon 15:00–16:00: 60 minutes of work, then the channel closes.
- Mon 16:00–Tue 08:00: paused.
- Tue 08:00–09:00: the remaining 60 minutes.

The task ends Tue 09:00, and the channel is booked for the whole span from Mon 15:00 to Tue 09:00.

## Output

`reflow` returns a `ReflowResult` ([src/reflow/types.ts](src/reflow/types.ts)):

- `updatedTasks`: every task with its new `startDate`/`endDate`, in the caller's order. The input is not mutated.
- `changes`: one `TaskChange` for each task whose start or end changed. It holds the old and new dates, the start and end shifts in minutes, and `reasons`, which are recorded while the task is placed. The possible reasons are `waited for X`, `channel busy with X`, `blackout: <reason>` and `outside operating hours`.
- `explanation`: one sentence per change, in the same order as `changes`.

The brief's example (scenario 02) produces this change:

```json
{
  "taskReference": "STL-20240115-101",
  "oldStartDate": "2024-01-15T15:00:00Z",
  "newStartDate": "2024-01-15T15:00:00Z",
  "oldEndDate": "2024-01-15T17:00:00Z",
  "newEndDate": "2024-01-16T09:00:00Z",
  "startShiftMinutes": 0,
  "endShiftMinutes": 960,
  "reasons": ["outside operating hours"]
}
```

`npm start` prints each task's new dates, then its explanation or `unchanged`:

```
=== Regulatory hold & channel conflict ===
STL-20240117-201  2024-01-17T10:00:00Z → 2024-01-17T11:00:00Z
  unchanged
STL-20240117-204  2024-01-17T12:30:00Z → 2024-01-17T14:30:00Z
  STL-20240117-204 moved start by 90 min, end by 150 min (channel busy with STL-20240117-203, blackout: CLS settlement cut-off).
```

## Assumptions

- All times are UTC. Operating-hour days are UTC days, and `dayOfWeek` counts from Sunday = 0.
- Operating hours have an inclusive `startHour` and an exclusive `endHour`, so 8–16 means 08:00–16:00. An `endHour` of 0 means midnight at the end of the day, so 0–0 is open all day.
- The end date of a non-hold task is recalculated from its start and working minutes, and the `endDate` in the input is ignored. A hold keeps its `startDate` and `endDate` exactly as given.
- Regulatory holds aren't checked against operating hours or blackouts, and the code doesn't check that a hold's channel exists.
- Scenario JSON isn't validated at runtime. The code trusts it to match `src/reflow/types.ts`.

## Errors

`reflow` throws when:

- the dependencies contain a cycle, including a task that depends on itself (`Circular dependency found`).
- a task depends on an unknown task id.
- a non-hold task uses an unknown settlement channel.
- a task belongs to an unknown trade order.
- a dependency ends after the start of a regulatory hold that depends on it.
- a task ends after its trade order's `settlementDate`. Ending exactly on the deadline is fine. One error lists every breach and the reasons each task moved.
- a channel has no operating hours, or has no open time within 366 days of the time the code is looking from.

`npm start` runs each scenario separately. It prints the error for a failed scenario, carries on with the rest, and exits with code 1.

## Scenarios

- `01-delay-cascade`: a late fund transfer pushes a four-task dependency chain later. The last task pauses overnight.
- `02-market-hours-blackout`: the brief's Mon 15:00 → Tue 09:00 example, plus a task that pauses for a Fedwire maintenance blackout.
- `03-regulatory-hold-conflict`: a fixed compliance hold and two trade orders competing for one channel, plus a blackout and an overnight pause.

Each scenario's `description` lists its expected results, and `tests/scenarios.e2e.test.ts` asserts them.

## Trade-offs and known limitations

These come from the `@upgrade` comments in the code.

- **Greedy placement.** Tasks are placed one at a time in dependency order. The result always satisfies the constraints but isn't optimal: an earlier task can take a slot that a later task needed more.
- **Overlapping holds are accepted.** Two regulatory holds on the same channel that overlap are not rejected.
- **366-day search limit.** A channel that stays closed for longer than 366 days is treated as an error.
- **Cycle error has no path.** It says a cycle exists but not which tasks are in it.
- **Ready-list re-sort.** Kahn's ready list is re-sorted before every pick. A min-heap would scale better on large schedules.

Not built yet:

- Metrics, such as total delay or channel utilization.
- An independent constraint checker that validates a finished schedule separately from the code that produced it.

## Project layout

```
src/
  index.ts                  CLI: runs one scenario or all of them and prints the results
  reflow/
    reflow.service.ts       ReflowService.reflow: holds, placement, deadlines, changes
    dag.ts                  Dependency sort (Kahn's algorithm) and cycle detection
    types.ts                Input and output types
  scenarios/
    load-scenario.ts        Lists and loads data/scenarios/*.json
  utils/
    date-utils.ts           UTC parsing, open intervals, end dates across closed time
tests/
  dag.test.ts               Dependency order, unknown ids, cycles
  date-utils.test.ts        End-date calculation across hours, weekends, blackouts
  reflow.service.test.ts    Placement, holds, reasons, deadlines, prep time
  scenarios.e2e.test.ts     The three scenarios end to end (the spec)
```

## AI usage

The project was built with an Claude code. The prompts behind each step are in [`prompts/`](prompts/), numbered in the order the steps were done.
