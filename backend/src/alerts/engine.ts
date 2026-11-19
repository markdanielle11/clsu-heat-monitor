import { alertSeverity, severityRank, type AlertSeverity } from '../heat/heatIndex.js';
import { addDays, manilaDate } from '../time.js';
import type { HourPoint, OfficialDaily, SourceKind } from '../weather/types.js';

/** The highest heat index expected on one Manila calendar day, and where that number comes from. */
export interface DayCandidate {
  date: string;
  heatIndexC: number;
  /** ISO time of the peak hour. Null for official values (PAGASA publishes a daily maximum only). */
  peakTime: string | null;
  sourceKind: SourceKind;
  /** When PAGASA issued it (official only). */
  issuedAt: string | null;
}

export interface AlertPrefs {
  thresholdC: number;
  notifyHigh: boolean;
  notifyExtreme: boolean;
}

export interface LastNotified {
  severity: AlertSeverity;
  heatIndexC: number;
  sourceKind: SourceKind;
}

export type AlertReason = 'new' | 'escalated' | 'updated' | 'official_confirmation';

export type Decision =
  | { send: true; severity: AlertSeverity; reason: AlertReason }
  | { send: false; why: 'below_threshold' | 'severity_disabled' | 'duplicate' | 'not_higher' };

const HOUR_MS = 60 * 60 * 1000;

/**
 * Build one candidate per upcoming day (today and tomorrow, Manila time).
 *
 * - Estimated candidates only look at hours that have not fully passed yet, so a peak that
 *   already happened this afternoon never triggers an alert in the evening.
 * - An official PAGASA value for a date replaces the estimate for that date.
 */
export function buildCandidates(opts: {
  hours: HourPoint[];
  official: OfficialDaily[];
  now: Date;
  days?: number;
}): DayCandidate[] {
  const today = manilaDate(opts.now);
  const dates = Array.from({ length: opts.days ?? 2 }, (_, i) => addDays(today, i));
  const out: DayCandidate[] = [];

  for (const date of dates) {
    const official = opts.official.find((o) => o.date === date);
    if (official) {
      out.push({ date, heatIndexC: official.heatIndexC, peakTime: null, sourceKind: 'official', issuedAt: official.issuedAt });
      continue;
    }
    let best: HourPoint | undefined;
    for (const h of opts.hours) {
      if (h.time.slice(0, 10) !== date) continue;
      if (new Date(h.time).getTime() + HOUR_MS <= opts.now.getTime()) continue; // hour already over
      if (!best || h.heatIndexC > best.heatIndexC) best = h;
    }
    if (best) {
      out.push({ date, heatIndexC: best.heatIndexC, peakTime: best.time, sourceKind: 'estimated', issuedAt: null });
    }
  }
  return out;
}

/**
 * Decide whether a device should be notified about a day's candidate.
 *
 *  new                    first time this day reaches the threshold
 *  escalated              severity went up (e.g. high 42 -> extreme 52)
 *  updated                same severity, but the peak rose by >= significantChangeC since the last push
 *  official_confirmation  a PAGASA official value now backs an alert that was sent from an estimate
 *
 * Nothing is sent for the same day and severity twice, and no push is sent when a forecast
 * falls (the alert history keeps the earlier warning).
 */
export function decide(
  candidate: DayCandidate,
  prefs: AlertPrefs,
  last: LastNotified | undefined,
  significantChangeC: number,
): Decision {
  const severity = alertSeverity(candidate.heatIndexC, prefs.thresholdC);
  if (!severity) return { send: false, why: 'below_threshold' };
  if (severity === 'high' && !prefs.notifyHigh) return { send: false, why: 'severity_disabled' };
  if (severity === 'extreme' && !prefs.notifyExtreme) return { send: false, why: 'severity_disabled' };

  if (!last) return { send: true, severity, reason: 'new' };

  if (severityRank(severity) > severityRank(last.severity)) return { send: true, severity, reason: 'escalated' };
  if (severityRank(severity) < severityRank(last.severity)) return { send: false, why: 'not_higher' };

  if (candidate.heatIndexC - last.heatIndexC >= significantChangeC) return { send: true, severity, reason: 'updated' };
  if (candidate.sourceKind === 'official' && last.sourceKind === 'estimated') {
    return { send: true, severity, reason: 'official_confirmation' };
  }
  return { send: false, why: 'duplicate' };
}
