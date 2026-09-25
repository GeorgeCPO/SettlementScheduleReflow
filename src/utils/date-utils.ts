import { DateTime } from 'luxon';

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
