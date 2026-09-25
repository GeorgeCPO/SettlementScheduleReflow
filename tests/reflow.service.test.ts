import { describe, expect, it } from 'vitest';
import { ReflowService } from '../src/reflow/reflow.service.ts';
import type { SettlementTask, SettlementTaskData } from '../src/reflow/types.ts';

function task(docId: string, startDate: string, overrides: Partial<SettlementTaskData> = {}): SettlementTask {
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
      dependsOnTaskIds: [],
      taskType: 'marginCheck',
      ...overrides,
    },
  };
}

// Channels and trade orders aren't read yet (operating hours come later).
function reflow(tasks: SettlementTask[]): Record<string, [string, string]> {
  const { updatedTasks } = new ReflowService().reflow({ settlementTasks: tasks, settlementChannels: [], tradeOrders: [] });
  return Object.fromEntries(
    updatedTasks.map((t) => [t.docId, [new Date(t.data.startDate).toISOString(), new Date(t.data.endDate).toISOString()]]),
  );
}

describe('ReflowService', () => {
  it('starts a task once its dependency finishes', () => {
    const schedule = reflow([
      task('a', '2024-01-15T11:00:00Z', { durationMinutes: 120 }),
      task('b', '2024-01-15T11:00:00Z', { dependsOnTaskIds: ['a'], settlementChannelId: 'channel-2' }),
    ]);
    expect(schedule.b).toEqual(['2024-01-15T13:00:00.000Z', '2024-01-15T14:00:00.000Z']);
  });

  it('never moves a task earlier than its original start', () => {
    const schedule = reflow([
      task('a', '2024-01-15T08:00:00Z'),
      task('b', '2024-01-15T12:00:00Z', { dependsOnTaskIds: ['a'] }),
    ]);
    expect(schedule.b).toEqual(['2024-01-15T12:00:00.000Z', '2024-01-15T13:00:00.000Z']);
  });

  it('pushes an overlapping task on the same channel back', () => {
    const schedule = reflow([task('a', '2024-01-15T08:00:00Z'), task('b', '2024-01-15T08:30:00Z')]);
    expect(schedule.a).toEqual(['2024-01-15T08:00:00.000Z', '2024-01-15T09:00:00.000Z']);
    expect(schedule.b).toEqual(['2024-01-15T09:00:00.000Z', '2024-01-15T10:00:00.000Z']);
  });

  it('lets tasks on different channels overlap', () => {
    const schedule = reflow([
      task('a', '2024-01-15T08:00:00Z'),
      task('b', '2024-01-15T08:30:00Z', { settlementChannelId: 'channel-2' }),
    ]);
    expect(schedule.b).toEqual(['2024-01-15T08:30:00.000Z', '2024-01-15T09:30:00.000Z']);
  });

  it('keeps a regulatory hold fixed and moves a task past it', () => {
    const schedule = reflow([
      task('hold', '2024-01-15T09:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T11:00:00Z', durationMinutes: 120 }),
      task('a', '2024-01-15T08:30:00Z'),
    ]);
    expect(schedule.hold).toEqual(['2024-01-15T09:00:00.000Z', '2024-01-15T11:00:00.000Z']);
    expect(schedule.a).toEqual(['2024-01-15T11:00:00.000Z', '2024-01-15T12:00:00.000Z']);
  });

  it('fills a gap before a regulatory hold when the task fits', () => {
    const schedule = reflow([
      task('hold', '2024-01-15T10:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T11:00:00Z' }),
      task('a', '2024-01-15T08:00:00Z'),
    ]);
    expect(schedule.a).toEqual(['2024-01-15T08:00:00.000Z', '2024-01-15T09:00:00.000Z']);
  });

  it('skips a gap too small for the task', () => {
    const schedule = reflow([
      task('hold-1', '2024-01-15T09:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T10:00:00Z' }),
      task('hold-2', '2024-01-15T10:30:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T11:00:00Z' }),
      task('a', '2024-01-15T08:30:00Z'),
    ]);
    expect(schedule.a).toEqual(['2024-01-15T11:00:00.000Z', '2024-01-15T12:00:00.000Z']);
  });

  it('keeps a task that ends exactly when a hold starts', () => {
    const schedule = reflow([
      task('hold', '2024-01-15T09:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T10:00:00Z' }),
      task('a', '2024-01-15T08:00:00Z'),
    ]);
    expect(schedule.a).toEqual(['2024-01-15T08:00:00.000Z', '2024-01-15T09:00:00.000Z']);
  });

  it('starts a task that depends on a hold when the hold ends', () => {
    const schedule = reflow([
      task('hold', '2024-01-15T09:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T10:00:00Z' }),
      task('a', '2024-01-15T08:00:00Z', { dependsOnTaskIds: ['hold'], settlementChannelId: 'channel-2' }),
    ]);
    expect(schedule.a).toEqual(['2024-01-15T10:00:00.000Z', '2024-01-15T11:00:00.000Z']);
  });

  it('waits for the latest of several dependencies', () => {
    const schedule = reflow([
      task('a', '2024-01-15T08:00:00Z'),
      task('b', '2024-01-15T08:00:00Z', { durationMinutes: 180, settlementChannelId: 'channel-2' }),
      task('c', '2024-01-15T08:00:00Z', { dependsOnTaskIds: ['a', 'b'], settlementChannelId: 'channel-3' }),
    ]);
    expect(schedule.c).toEqual(['2024-01-15T11:00:00.000Z', '2024-01-15T12:00:00.000Z']);
  });

  it('keeps the caller order and does not mutate the input', () => {
    const tasks = [task('b', '2024-01-15T09:00:00Z', { dependsOnTaskIds: ['a'] }), task('a', '2024-01-15T08:30:00Z')];
    const before = structuredClone(tasks);

    const { updatedTasks } = new ReflowService().reflow({ settlementTasks: tasks, settlementChannels: [], tradeOrders: [] });

    expect(updatedTasks.map((t) => t.docId)).toEqual(['b', 'a']);
    expect(updatedTasks[0]!.data.startDate).toBe('2024-01-15T09:30:00Z');
    expect(tasks).toEqual(before);
  });

  it('throws when a dependency finishes after its regulatory hold starts', () => {
    const tasks = [
      task('a', '2024-01-15T09:00:00Z', { durationMinutes: 120 }),
      task('hold', '2024-01-15T10:00:00Z', {
        isRegulatoryHold: true,
        endDate: '2024-01-15T11:00:00Z',
        dependsOnTaskIds: ['a'],
        settlementChannelId: 'channel-2',
      }),
    ];
    expect(() => reflow(tasks)).toThrow(/Regulatory hold hold/);
  });
});
