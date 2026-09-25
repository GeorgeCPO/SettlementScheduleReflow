import { describe, expect, it } from 'vitest';
import { sortByDependencies } from '../src/reflow/dag.ts';
import type { SettlementTask } from '../src/reflow/types.ts';

function task(docId: string, startDate: string, dependsOnTaskIds: string[] = []): SettlementTask {
  return {
    docId,
    docType: 'settlementTask',
    data: {
      taskReference: docId,
      tradeOrderId: 'order-1',
      settlementChannelId: 'channel-1',
      startDate,
      endDate: startDate,
      durationMinutes: 60,
      isRegulatoryHold: false,
      dependsOnTaskIds,
      taskType: 'marginCheck',
    },
  };
}

const ids = (tasks: SettlementTask[]) => tasks.map((t) => t.docId);

describe('sortByDependencies', () => {
  it('puts dependencies first, breaking ties by original start', () => {
    const tasks = [
      task('c', '2024-01-15T08:00:00Z', ['a']),
      task('b', '2024-01-15T10:00:00Z'),
      task('a', '2024-01-15T09:00:00Z'),
    ];
    expect(ids(sortByDependencies(tasks))).toEqual(['a', 'c', 'b']);
  });

  it('throws on an unknown dependency', () => {
    expect(() => sortByDependencies([task('a', '2024-01-15T08:00:00Z', ['missing'])])).toThrow(/unknown task id "missing"/);
  });

  it('throws on a cycle', () => {
    const tasks = [task('a', '2024-01-15T08:00:00Z', ['b']), task('b', '2024-01-15T09:00:00Z', ['a'])];
    expect(() => sortByDependencies(tasks)).toThrow(/Circular dependency/);
  });

  it('throws on a self-dependency', () => {
    expect(() => sortByDependencies([task('a', '2024-01-15T08:00:00Z', ['a'])])).toThrow(/Circular dependency/);
  });
});
