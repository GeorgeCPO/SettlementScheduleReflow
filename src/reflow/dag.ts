import { parseUtc } from '../utils/date-utils.ts';
import type { SettlementTask } from './types.ts';

// Orders tasks so every task comes after all of its upstream dependencies (Kahn's algorithm).
// Among ready tasks the earliest original startDate goes first, so the output is deterministic and stays close to the original plan.
export function sortByDependencies(tasks: SettlementTask[]): SettlementTask[] {
  const byId: Record<string, SettlementTask> = {};
  const remainingDeps: Record<string, number> = {};
  const originalStart: Record<string, number> = {};
  const graph: Record<string, string[]> = {};

  for (const task of tasks) {
    byId[task.docId] = task;
    remainingDeps[task.docId] = task.data.dependsOnTaskIds.length;
    originalStart[task.docId] = parseUtc(task.data.startDate).toMillis();
  }

  for (const task of tasks) {
    for (const depId of task.data.dependsOnTaskIds) {
      if (!byId[depId]) throw new Error(`Task ${task.data.taskReference} depends on unknown task id "${depId}"`);
      if (!graph[depId]) graph[depId] = [];
      graph[depId].push(task.docId);
    }
  }

  const byOriginalStart = (a: SettlementTask, b: SettlementTask) => originalStart[a.docId]! - originalStart[b.docId]!;
  const readyTasks = tasks.filter((task) => task.data.dependsOnTaskIds.length === 0);
  const sorted: SettlementTask[] = [];

  while (readyTasks.length > 0) {
    // @upgrade The ready list is re-sorted before every pick; a binary heap would avoid that for large schedules.
    readyTasks.sort(byOriginalStart);
    const task = readyTasks.shift()!;
    sorted.push(task);

    for (const childId of graph[task.docId] ?? []) {
      remainingDeps[childId]!--;
      if (remainingDeps[childId] === 0) readyTasks.push(byId[childId]!);
    }
  }

  // Tasks never reached are in a cycle or depend on one.
  if (sorted.length < tasks.length) {
    // @upgrade Compute and show the cycle path
    throw new Error(`Circular dependency found. Impossible to resolve`);
  }

  return sorted;
}
