import { describe, expect, it } from 'vitest';
import { ReflowService } from '../src/reflow/reflow.service.ts';
import type { ReflowInput } from '../src/reflow/types.ts';
import { loadScenario } from '../src/scenarios/load-scenario.ts';

type ExpectedSchedule = Record<string, { startDate: string; endDate: string }>;

/** Runs the reflow and returns each task's dates, normalised so ISO formatting differences don't matter. */
function reflowSchedule(input: ReflowInput): ExpectedSchedule {
  const { updatedTasks } = new ReflowService().reflow(input);

  return Object.fromEntries(
    updatedTasks.map((task) => [
      task.docId,
      {
        startDate: new Date(task.data.startDate).toISOString(),
        endDate: new Date(task.data.endDate).toISOString(),
      },
    ]),
  );
}

describe('Scenario 1 — Delay cascade', () => {
  const scenario = loadScenario('01-delay-cascade.json');
  const schedule = reflowSchedule(scenario);

  it.each<[string, string, string]>([
    ['task-001', '2024-01-15T11:00:00.000Z', '2024-01-15T13:00:00.000Z'], // the delayed fund transfer stays put
    ['task-002', '2024-01-15T13:00:00.000Z', '2024-01-15T14:00:00.000Z'], // waits for the fund transfer
    ['task-003', '2024-01-15T14:00:00.000Z', '2024-01-15T15:30:00.000Z'], // waits for the margin check
    ['task-004', '2024-01-15T15:30:00.000Z', '2024-01-16T08:30:00.000Z'], // 30 min Mon, pauses overnight, 30 min Tue
  ])('%s runs %s → %s', (taskId, startDate, endDate) => {
    expect(schedule[taskId]).toEqual({ startDate, endDate });
  });

  it('explains each moved task; STL-001 is unchanged', () => {
    expect(new ReflowService().reflow(scenario).explanation).toEqual([
      'STL-20240115-002 moved start by 120 min, end by 120 min (waited for STL-20240115-001).',
      'STL-20240115-003 moved start by 120 min, end by 120 min (waited for STL-20240115-002).',
      'STL-20240115-004 moved start by 120 min, end by 1080 min (waited for STL-20240115-003, outside operating hours).',
    ]);
  });
});

describe('Scenario 2 — Market hours & blackout', () => {
  const scenario = loadScenario('02-market-hours-blackout.json');
  const schedule = reflowSchedule(scenario);

  it.each<[string, string, string]>([
    ['task-101', '2024-01-15T15:00:00.000Z', '2024-01-16T09:00:00.000Z'], // 60 min Mon, pauses at close, 60 min Tue
    ['task-102', '2024-01-16T08:00:00.000Z', '2024-01-16T12:00:00.000Z'], // 60 min, pauses for blackout 09–11, 60 min
  ])('%s runs %s → %s', (taskId, startDate, endDate) => {
    expect(schedule[taskId]).toEqual({ startDate, endDate });
  });

  it('explains each moved task', () => {
    expect(new ReflowService().reflow(scenario).explanation).toEqual([
      'STL-20240115-101 moved start by 0 min, end by 960 min (outside operating hours).',
      'STL-20240116-102 moved start by 0 min, end by 120 min (blackout: Fedwire settlement system maintenance).',
    ]);
  });
});
