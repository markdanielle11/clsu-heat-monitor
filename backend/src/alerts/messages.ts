import type { AlertSeverity } from '../heat/heatIndex.js';
import { formatDateLabel, formatStampLabel, formatTimeLabel } from '../time.js';
import type { AlertReason, DayCandidate } from './engine.js';

export interface AlertMessage {
  title: string;
  body: string;
}

const PRECAUTIONS_HIGH = 'Stay hydrated, avoid prolonged outdoor activities, and minimize direct sun exposure.';
const PRECAUTIONS_EXTREME = 'Avoid outdoor activities and follow official PAGASA and university advisories.';

/** Source line. Estimates are always labelled as estimates, never as PAGASA forecasts. */
export function sourceLine(c: Pick<DayCandidate, 'sourceKind' | 'issuedAt'>): string {
  if (c.sourceKind === 'official') {
    return c.issuedAt
      ? `Source: official PAGASA forecast, issued ${formatStampLabel(c.issuedAt)}.`
      : 'Source: official PAGASA forecast.';
  }
  return 'Source: app estimate from a weather model forecast. Not an official PAGASA forecast.';
}

export function buildAlertMessage(c: DayCandidate, severity: AlertSeverity, reason: AlertReason): AlertMessage {
  const day = formatDateLabel(c.date);
  const when = c.peakTime ? `${day}, around ${formatTimeLabel(c.peakTime)}` : day;
  const prefix = reason === 'updated' ? 'UPDATED: ' : reason === 'official_confirmation' ? 'CONFIRMED: ' : '';

  if (severity === 'extreme') {
    return {
      title: `${prefix}EXTREME HEAT INDEX WARNING`,
      body: [
        `CLSU Heat Index Alert: ${c.heatIndexC}°C`,
        `The forecast indicates an extreme heat index at CLSU (${c.heatIndexC}°C) on ${when}.`,
        PRECAUTIONS_EXTREME,
        sourceLine(c),
      ].join('\n'),
    };
  }
  return {
    title: `${prefix}HIGH HEAT INDEX WARNING`,
    body: [
      `CLSU Heat Index Alert: ${c.heatIndexC}°C`,
      `The forecast indicates that the heat index at Central Luzon State University may reach ${c.heatIndexC}°C on ${when}.`,
      PRECAUTIONS_HIGH,
      sourceLine(c),
    ].join('\n'),
  };
}
