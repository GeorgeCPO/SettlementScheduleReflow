import type { DateTime } from 'luxon';
import { calculateEndDateWithOperatingHours, nextOpenMinute, parseUtc, toUtcIso } from '../utils/date-utils.ts';
import { sortByDependencies } from './dag.ts';
import type { Booking, ReflowInput, ReflowResult, SettlementChannel, SettlementTask } from './types.ts';

export class ReflowService {
  // Reschedules tasks so that:
  //   1. every task starts after all of its dependencies have finished,
  //   2. each channel runs one task at a time,
  //   3. regulatory holds keep their original dates,
  //   4. tasks only process while their channel is open (operating hours, minus blackouts).
  // Tasks only ever move later, never earlier than originally planned.
  reflow(input: ReflowInput): ReflowResult {
    // Copy so the caller's input is never mutated.
    const tasks = structuredClone(input.settlementTasks);
    const channelsById = indexChannelsById(input.settlementChannels);

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
        const channelId = task.data.settlementChannelId;
        const channel = channelsById[channelId];
        if (!channel) {
          throw new Error(`Task ${task.data.taskReference} uses unknown settlement channel ${channelId}`);
        }
        moveToFirstFreeSlot(task, earliestStart, bookingsByChannel[channelId]!, channel);
      }

      endById[task.docId] = parseUtc(task.data.endDate);
    }

    // Results keep the caller's task order; sorting is an internal detail.
    return { updatedTasks: tasks };
  }
}

function indexChannelsById(channels: SettlementChannel[]): Record<string, SettlementChannel> {
  const channelsById: Record<string, SettlementChannel> = {};
  for (const channel of channels) {
    channelsById[channel.docId] = channel;
  }
  return channelsById;
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
// Holds are not checked against operating hours: they are fixed by regulation, not by the channel.
function assertHoldCanStart(hold: SettlementTask, earliestStart: DateTime): void {
  if (earliestStart > parseUtc(hold.data.startDate)) {
    throw new Error(`Regulatory hold ${hold.data.taskReference} starts before its dependencies finish`);
  }
}

// Moves the task to the first free slot on its channel at or after `earliestStart`, and books that slot.
// @upgrade prepTimeMinutes is ignored; add it to the working minutes once a scenario needs it.
function moveToFirstFreeSlot(
  task: SettlementTask,
  earliestStart: DateTime,
  bookings: Booking[],
  channel: SettlementChannel,
): void {
  const slot = findFreeSlot(bookings, earliestStart, task.data.durationMinutes, channel);

  bookings.push(slot);
  task.data.startDate = toUtcIso(slot.start);
  task.data.endDate = toUtcIso(slot.end);
}

// Returns the first slot at or after `from` where `minutes` of working time fits between the channel's bookings.
// A slot spans from its start to its end including any pauses (overnight, blackouts), and all of it occupies the channel.
// Walks the bookings in time order with a candidate slot, whose start is always an open minute:
//   - booking is over before the candidate  → irrelevant, skip it
//   - task would end before the booking     → it fits in the gap, done
//   - otherwise they'd overlap              → try again at the first open minute after that booking
function findFreeSlot(bookings: Booking[], from: DateTime, minutes: number, channel: SettlementChannel): Booking {
  const inTimeOrder = [...bookings].sort((a, b) => a.start.toMillis() - b.start.toMillis());
  let start = nextOpenMinute(from, channel);
  let end = calculateEndDateWithOperatingHours(start, minutes, channel);
  for (const booking of inTimeOrder) {
    if (booking.end <= start) {
      continue;
    }

    if (end <= booking.start) {
      break;
    }

    start = nextOpenMinute(booking.end, channel);
    end = calculateEndDateWithOperatingHours(start, minutes, channel);
  }
  return { start, end };
}
