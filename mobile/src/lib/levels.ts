import type { HeatLevel } from './types';

/** PAGASA heat index categories. Kept in sync with backend/src/heat/heatIndex.ts. */
export function levelFor(heatIndexC: number): HeatLevel {
  if (heatIndexC >= 52) return 'extreme_danger';
  if (heatIndexC >= 42) return 'danger';
  if (heatIndexC >= 33) return 'extreme_caution';
  if (heatIndexC >= 27) return 'caution';
  return 'normal';
}

/**
 * Marker position (0..1) on the four-segment scale Caution | Extreme Caution | Danger | Extreme Danger.
 * Each segment is one quarter of the bar; values below 27 sit at the far left, 60 and above at the far right.
 */
export function scalePosition(heatIndexC: number): number {
  const edges = [27, 33, 42, 52, 60];
  if (heatIndexC <= edges[0]!) return 0;
  if (heatIndexC >= edges[4]!) return 1;
  for (let i = 0; i < 4; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    if (heatIndexC < hi) return (i + (heatIndexC - lo) / (hi - lo)) / 4;
  }
  return 1;
}

/** Chart y-range: always shows the alert threshold, with a span divisible by 4 for even grid lines. */
export function chartRange(values: number[], thresholdC: number): { min: number; max: number; step: number } {
  const lo = Math.min(...values, thresholdC - 8);
  const hi = Math.max(...values, thresholdC) + 2;
  const min = Math.floor(lo / 2) * 2 - 2;
  let span = Math.ceil(hi - min);
  while (span % 4 !== 0) span++;
  return { min, max: min + span, step: span / 4 };
}
