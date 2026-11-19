import { describe, expect, it } from 'vitest';
import type { DayCandidate } from '../../src/alerts/engine.js';
import { buildAlertMessage } from '../../src/alerts/messages.js';
import { formatDateLabel, formatStampLabel, formatTimeLabel, localToIso, manilaDate } from '../../src/time.js';

const est: DayCandidate = { date: '2026-11-19', heatIndexC: 42, peakTime: '2026-11-19T13:00:00+08:00', sourceKind: 'estimated', issuedAt: null };
const off: DayCandidate = { date: '2026-11-19', heatIndexC: 52, peakTime: null, sourceKind: 'official', issuedAt: '2026-11-19T09:00:00Z' };

describe('alert messages', () => {
  it('builds the high warning with location, value, date, time and precautions', () => {
    const m = buildAlertMessage(est, 'high', 'new');
    expect(m.title).toBe('HIGH HEAT INDEX WARNING');
    expect(m.body).toContain('CLSU Heat Index Alert: 42°C');
    expect(m.body).toContain('Central Luzon State University');
    expect(m.body).toContain('Thu, 19 Nov');
    expect(m.body).toContain('1:00 PM');
    expect(m.body).toContain('Stay hydrated, avoid prolonged outdoor activities, and minimize direct sun exposure.');
  });

  it('builds the extreme warning', () => {
    const m = buildAlertMessage(off, 'extreme', 'new');
    expect(m.title).toBe('EXTREME HEAT INDEX WARNING');
    expect(m.body).toContain('CLSU Heat Index Alert: 52°C');
    expect(m.body).toContain('Avoid outdoor activities and follow official PAGASA and university advisories.');
  });

  it('labels estimates as estimates and never as PAGASA forecasts', () => {
    const body = buildAlertMessage(est, 'high', 'new').body;
    expect(body).toContain('Not an official PAGASA forecast');
    expect(body).not.toMatch(/Source: official PAGASA/);
  });

  it('labels official values with the issue time', () => {
    const body = buildAlertMessage(off, 'extreme', 'new').body;
    expect(body).toContain('Source: official PAGASA forecast, issued 19 Nov, 5:00 PM.');
    expect(body).not.toContain('Not an official PAGASA forecast');
  });

  it('marks updates and official confirmations', () => {
    expect(buildAlertMessage(est, 'high', 'updated').title).toBe('UPDATED: HIGH HEAT INDEX WARNING');
    expect(buildAlertMessage(off, 'extreme', 'official_confirmation').title).toBe('CONFIRMED: EXTREME HEAT INDEX WARNING');
  });

  it('contains no em or en dashes', () => {
    for (const c of [est, off]) {
      for (const s of ['high', 'extreme'] as const) {
        const m = buildAlertMessage(c, s, 'new');
        expect(m.title + m.body).not.toMatch(/[–—]/);
      }
    }
  });
});

describe('time helpers', () => {
  it('computes the Manila date across the UTC boundary', () => {
    expect(manilaDate(new Date('2026-11-18T15:59:59Z'))).toBe('2026-11-18');
    expect(manilaDate(new Date('2026-11-18T16:00:00Z'))).toBe('2026-11-19');
  });

  it('adds the Manila offset to Open-Meteo local timestamps', () => {
    expect(localToIso('2026-11-19T13:00')).toBe('2026-11-19T13:00:00+08:00');
    expect(localToIso('2026-11-19T13:00:00+08:00')).toBe('2026-11-19T13:00:00+08:00');
  });

  it('formats labels', () => {
    expect(formatDateLabel('2026-11-19')).toBe('Thu, 19 Nov');
    expect(formatTimeLabel('2026-11-19T00:00:00+08:00')).toBe('12:00 AM');
    expect(formatTimeLabel('2026-11-19T12:30:00+08:00')).toBe('12:30 PM');
    expect(formatStampLabel('2026-11-19T09:00:00Z')).toBe('19 Nov, 5:00 PM');
  });
});
