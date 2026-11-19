/**
 * Manila time helpers. Manila is UTC+8 all year (no DST), so a fixed offset is exact.
 * All "forecast dates" are Manila-local calendar dates (YYYY-MM-DD).
 */
const OFFSET_MS = 8 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Manila calendar date (YYYY-MM-DD) of an instant. */
export function manilaDate(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Open-Meteo gives local times like "2026-11-19T13:00"; turn them into full ISO with +08:00. */
export function localToIso(local: string): string {
  return /[zZ]|[+-]\d{2}:\d{2}$/.test(local) ? local : `${local.length === 16 ? `${local}:00` : local}+08:00`;
}

/** "Thu, 19 Nov" for a Manila date. */
export function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "1:00 PM" for an ISO instant, in Manila time. */
export function formatTimeLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  const h24 = d.getUTCHours();
  const m = d.getUTCMinutes();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "19 Nov, 5:00 PM" for an ISO instant, in Manila time. */
export function formatStampLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${formatTimeLabel(iso)}`;
}
