# 05 — Dependency ordering (topological sort)

## Prompts

> I've added a topological sort so tasks can be scheduled upstream-first. Review the local changes before we build
> on them: correctness (cycles, unknown dependencies, duplicates, determinism), fit with the project conventions,
> and anything that will get in the way of the scheduling step.

> Apply the review fixes, except showing which tasks form a cycle. That can wait until the error handling pass.

> Split the test run into unit and e2e scripts. The e2e suite stays red until the algorithm lands, so I need a way
> to check the unit tests on their own.

## Outcome / decisions

- `src/reflow/dag.ts`: `sortByDependencies` uses Kahn's algorithm. When several tasks are ready, the earliest
  original `startDate` goes first, and ties keep input order (stable sort), so the output is deterministic and
  close to the original plan. It throws on an unknown dependency id and on a cycle, including a self-dependency.
- Start dates are parsed once per task instead of on every comparison. `compareIso` and `toUtcIso` were removed
  from `src/utils/date-utils.ts`, since nothing uses them yet; only `parseUtc` remains.
- `ReflowService` sorts a copy of the tasks but returns `updatedTasks` in the caller's order. The sort only
  validates the graph for now; scheduling will walk the sorted order.
- Deferred: naming the tasks involved in a cycle, and a heap for the ready list (only matters for large schedules).
  Both are marked `@upgrade` in the code.
- `tests/dag.test.ts` covers ordering, the tie-break and both error paths.
- `npm run test:unit` runs everything except `*.e2e.test.ts`, and `npm run test:e2e` runs only those.
  The split is by file name, so no Vitest config was needed. `npm test` still runs both.
