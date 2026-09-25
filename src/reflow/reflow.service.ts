import type { ReflowInput, ReflowResult } from './types.ts';

export class ReflowService {
  reflow(input: ReflowInput): ReflowResult {
    // Pass-through for now: the schedule is returned unchanged.
    return { updatedTasks: structuredClone(input.settlementTasks) };
  }
}
