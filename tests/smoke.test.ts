import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs TypeScript tests with Luxon available', () => {
    expect(DateTime.fromISO('2024-01-15T15:00:00Z', { zone: 'utc' }).weekday).toBe(1);
  });
});
