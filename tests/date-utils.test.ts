import { describe, expect, it } from 'vitest';
import type { BlackoutWindow, SettlementChannel } from '../src/reflow/types.ts';
import { calculateEndDateWithOperatingHours, parseUtc, toUtcIso } from '../src/utils/date-utils.ts';

// Open Mon–Fri 08:00–16:00 UTC, like the scenario channels.
function weekdayChannel(blackoutWindows: BlackoutWindow[] = []): SettlementChannel {
  const operatingHours = [];
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    operatingHours.push({ dayOfWeek, startHour: 8, endHour: 16 });
  }
  return {
    docId: 'channel-1',
    docType: 'settlementChannel',
    data: { name: 'Weekday desk', operatingHours, blackoutWindows },
  };
}

function endDate(start: string, minutes: number, channel: SettlementChannel): string {
  return toUtcIso(calculateEndDateWithOperatingHours(parseUtc(start), minutes, channel));
}

// 2024-01-15 is a Monday.
describe('calculateEndDateWithOperatingHours', () => {
  it('finishes within the same day when the task fits', () => {
    expect(endDate('2024-01-15T09:00:00Z', 90, weekdayChannel())).toBe('2024-01-15T10:30:00Z');
  });

  it('ends exactly at closing time without rolling to the next day', () => {
    expect(endDate('2024-01-15T15:00:00Z', 60, weekdayChannel())).toBe('2024-01-15T16:00:00Z');
  });

  it('pauses overnight: 120 min from Mon 15:00 ends Tue 09:00', () => {
    expect(endDate('2024-01-15T15:00:00Z', 120, weekdayChannel())).toBe('2024-01-16T09:00:00Z');
  });

  it('pauses over the weekend', () => {
    expect(endDate('2024-01-19T15:00:00Z', 120, weekdayChannel())).toBe('2024-01-22T09:00:00Z');
  });

  it('pauses for a blackout in the middle of the task', () => {
    const channel = weekdayChannel([{ startDate: '2024-01-16T09:00:00Z', endDate: '2024-01-16T11:00:00Z' }]);
    expect(endDate('2024-01-16T08:00:00Z', 120, channel)).toBe('2024-01-16T12:00:00Z');
  });

  it('waits for opening when the start is before hours', () => {
    expect(endDate('2024-01-15T06:00:00Z', 60, weekdayChannel())).toBe('2024-01-15T09:00:00Z');
  });

  it('waits for Monday when the start is on a weekend', () => {
    expect(endDate('2024-01-20T10:00:00Z', 60, weekdayChannel())).toBe('2024-01-22T09:00:00Z');
  });

  it('waits for a blackout to end when the start falls inside it', () => {
    const channel = weekdayChannel([{ startDate: '2024-01-16T09:00:00Z', endDate: '2024-01-16T11:00:00Z' }]);
    expect(endDate('2024-01-16T10:00:00Z', 60, channel)).toBe('2024-01-16T12:00:00Z');
  });

  it('treats an endHour of 0 as midnight at the end of the day', () => {
    const channel = weekdayChannel();
    channel.data.operatingHours = [{ dayOfWeek: 1, startHour: 20, endHour: 0 }];
    // 2024-01-15 is a Monday; the next Monday opening is 2024-01-22 20:00.
    expect(endDate('2024-01-15T23:00:00Z', 120, channel)).toBe('2024-01-22T21:00:00Z');
  });

  it('throws when the channel has no operating hours', () => {
    const channel = weekdayChannel();
    channel.data.operatingHours = [];
    expect(() => endDate('2024-01-15T09:00:00Z', 60, channel)).toThrow(/channel-1 has no operating hours/);
  });

  it('throws when a blackout leaves no open time in the search horizon', () => {
    const channel = weekdayChannel([{ startDate: '2024-01-01T00:00:00Z', endDate: '2030-01-01T00:00:00Z' }]);
    expect(() => endDate('2024-01-15T09:00:00Z', 60, channel)).toThrow(/channel-1 has no open time/);
  });
});
