/**
 * Heat index calculation and classification.
 *
 * Calculation: NWS/NOAA Rothfusz regression with the Steadman simple formula
 * and the two NWS adjustments (low and high humidity). Inputs are air
 * temperature and relative humidity. This is an application-calculated
 * ESTIMATE and is never an official PAGASA value.
 *
 * Classification: PAGASA heat index categories.
 *   27-32  Caution
 *   33-41  Extreme Caution
 *   42-51  Danger
 *   52+    Extreme Danger
 */

export type HeatLevel = 'normal' | 'caution' | 'extreme_caution' | 'danger' | 'extreme_danger';
export type AlertSeverity = 'high' | 'extreme';

export const EXTREME_THRESHOLD_C = 52;
export const DEFAULT_ALERT_THRESHOLD_C = 42;

const cToF = (c: number): number => (c * 9) / 5 + 32;
const fToC = (f: number): number => ((f - 32) * 5) / 9;

/** Heat index in degrees Celsius (unrounded). Never lower than the air temperature. */
export function computeHeatIndexC(tempC: number, relativeHumidity: number): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(relativeHumidity)) {
    throw new RangeError('tempC and relativeHumidity must be finite numbers');
  }
  const rh = Math.min(100, Math.max(0, relativeHumidity));
  const t = cToF(tempC);

  // Steadman simple formula (used on its own when it is cool enough).
  let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);

  if ((hi + t) / 2 >= 80) {
    hi =
      -42.379 +
      2.04901523 * t +
      10.14333127 * rh -
      0.22475541 * t * rh -
      0.00683783 * t * t -
      0.05481717 * rh * rh +
      0.00122874 * t * t * rh +
      0.00085282 * t * rh * rh -
      0.00000199 * t * t * rh * rh;

    if (rh < 13 && t >= 80 && t <= 112) {
      hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    } else if (rh > 85 && t >= 80 && t <= 87) {
      hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }
  }

  // Heat index is not meaningful below the air temperature.
  return Math.max(fToC(hi), tempC);
}

/** Heat index rounded to a whole degree (PAGASA publishes whole degrees). */
export function computeHeatIndexRounded(tempC: number, relativeHumidity: number): number {
  return Math.round(computeHeatIndexC(tempC, relativeHumidity));
}

/** PAGASA category for a (whole degree) heat index. */
export function heatLevel(heatIndexC: number): HeatLevel {
  if (heatIndexC >= EXTREME_THRESHOLD_C) return 'extreme_danger';
  if (heatIndexC >= 42) return 'danger';
  if (heatIndexC >= 33) return 'extreme_caution';
  if (heatIndexC >= 27) return 'caution';
  return 'normal';
}

/**
 * Push alert severity for a (whole degree) heat index and a user threshold.
 *   >= 52            extreme
 *   >= threshold     high (default threshold 42, so 42-51)
 *   otherwise        no alert
 */
export function alertSeverity(heatIndexC: number, thresholdC: number): AlertSeverity | null {
  if (heatIndexC >= EXTREME_THRESHOLD_C) return 'extreme';
  if (heatIndexC >= thresholdC) return 'high';
  return null;
}

export const severityRank = (s: AlertSeverity | null | undefined): number =>
  s === 'extreme' ? 2 : s === 'high' ? 1 : 0;
