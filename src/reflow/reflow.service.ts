import type { DateTime } from 'luxon';
import {
  calculateEndDateWithOperatingHours,
  closedTimeReasons,
  nextOpenMinute,
  parseUtc,
  toUtcIso,
} from '../utils/date-utils.ts';
import { sortByDependencies } from './dag.ts';
import type {
  Booking,
  ReflowInput,
  ReflowResult,
  SettlementChannel,
  SettlementTask,
  TaskChange,
  TradeOrder,
} from './types.ts';

export class ReflowService {
  // Reschedules tasks so that:
  //   1. every task starts after all of its dependencies have finished,
  //   2. each channel runs one task at a time,
  //   3. regulatory holds keep their original dates,
  //   4. tasks only process while their channel is open (operating hours, minus blackouts).
// A task's prep time runs just before its processing, as part of the same slot, and also counts as working time.
  // Tasks only ever move later, never earlier than originally planned.
  // Throws when the result is impossible, e.g. a task would finish after its trade order's settlement date.
  reflow(input: ReflowInput): ReflowResult {
    // Copy so the caller's input is never mutated.
    const tasks = structuredClone(input.settlementTasks);
    const channelsById = indexChannelsById(input.settlementChannels);

    // Step 1: holds can't move, so their channel time is booked before anything else is placed.
    const bookingsByChannel = bookRegulatoryHolds(tasks);

    // Step 2: place tasks upstream-first, so a task's dependencies already have their final end dates when we reach it.
    // @upgrade Greedy placement: always valid, but an earlier task can take a slot a later one needed more.
    const placedById: Record<string, SettlementTask> = {};
    const reasonsById: Record<string, string[]> = {};
    for (const task of sortByDependencies(tasks)) {
      const reasons: string[] = [];
      reasonsById[task.docId] = reasons;
      const earliestStart = earliestAllowedStart(task, placedById, reasons);

      if (task.data.isRegulatoryHold) {
        assertHoldCanStart(task, earliestStart);
      } else {
        const channelId = task.data.settlementChannelId;
        const channel = channelsById[channelId];
        if (!channel) {
          throw new Error(`Task ${task.data.taskReference} uses unknown settlement channel ${channelId}`);
        }
        moveToFirstFreeSlot(task, earliestStart, bookingsByChannel[channelId]!, channel, reasons);
      }

      placedById[task.docId] = task;
    }

    // Step 3: every task must finish by its trade order's settlement date.
    assertSettlementDeadlines(tasks, input.tradeOrders, reasonsById);

    // Results keep the caller's task order; sorting is an internal detail.
    const changes: TaskChange[] = [];
    const explanation: string[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const updated = tasks[i]!;
      const change = describeChange(input.settlementTasks[i]!, updated, reasonsById[updated.docId]!);
      if (change) {
        changes.push(change);
        const shifts = `start by ${change.startShiftMinutes} min, end by ${change.endShiftMinutes} min`;
        explanation.push(`${change.taskReference} moved ${shifts} (${change.reasons.join(', ')}).`);
      }
    }

    return { updatedTasks: tasks, changes, explanation };
  }
}

function indexChannelsById(channels: SettlementChannel[]): Record<string, SettlementChannel> {
  const channelsById: Record<string, SettlementChannel> = {};
  for (const channel of channels) {
    channelsById[channel.docId] = channel;
  }
  return channelsById;
}

// Throws when any task ends after its trade order's settlement date (ending exactly on it is fine).
// Checks every task first so one error lists all the breaches, each with the reasons the task moved.
function assertSettlementDeadlines(
  tasks: SettlementTask[],
  tradeOrders: TradeOrder[],
  reasonsById: Record<string, string[]>,
): void {
  const tradeOrdersById: Record<string, TradeOrder> = {};
  for (const tradeOrder of tradeOrders) {
    tradeOrdersById[tradeOrder.docId] = tradeOrder;
  }

  const breaches: string[] = [];
  for (const task of tasks) {
    const tradeOrderId = task.data.tradeOrderId;
    const tradeOrder = tradeOrdersById[tradeOrderId];
    if (!tradeOrder) {
      throw new Error(`Task ${task.data.taskReference} belongs to unknown trade order ${tradeOrderId}`);
    }

    const deadline = tradeOrder.data.settlementDate;
    if (parseUtc(task.data.endDate) <= parseUtc(deadline)) {
      continue;
    }

    let breach = `Task ${task.data.taskReference} cannot meet settlement deadline ${deadline}: ends ${task.data.endDate}`;
    const reasons = reasonsById[task.docId]!;
    if (reasons.length > 0) {
      breach += ` (${reasons.join(', ')})`;
    }
    breaches.push(breach);
  }

  if (breaches.length > 0) {
    throw new Error(breaches.join('\n'));
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
        taskReference: task.data.taskReference,
      };
      bookingsByChannel[channelId].push(holdBooking);
    }
  }
  return bookingsByChannel;
}

// The later of the task's original start and the moment its last dependency finishes.
// If a dependency pushed the start later, records the one that finishes last as a reason.
function earliestAllowedStart(task: SettlementTask, placedById: Record<string, SettlementTask>, reasons: string[]): DateTime {
  let earliest = parseUtc(task.data.startDate);
  let latestDependency: SettlementTask | undefined;
  for (const depId of task.data.dependsOnTaskIds) {
    const dependency = placedById[depId]!;
    const dependencyEnd = parseUtc(dependency.data.endDate);
    if (dependencyEnd > earliest) {
      earliest = dependencyEnd;
      latestDependency = dependency;
    }
  }

  if (latestDependency) {
    addReasons(reasons, [`waited for ${latestDependency.data.taskReference}`]);
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
// Prep runs first in the same slot, so the slot starts when prep begins and ends when processing ends.
function moveToFirstFreeSlot(
  task: SettlementTask,
  earliestStart: DateTime,
  bookings: Booking[],
  channel: SettlementChannel,
  reasons: string[],
): void {
  const workingMinutes = (task.data.prepTimeMinutes ?? 0) + task.data.durationMinutes;
  const slot = findFreeSlot(bookings, earliestStart, workingMinutes, channel, reasons);

  bookings.push({ start: slot.start, end: slot.end, taskReference: task.data.taskReference });
  task.data.startDate = toUtcIso(slot.start);
  task.data.endDate = toUtcIso(slot.end);
}

// Returns the first slot at or after `from` where `minutes` of working time fits between the channel's bookings.
// A slot spans from its start to its end including any pauses (overnight, blackouts), and all of it occupies the channel.
// Walks the bookings in time order with a candidate slot, whose start is always an open minute:
//   - booking is over before the candidate  → irrelevant, skip it
//   - task would end before the booking     → it fits in the gap, done
//   - otherwise they'd overlap              → try again at the first open minute after that booking
// Records why the start moved as it happens, then why the chosen slot pauses.
function findFreeSlot(
  bookings: Booking[],
  from: DateTime,
  minutes: number,
  channel: SettlementChannel,
  reasons: string[],
): Omit<Booking, 'taskReference'> {
  const inTimeOrder = [...bookings].sort((a, b) => a.start.toMillis() - b.start.toMillis());
  let start = nextOpenMinute(from, channel);
  addReasons(reasons, closedTimeReasons(from, start, channel));
  let end = calculateEndDateWithOperatingHours(start, minutes, channel);
  for (const booking of inTimeOrder) {
    if (booking.end <= start) {
      continue;
    }

    if (end <= booking.start) {
      break;
    }

    addReasons(reasons, [`channel busy with ${booking.taskReference}`]);
    start = nextOpenMinute(booking.end, channel);
    addReasons(reasons, closedTimeReasons(booking.end, start, channel));
    end = calculateEndDateWithOperatingHours(start, minutes, channel);
  }
  addReasons(reasons, closedTimeReasons(start, end, channel));
  return { start, end };
}

// Appends reasons not recorded yet, keeping the order they happened in.
function addReasons(reasons: string[], newReasons: string[]): void {
  for (const reason of newReasons) {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }
}

// Returns how a task moved, or undefined when it kept both dates.
function describeChange(original: SettlementTask, updated: SettlementTask, reasons: string[]): TaskChange | undefined {
  const oldStart = parseUtc(original.data.startDate);
  const newStart = parseUtc(updated.data.startDate);
  const oldEnd = parseUtc(original.data.endDate);
  const newEnd = parseUtc(updated.data.endDate);

  const startShiftMinutes = newStart.diff(oldStart, 'minutes').minutes;
  const endShiftMinutes = newEnd.diff(oldEnd, 'minutes').minutes;
  if (startShiftMinutes === 0 && endShiftMinutes === 0) {
    return undefined;
  }

  return {
    taskReference: updated.data.taskReference,
    oldStartDate: original.data.startDate,
    newStartDate: updated.data.startDate,
    oldEndDate: original.data.endDate,
    newEndDate: updated.data.endDate,
    startShiftMinutes,
    endShiftMinutes,
    reasons,
  };
}
