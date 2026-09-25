# 11 — Prep time

## Prompts

> Optional `prepTimeMinutes` is setup work done before processing. It counts as working time,
> pauses when the channel is closed or in a blackout, and runs in the task's own slot, so
> `startDate` is when prep begins and dependencies finish before it. Missing means 0; holds are unaffected.

## Outcome / decisions

- `moveToFirstFreeSlot` books prep + duration as one slot; the prep `@upgrade` is gone.
- Holds skip placement, so prep never applies to them.
- The test `task()` helper's planned end now includes prep, so an unmoved task with prep records no change.
