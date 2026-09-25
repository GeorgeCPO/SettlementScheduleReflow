import type { DateTime } from 'luxon';

export interface Document<T extends string, TData> {
  docId: string;
  docType: T;
  data: TData;
}

export type TaskType =
  | 'marginCheck'
  | 'fundTransfer'
  | 'disbursement'
  | 'complianceScreen'
  | 'reconciliation'
  | 'regulatoryHold';

export interface SettlementTaskData {
  taskReference: string;
  tradeOrderId: string;
  settlementChannelId: string;

  startDate: string;
  endDate: string;
  /** Working minutes required; paused time outside operating hours / blackouts does not count. */
  durationMinutes: number;

  /** Regulatory holds are pinned: the reflow never moves them. */
  isRegulatoryHold: boolean;

  /** All of these must complete before this task starts. */
  dependsOnTaskIds: string[];

  taskType: TaskType;

  /** Optional setup time processed before durationMinutes; also counts as working time. */
  prepTimeMinutes?: number;
}

export type SettlementTask = Document<'settlementTask', SettlementTaskData>;

export interface OperatingHours {
  /** 0–6, Sunday = 0 */
  dayOfWeek: number;
  /** 0–23, inclusive */
  startHour: number;
  /** 0–23, exclusive (8–16 means 08:00–16:00) */
  endHour: number;
}

export interface BlackoutWindow {
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface SettlementChannelData {
  name: string;
  operatingHours: OperatingHours[];
  blackoutWindows: BlackoutWindow[];
}

export type SettlementChannel = Document<'settlementChannel', SettlementChannelData>;

export interface TradeOrderData {
  tradeOrderNumber: string;
  instrumentId: string;
  quantity: number;
  /** Target settlement date (SLA deadline for the order's tasks). */
  settlementDate: string;
}

export type TradeOrder = Document<'tradeOrder', TradeOrderData>;

export interface ReflowInput {
  settlementTasks: SettlementTask[];
  settlementChannels: SettlementChannel[];
  tradeOrders: TradeOrder[];
}

export interface ReflowResult {
  updatedTasks: SettlementTask[];
  changes?: unknown;
  explanation?: unknown;
}

// A span of time a channel is already committed to. Start inclusive, end exclusive, so back-to-back bookings don't clash.
export interface Booking {
  start: DateTime;
  end: DateTime;
}
