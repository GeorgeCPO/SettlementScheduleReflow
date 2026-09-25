# 08 — Changes and explanation

## Prompts

> Make the reflow explain itself. Add `changes` and `explanation` to the result, replacing the `unknown`
> placeholders with real types that only have the fields this step needs. Each changed task gets its reference,
> old and new start and end, the shift in minutes for each, and the reasons it moved. Record the reasons while the
> task is being placed instead of guessing them afterwards: a dependency that pushed the earliest start
> ("waited for <ref>"), a booking on the channel that pushed it ("channel busy with <ref>"), closed hours that
> moved the start or paused the work ("outside operating hours"), and blackouts that did the same
> ("blackout: <reason>"). Unmoved tasks, regulatory holds included, get no entry. `explanation` has one readable
> sentence per change.

> Test first: one unit test per reason, e2e expectations for both scenarios, and the expected changes added to
> each scenario's `description`. In the CLI, print under each task how far it moved and why, or "unchanged".

> The diff is too large for what it does. Make it more minimal: reuse the existing open-interval helper instead of
> refactoring it, build the explanation inline, have the CLI print the explanation sentence, and let the e2e tests
> check the sentences, since they already contain the shifts and reasons. Keep the verbose style where it helps
> readability.

## Outcome / decisions

- `src/reflow/types.ts`:
  - `TaskChange` holds `taskReference`, old and new start and end, `startShiftMinutes`, `endShiftMinutes` and
    `reasons`.
  - `ReflowResult.changes` is `TaskChange[]` and `explanation` is `string[]`, both in the caller's task order.
  - `Booking` gained `taskReference`, so a task pushed past a booking can name what held the channel.
- `src/utils/date-utils.ts`: `closedTimeReasons(from, to, channel)` explains why a channel is closed during a
  span. It lists every overlapping blackout, and adds "outside operating hours" if any of the span is neither open
  (from the existing `openIntervalsOn`) nor inside a blackout.
- `ReflowService` collects reasons per task during placement:
  - `earliestAllowedStart` names the dependency that finishes last, if it pushed the start later.
  - `findFreeSlot` records each booking that pushed the candidate, and any closed time skipped to reach the next
    open minute. It then records the pauses inside the chosen slot.
  - Reasons are deduplicated and kept in the order they happened.
  - Afterwards each task is compared with its input. A task whose start or end changed becomes a change with a
    sentence such as "STL-004 moved start by 120 min, end by 1080 min (waited for STL-003, outside operating
    hours)."
- CLI: under each task it prints that sentence, or "unchanged".
- Tests:
  - `tests/reflow.service.test.ts` has one test per reason, plus one checking that unmoved tasks and holds produce
    no change. The `task()` fixture's planned end is now start + duration, so tasks that aren't moved really don't
    change.
  - `tests/scenarios.e2e.test.ts` checks the explanation sentences for both scenarios. Both scenario descriptions
    list the expected changes.
- Known limitation: a blackout that falls inside hours when the channel is already closed, such as on a weekend,
  is still listed as a reason if the task's pause spans it.
- The minimal pass cut the diff from about +327/−33 lines to +233/−21.
