import { describe, expect, it } from 'vitest';
import { dayLabel, fmtAge, fmtDate, fmtHour, fmtStamp, fmtTime } from '../src/lib/format';
import { chartRange, levelFor, scalePosition } from '../src/lib/levels';

describe('levelFor (PAGASA categories)', () => {
  it.each([
    [26, 'normal'],
    [27, 'caution'],
    [33, 'extreme_caution'],
    [41, 'extreme_caution'],
    [42, 'danger'],
    [51, 'danger'],
    [52, 'extreme_danger'],
  ] as const)('%i is %s', (hi, level) => expect(levelFor(hi)).toBe(level));
});

describe('scalePosition', () => {
  it('sits at the edges for out-of-range values', () => {
    expect(scalePosition(10)).toBe(0);
    expect(scalePosition(27)).toBe(0);
    expect(scalePosition(60)).toBe(1);
    expect(scalePosition(80)).toBe(1);
  });
  it('places each band in its own quarter', () => {
    expect(scalePosition(30)).toBeGreaterThan(0);
    expect(scalePosition(30)).toBeLessThan(0.25);
    expect(scalePosition(33)).toBeCloseTo(0.25, 6);
    expect(scalePosition(42)).toBeCloseTo(0.5, 6);
    expect(scalePosition(52)).toBeCloseTo(0.75, 6);
  });
  it('never goes backwards', () => {
    let prev = -1;
    for (let hi = 20; hi <= 65; hi++) {
      const p = scalePosition(hi);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('chartRange', () => {
  it('always includes the threshold and has an axis span divisible by 4', () => {
    for (const [values, thr] of [[[26, 31, 47], 42], [[30, 33], 42], [[40, 55], 42], [[26, 38], 36]] as const) {
      const r = chartRange([...values], thr);
      expect(r.min).toBeLessThanOrEqual(Math.min(...values));
      expect(r.max).toBeGreaterThan(Math.max(...values));
      expect(r.max).toBeGreaterThan(thr);
      expect((r.max - r.min) % 4).toBe(0);
      expect(r.step * 4).toBe(r.max - r.min);
    }
  });
});

describe('Manila time formatting (independent of the phone time zone)', () => {
  it('formats times, hours and dates', () => {
    expect(fmtTime('2026-11-19T13:00:00+08:00')).toBe('1:00 PM');
    expect(fmtTime('2026-11-19T00:00:00+08:00')).toBe('12:00 AM');
    expect(fmtHour('2026-11-19T12:00:00+08:00')).toBe('12 PM');
    expect(fmtDate('2026-11-19')).toBe('Thu, 19 Nov');
    expect(fmtStamp('2026-11-19T09:00:00Z')).toBe('19 Nov, 5:00 PM');
  });
  it('labels forecast days', () => {
    expect(dayLabel('2026-11-19', 0)).toBe('Today');
    expect(dayLabel('2026-11-20', 1)).toBe('Tomorrow');
    expect(dayLabel('2026-11-21', 2)).toBe('Sat');
  });
  it('describes data age', () => {
    expect(fmtAge(0.2)).toBe('Just now');
    expect(fmtAge(12)).toBe('12 min ago');
    expect(fmtAge(180)).toBe('3 h ago');
    expect(fmtAge(60 * 24 * 3)).toBe('3 days ago');
  });
});
