import type { DateTime } from 'luxon';
import { parseUtc, toUtcIso } from '../utils/date-utils.ts';
import { sortByDependencies } from './dag.ts';
import type { Booking, ReflowInput, ReflowResult, SettlementTask } from './types.ts';

export class ReflowService {
  // Reschedules tasks so that:
  //   1. every task starts after all of its dependencies have finished,
  //   2. each channel runs one task at a time,
  //   3. regulatory holds keep their original dates.
  // Tasks only ever move later, never earlier than originally planned.
  reflow(input: ReflowInput): ReflowResult {
    // Copy so the caller's input is never mutated.
    const tasks = structuredClone(input.settlementTasks);

    // Step 1: holds can't move, so their channel time is booked before anything else is placed.
    const bookingsByChannel = bookRegulatoryHolds(tasks);

    // Step 2: place tasks upstream-first, so a task's dependencies already have their final end dates when we reach it.
    // @upgrade Greedy placement: always valid, but an earlier task can take a slot a later one needed more.
    const endById: Record<string, DateTime> = {};
    for (const task of sortByDependencies(tasks)) {
      const earliestStart = earliestAllowedStart(task, endById);

      if (task.data.isRegulatoryHold) {
        assertHoldCanStart(task, earliestStart);
      } else {
        moveToFirstFreeSlot(task, earliestStart, bookingsByChannel[task.data.settlementChannelId]!);
      }

      endById[task.docId] = parseUtc(task.data.endDate);
    }

    // Results keep the caller's task order; sorting is an internal detail.
    return { updatedTasks: tasks };
  }
}

// Returns every channel's bookings, starting with only the regulatory holds on it.
// @upgrade Holds that overlap each other on the same channel are accepted silently; reject them.
function bookRegulatoryHolds(tasks: SettlementTask[]): Record<string, Booking[]> {
  const bookingsByChannel: Record<string, Booking[]> = {};
  for (const task of tasks) {
    const channelId = task.data.settlementChannelId;
    if (!bookingsByChannel[channelId]) {
      bookingsByChannel[channelId] = [];
    }

    if (task.data.isRegulatoryHold) {
      const holdBooking: Booking = {
        start: parseUtc(task.data.startDate),
        end: parseUtc(task.data.endDate),
      };
      bookingsByChannel[channelId].push(holdBooking);
    }
  }
  return bookingsByChannel;
}

// The later of the task's original start and the moment its last dependency finishes.
function earliestAllowedStart(task: SettlementTask, endById: Record<string, DateTime>): DateTime {
  let earliest = parseUtc(task.data.startDate);
  for (const depId of task.data.dependsOnTaskIds) {
    const dependencyEnd = endById[depId]!;
    if (dependencyEnd > earliest) {
      earliest = dependencyEnd;
    }
  }
  return earliest;
}

// A hold can't be pushed back, so a dependency that runs past its start makes the schedule impossible.
function assertHoldCanStart(hold: SettlementTask, earliestStart: DateTime): void {
  if (earliestStart > parseUtc(hold.data.startDate)) {
    throw new Error(`Regulatory hold ${hold.data.taskReference} starts before its dependencies finish`);
  }
}

// Moves the task to the first free slot on its channel at or after `earliestStart`, and books that slot.
function moveToFirstFreeSlot(task: SettlementTask, earliestStart: DateTime, bookings: Booking[]): void {
  const minutes = task.data.durationMinutes;
  const start = findFreeSlot(bookings, earliestStart, minutes);
  const end = start.plus({ minutes });

  bookings.push({ start, end });
  task.data.startDate = toUtcIso(start);
  task.data.endDate = toUtcIso(end);
}

// Returns the first start at or after `from` where `minutes` fits between the channel's bookings.
// Walks the bookings in time order with a candidate start:
//   - booking is over before the candidate  → irrelevant, skip it
//   - task would end before the booking     → it fits in the gap, done
//   - otherwise they'd overlap              → try again right after that booking
function findFreeSlot(bookings: Booking[], from: DateTime, minutes: number): DateTime {
  const inTimeOrder = [...bookings].sort((a, b) => a.start.toMillis() - b.start.toMillis());
  let candidate = from;
  for (const booking of inTimeOrder) {
    if (booking.end <= candidate) {
      continue;
    }

    if (candidate.plus({ minutes }) <= booking.start) {
      break;
    }

    candidate = booking.end;
  }
  return candidate;
}
