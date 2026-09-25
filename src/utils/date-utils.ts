import { DateTime, Interval } from 'luxon';
import type { SettlementChannel } from '../reflow/types.ts';

// How many days ahead to look for a channel's next open minute before giving up on it.
// @upgrade Fixed horizon; make it configurable if channels can legitimately close for longer.
const OPEN_TIME_SEARCH_DAYS = 366;

// Parses an ISO 8601 string as a UTC DateTime. Throws on malformed input instead of returning an invalid DateTime.
export function parseUtc(iso: string): DateTime {
  const date = DateTime.fromISO(iso, { zone: 'utc' });
  if (!date.isValid) throw new Error(`Invalid ISO date "${iso}": ${date.invalidExplanation}`);
  return date;
}

// Formats as an ISO 8601 UTC string without milliseconds, matching the scenario files.
export function toUtcIso(date: DateTime): string {
  return date.toUTC().toISO({ suppressMilliseconds: true })!;
}

// Returns when `minutes` of working time, starting at `start`, finish on `channel`.
// Work pauses outside operating hours and during blackouts, and resumes at the next open minute.
// Walks whole open intervals, consuming each one until the remaining minutes fit inside one.
export function calculateEndDateWithOperatingHours(start: DateTime, minutes: number, channel: SettlementChannel): DateTime {
  let remaining = minutes;
  let cursor = start;
  while (true) {
    const open = nextOpenInterval(cursor, channel);
    const openMinutes = open.length('minutes');
    if (remaining <= openMinutes) {
      return open.start!.plus({ minutes: remaining });
    }

    remaining -= openMinutes;
    cursor = open.end!;
  }
}

// Returns `from` if the channel is open then, otherwise the moment it next opens.
export function nextOpenMinute(from: DateTime, channel: SettlementChannel): DateTime {
  return nextOpenInterval(from, channel).start!;
}

// Returns the first stretch of open time at or after `from`, trimmed so it starts no earlier than `from`.
function nextOpenInterval(from: DateTime, channel: SettlementChannel): Interval {
  if (channel.data.operatingHours.length === 0) {
    throw new Error(`Settlement channel ${channel.docId} has no operating hours`);
  }

  const firstDay = from.startOf('day');
  for (let dayOffset = 0; dayOffset < OPEN_TIME_SEARCH_DAYS; dayOffset++) {
    const day = firstDay.plus({ days: dayOffset });
    for (const open of openIntervalsOn(day, channel)) {
      if (open.end! <= from) {
        continue;
      }

      if (open.start! < from) {
        return Interval.fromDateTimes(from, open.end!);
      }
      return open;
    }
  }

  throw new Error(`Settlement channel ${channel.docId} has no open time within ${OPEN_TIME_SEARCH_DAYS} days of ${toUtcIso(from)}`);
}

// The channel's open intervals on the UTC day starting at `day`: its operating hours minus its blackouts, in time order.
function openIntervalsOn(day: DateTime, channel: SettlementChannel): Interval[] {
  // Luxon numbers weekdays Monday = 1 … Sunday = 7; operating hours use Sunday = 0.
  const dayOfWeek = day.weekday % 7;

  const blackouts: Interval[] = [];
  for (const window of channel.data.blackoutWindows) {
    blackouts.push(Interval.fromDateTimes(parseUtc(window.startDate), parseUtc(window.endDate)));
  }

  const openIntervals: Interval[] = [];
  for (const hours of channel.data.operatingHours) {
    if (hours.dayOfWeek !== dayOfWeek) {
      continue;
    }

    const opens = day.plus({ hours: hours.startHour });
    // An endHour of 0 is midnight, so the channel closes at the end of this day, not the start.
    // @upgrade Other endHours before startHour (overnight windows like 22–6) aren't supported.
    let closes = day.plus({ hours: hours.endHour });
    if (hours.endHour === 0) {
      closes = day.plus({ days: 1 });
    }

    const operating = Interval.fromDateTimes(opens, closes);
    for (const open of operating.difference(...blackouts)) {
      openIntervals.push(open);
    }
  }

  openIntervals.sort((a, b) => a.start!.toMillis() - b.start!.toMillis());
  return openIntervals;
}
