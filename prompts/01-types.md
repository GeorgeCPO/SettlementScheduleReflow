# 01 — Domain types

## Prompt

> Okay, let's work on the types

Follow-up:

> I see you've made some assumptions in the reflow input/output section. Discard them

## Outcome / decisions

- `src/reflow/types.ts` mirrors the document shapes from the brief: a generic `Document<T, TData>` wrapper
  (`docId`, `docType`, `data`) with `SettlementTask`, `SettlementChannel` and `TradeOrder` built on it.
- `TaskType`, `OperatingHours` and `BlackoutWindow` are extracted as named types for reuse.
- Doc comments pin down the ambiguous semantics: `durationMinutes` is working time (paused time doesn't count),
  `endHour` is exclusive, regulatory holds are never moved, all `dependsOnTaskIds` must complete first.
- Added optional `prepTimeMinutes` on the task (bonus requirement; counts as working time).
- Discarded the AI-proposed reflow input/output types (`ReflowInput`, `TaskChange`, `ReflowResult`, change reasons):
  they were assumptions ahead of the algorithm. They'll be defined when the reflow service needs them.
