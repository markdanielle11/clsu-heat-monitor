import { describe, expect, it } from 'vitest';
import { alertSeverity, computeHeatIndexC, computeHeatIndexRounded, heatLevel } from '../../src/heat/heatIndex.js';

const fToC = (f: number) => ((f - 32) * 5) / 9;
const cToF = (c: number) => (c * 9) / 5 + 32;

describe('computeHeatIndexC', () => {
  // Reference points from the NWS heat index chart (degrees F), tolerance 1.5 F.
  it.each([
    [80, 40, 80],
    [90, 50, 95],
    [90, 60, 100],
    [90, 70, 105],
    [100, 40, 109],
  ])('matches the NWS chart for %i F at %i%% RH', (tF, rh, chartF) => {
    expect(Math.abs(cToF(computeHeatIndexC(fToC(tF), rh)) - chartF)).toBeLessThan(1.5);
  });

  it('gives danger-level values for typical hot-season Nueva Ecija afternoons', () => {
    expect(computeHeatIndexRounded(35, 60)).toBeGreaterThanOrEqual(44);
    expect(computeHeatIndexRounded(35, 60)).toBeLessThanOrEqual(46);
    expect(computeHeatIndexRounded(36, 55)).toBeGreaterThanOrEqual(42);
  });

  it('never reports a heat index below the air temperature', () => {
    expect(computeHeatIndexC(22, 30)).toBe(22);
    expect(computeHeatIndexC(25, 50)).toBeGreaterThanOrEqual(25);
  });

  it('clamps out-of-range humidity instead of exploding', () => {
    expect(computeHeatIndexC(33, 140)).toBeCloseTo(computeHeatIndexC(33, 100), 6);
    expect(computeHeatIndexC(33, -5)).toBeCloseTo(computeHeatIndexC(33, 0), 6);
  });

  it('is monotonic in humidity in the hot range', () => {
    let prev = -Infinity;
    for (let rh = 30; rh <= 90; rh += 10) {
      const hi = computeHeatIndexC(34, rh);
      expect(hi).toBeGreaterThan(prev);
      prev = hi;
    }
  });

  it('rejects non-finite input', () => {
    expect(() => computeHeatIndexC(Number.NaN, 50)).toThrow(RangeError);
    expect(() => computeHeatIndexC(30, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('heatLevel (PAGASA categories)', () => {
  it.each([
    [26, 'normal'],
    [27, 'caution'],
    [32, 'caution'],
    [33, 'extreme_caution'],
    [41, 'extreme_caution'],
    [42, 'danger'],
    [51, 'danger'],
    [52, 'extreme_danger'],
    [58, 'extreme_danger'],
  ] as const)('%i C is %s', (hi, level) => {
    expect(heatLevel(hi)).toBe(level);
  });
});

describe('alertSeverity', () => {
  it('follows the 42 / 52 rules with the default threshold', () => {
    expect(alertSeverity(41, 42)).toBeNull();
    expect(alertSeverity(42, 42)).toBe('high');
    expect(alertSeverity(51, 42)).toBe('high');
    expect(alertSeverity(52, 42)).toBe('extreme');
    expect(alertSeverity(60, 42)).toBe('extreme');
  });

  it('honours a lower user threshold but keeps 52 as extreme', () => {
    expect(alertSeverity(40, 40)).toBe('high');
    expect(alertSeverity(39, 40)).toBeNull();
    expect(alertSeverity(52, 40)).toBe('extreme');
  });

  it('with the threshold at 52 only extreme alerts remain', () => {
    expect(alertSeverity(51, 52)).toBeNull();
    expect(alertSeverity(52, 52)).toBe('extreme');
  });
});
