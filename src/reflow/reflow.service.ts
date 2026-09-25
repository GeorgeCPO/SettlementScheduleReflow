import { sortByDependencies } from './dag.ts';
import type { ReflowInput, ReflowResult } from './types.ts';

export class ReflowService {
  reflow(input: ReflowInput): ReflowResult {
    // Copy so the caller's input is never mutated.
    const tasks = structuredClone(input.settlementTasks);
    // Scheduling will walk tasks upstream-first; for now this only validates the dependency graph.
    sortByDependencies(tasks);
    // Results keep the caller's task order; sorting is an internal detail.
    return { updatedTasks: tasks };
  }
}
