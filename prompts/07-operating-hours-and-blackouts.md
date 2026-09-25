# 07 — Operating hours and blackout windows

## Prompts

> Make tasks process only while their channel is open, so end dates reflect real working time. `durationMinutes`
> counts working minutes only. Work pauses outside the channel's operating hours (UTC, `endHour` exclusive) and
> during its blackouts, then resumes at the next open minute. The whole span, pauses included, occupies the
> channel. A start in closed time moves to the next open minute. Regulatory holds stay fixed and aren't checked
> against hours. A channel with no open time must throw instead of looping. Scenarios 1 and 2 are the acceptance
> check.

> Put the working-time calculation in one Luxon helper in `date-utils.ts` that walks whole open intervals rather
> than single minutes, and have `findFreeSlot` take the task's channel so a slot's end comes from that helper.
> Write the helper's unit tests first: the brief's example, a weekend, a mid-task blackout, a start in closed
> hours, and no operating hours. Switch the existing service fixtures to an always-open channel so they keep
> testing what they tested before. Mark anything deferred with `@upgrade`.

> `endHour` can't be 24: midnight is 0. Express "open until midnight" that way instead.

> Have a sub-agent review the change with concise context: the rules, the known deferrals and my style
> preferences. Focus on correctness and edge cases, and only report what it can back with a failing input.

> Add the service tests the review found missing: a hold sitting inside a task's overnight pause, a start inside a
> blackout, a blackout pause that blocks another task, and the unknown-channel error.

## Outcome / decisions

- `src/utils/date-utils.ts`:
  - `calculateEndDateWithOperatingHours(start, minutes, channel)` takes the channel's open intervals one at a
    time and uses them up until the remaining minutes fit in one. A task that ends exactly at closing time ends
    then, not at the next opening.
  - `nextOpenMinute(from, channel)` moves a start out of closed time or a blackout.
  - Each day's open intervals are its operating hours minus its blackouts, using Luxon's `Interval.difference`.
  - It throws a descriptive error when a channel has no operating hours, or no open time within 366 days
    (`OPEN_TIME_SEARCH_DAYS`).
- `endHour: 0` means midnight at the end of the day, so 0–0 is open all day. The `types.ts` comment now says so.
- `ReflowService` looks channels up by id from `input.settlementChannels` and throws if a task's channel is
  missing. `findFreeSlot` returns the whole slot. The candidate's start is always an open minute and its end
  comes from the helper. After a clash, the next candidate starts at the channel's next open minute after that
  booking.
- Holds are still booked and checked by their stored dates only.
- Marked `@upgrade`:
  - the fixed 366-day search limit
  - `prepTimeMinutes` is still ignored
  - overnight windows such as 22–6 aren't supported
- Tests:
  - `tests/date-utils.test.ts` is new, covering the helper and its error paths.
  - `tests/reflow.service.test.ts` uses always-open channels (0–0 every day) for the earlier cases. New cases
    cover:
    - pauses (overnight and blackout) blocking other tasks
    - starts in closed hours or inside a blackout
    - a hold in closed time kept fixed
    - a hold inside a paused span
    - an unknown channel
  - All e2e expectations for scenarios 1 and 2 now pass.
- The sub-agent review found no correctness bugs. It confirmed blackouts that overlap or span several days,
  zero-minute tasks, and termination all behave correctly.
