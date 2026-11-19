/**
 * Manila-time formatting without Intl, so output is identical on every device and
 * regardless of the phone's own time zone. Manila is UTC+8 all year.
 */
const OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const manila = (iso: string): Date => new Date(new Date(iso).getTime() + OFFSET_MS);

/** "1:00 PM" */
export function fmtTime(iso: string): string {
  const d = manila(iso);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "1 PM" (for compact hourly tiles and chart labels) */
export function fmtHour(iso: string): string {
  const h = manila(iso).getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Thu, 19 Nov" for a YYYY-MM-DD date. */
export function fmtDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "19 Nov, 5:00 PM" */
export function fmtStamp(iso: string): string {
  return `${manila(iso).getUTCDate()} ${MONTHS[manila(iso).getUTCMonth()]}, ${fmtTime(iso)}`;
}

/** Segmented-control label: "Today", "Tomorrow", or the weekday. */
export function dayLabel(date: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** "Just now", "12 min ago", "3 h ago", "2 days ago" */
export function fmtAge(minutes: number): string {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export const degrees = (n: number): string => `${Math.round(n)}°C`;
