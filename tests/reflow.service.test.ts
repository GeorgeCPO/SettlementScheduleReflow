import { describe, expect, it } from 'vitest';
import { ReflowService } from '../src/reflow/reflow.service.ts';
import type { BlackoutWindow, OperatingHours, SettlementChannel, SettlementTask, SettlementTaskData } from '../src/reflow/types.ts';

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

function channel(docId: string, operatingHours: OperatingHours[], blackoutWindows: BlackoutWindow[] = []): SettlementChannel {
  return { docId, docType: 'settlementChannel', data: { name: docId, operatingHours, blackoutWindows } };
}

// Open every day from midnight to midnight, so operating hours never affect the schedule.
function alwaysOpenChannel(docId: string): SettlementChannel {
  const operatingHours = [];
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    operatingHours.push({ dayOfWeek, startHour: 0, endHour: 0 });
  }
  return channel(docId, operatingHours);
}

// Open Mon–Fri 08:00–16:00 UTC, like the scenario channels.
function weekdayChannel(docId: string, blackoutWindows: BlackoutWindow[] = []): SettlementChannel {
  const operatingHours = [];
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    operatingHours.push({ dayOfWeek, startHour: 8, endHour: 16 });
  }
  return channel(docId, operatingHours, blackoutWindows);
}

const alwaysOpenChannels = [alwaysOpenChannel('channel-1'), alwaysOpenChannel('channel-2'), alwaysOpenChannel('channel-3')];

// Trade orders aren't read yet.
function reflow(tasks: SettlementTask[], settlementChannels = alwaysOpenChannels): Record<string, [string, string]> {
  const { updatedTasks } = new ReflowService().reflow({ settlementTasks: tasks, settlementChannels, tradeOrders: [] });
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

    const { updatedTasks } = new ReflowService().reflow({
      settlementTasks: tasks,
      settlementChannels: alwaysOpenChannels,
      tradeOrders: [],
    });

    expect(updatedTasks.map((t) => t.docId)).toEqual(['b', 'a']);
    expect(updatedTasks[0]!.data.startDate).toBe('2024-01-15T09:30:00Z');
    expect(tasks).toEqual(before);
  });

  it('keeps the whole span of a paused task, overnight included, off-limits to other tasks', () => {
    // 2024-01-15 is a Monday; a runs 60 min Mon, pauses overnight, 60 min Tue.
    const schedule = reflow(
      [task('a', '2024-01-15T15:00:00Z', { durationMinutes: 120 }), task('b', '2024-01-15T15:30:00Z')],
      [weekdayChannel('channel-1')],
    );
    expect(schedule.a).toEqual(['2024-01-15T15:00:00.000Z', '2024-01-16T09:00:00.000Z']);
    expect(schedule.b).toEqual(['2024-01-16T09:00:00.000Z', '2024-01-16T10:00:00.000Z']);
  });

  it('moves a task whose overnight pause would overlap a regulatory hold', () => {
    // a would run 30 min Mon, pause overnight, 90 min Tue; the hold sits in that pause.
    const schedule = reflow(
      [
        task('hold', '2024-01-15T20:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-15T21:00:00Z' }),
        task('a', '2024-01-15T15:30:00Z', { durationMinutes: 120 }),
      ],
      [weekdayChannel('channel-1')],
    );
    expect(schedule.a).toEqual(['2024-01-16T08:00:00.000Z', '2024-01-16T10:00:00.000Z']);
  });

  it('moves a start that falls inside a blackout to when the blackout ends', () => {
    const blackout = { startDate: '2024-01-16T09:00:00Z', endDate: '2024-01-16T11:00:00Z' };
    const schedule = reflow([task('a', '2024-01-16T09:30:00Z')], [weekdayChannel('channel-1', [blackout])]);
    expect(schedule.a).toEqual(['2024-01-16T11:00:00.000Z', '2024-01-16T12:00:00.000Z']);
  });

  it('keeps a task paused by a blackout off-limits to other tasks during the blackout', () => {
    // a runs 60 min, pauses for the blackout 09–11, then 60 min, so it occupies 08:00–12:00.
    const blackout = { startDate: '2024-01-16T09:00:00Z', endDate: '2024-01-16T11:00:00Z' };
    const schedule = reflow(
      [task('a', '2024-01-16T08:00:00Z', { durationMinutes: 120 }), task('b', '2024-01-16T10:00:00Z')],
      [weekdayChannel('channel-1', [blackout])],
    );
    expect(schedule.a).toEqual(['2024-01-16T08:00:00.000Z', '2024-01-16T12:00:00.000Z']);
    expect(schedule.b).toEqual(['2024-01-16T12:00:00.000Z', '2024-01-16T13:00:00.000Z']);
  });

  it('throws when a task uses a channel that is not in the input', () => {
    const tasks = [task('a', '2024-01-15T08:00:00Z', { settlementChannelId: 'channel-missing' })];
    expect(() => reflow(tasks)).toThrow(/Task a uses unknown settlement channel channel-missing/);
  });

  it('moves a start that falls outside operating hours to the next open minute', () => {
    const schedule = reflow([task('a', '2024-01-15T06:00:00Z')], [weekdayChannel('channel-1')]);
    expect(schedule.a).toEqual(['2024-01-15T08:00:00.000Z', '2024-01-15T09:00:00.000Z']);
  });

  it('does not check regulatory holds against operating hours', () => {
    const schedule = reflow(
      [task('hold', '2024-01-20T10:00:00Z', { isRegulatoryHold: true, endDate: '2024-01-20T11:00:00Z' })],
      [weekdayChannel('channel-1')],
    );
    expect(schedule.hold).toEqual(['2024-01-20T10:00:00.000Z', '2024-01-20T11:00:00.000Z']);
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
