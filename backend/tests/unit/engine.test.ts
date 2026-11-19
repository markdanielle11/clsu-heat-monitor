import { describe, expect, it } from 'vitest';
import { buildCandidates, decide, type DayCandidate, type LastNotified } from '../../src/alerts/engine.js';
import { makeHours } from '../helpers.js';
import type { OfficialDaily } from '../../src/weather/types.js';

// 10:30 in Manila on Thu 19 Nov 2026
const NOW = new Date('2026-11-19T02:30:00Z');
const prefs = { thresholdC: 42, notifyHigh: true, notifyExtreme: true };
const cand = (hi: number, over: Partial<DayCandidate> = {}): DayCandidate => ({
  date: '2026-11-19',
  heatIndexC: hi,
  peakTime: '2026-11-19T13:00:00+08:00',
  sourceKind: 'estimated',
  issuedAt: null,
  ...over,
});
const last = (severity: 'high' | 'extreme', hi: number, sourceKind: 'official' | 'estimated' = 'estimated'): LastNotified => ({ severity, heatIndexC: hi, sourceKind });

describe('buildCandidates', () => {
  it('picks the highest upcoming hour of today and tomorrow, in Manila time', () => {
    const hours = makeHours(NOW, [44, 47, 50]);
    const out = buildCandidates({ hours, official: [], now: NOW });
    expect(out.map((c) => [c.date, c.heatIndexC, c.sourceKind])).toEqual([
      ['2026-11-19', 44, 'estimated'],
      ['2026-11-20', 47, 'estimated'],
    ]);
    expect(out[0]!.peakTime).toBe('2026-11-19T13:00:00+08:00');
  });

  it('ignores a peak that already passed today', () => {
    const hours = makeHours(NOW, [50, 30, 30]);
    const evening = new Date('2026-11-19T10:30:00Z'); // 18:30 Manila, after the 13:00 peak
    const out = buildCandidates({ hours, official: [], now: evening });
    expect(out.find((c) => c.date === '2026-11-19')!.heatIndexC).toBe(33);
  });

  it('still counts the hour that is in progress', () => {
    const hours = makeHours(NOW, [50, 30, 30]);
    const during = new Date('2026-11-19T05:30:00Z'); // 13:30 Manila, inside the 13:00 hour
    expect(buildCandidates({ hours, official: [], now: during })[0]!.heatIndexC).toBe(50);
  });

  it('rolls the calendar day at Manila midnight, not UTC midnight', () => {
    const lateEvening = new Date('2026-11-19T16:30:00Z'); // 00:30 on the 20th in Manila
    const out = buildCandidates({ hours: makeHours(lateEvening, [30, 45, 30]), official: [], now: lateEvening });
    expect(out[0]!.date).toBe('2026-11-20');
  });

  it('lets an official PAGASA value replace the estimate for that date only', () => {
    const official: OfficialDaily[] = [
      { date: '2026-11-19', heatIndexC: 41, issuedAt: '2026-11-18T09:00:00Z', station: 'Science City of Muñoz', sourceUrl: null },
    ];
    const out = buildCandidates({ hours: makeHours(NOW, [47, 49, 30]), official, now: NOW });
    expect(out[0]).toMatchObject({ date: '2026-11-19', heatIndexC: 41, sourceKind: 'official', peakTime: null });
    expect(out[1]).toMatchObject({ date: '2026-11-20', heatIndexC: 49, sourceKind: 'estimated' });
  });

  it('returns nothing without data', () => {
    expect(buildCandidates({ hours: [], official: [], now: NOW })).toEqual([]);
  });
});

describe('decide', () => {
  it('sends nothing below the threshold', () => {
    expect(decide(cand(41), prefs, undefined, 3)).toEqual({ send: false, why: 'below_threshold' });
  });

  it('sends a high warning at 42 and 51', () => {
    expect(decide(cand(42), prefs, undefined, 3)).toEqual({ send: true, severity: 'high', reason: 'new' });
    expect(decide(cand(51), prefs, undefined, 3)).toMatchObject({ send: true, severity: 'high' });
  });

  it('sends an extreme warning at 52', () => {
    expect(decide(cand(52), prefs, undefined, 3)).toEqual({ send: true, severity: 'extreme', reason: 'new' });
  });

  it('does not repeat the same severity for the same day', () => {
    expect(decide(cand(43), prefs, last('high', 42), 3)).toEqual({ send: false, why: 'duplicate' });
    expect(decide(cand(55), prefs, last('extreme', 53), 3)).toEqual({ send: false, why: 'duplicate' });
  });

  it('escalates from 42 to 52', () => {
    expect(decide(cand(52), prefs, last('high', 42), 3)).toEqual({ send: true, severity: 'extreme', reason: 'escalated' });
  });

  it('sends an update when the peak rises significantly within the same severity', () => {
    expect(decide(cand(45), prefs, last('high', 42), 3)).toEqual({ send: true, severity: 'high', reason: 'updated' });
    expect(decide(cand(44), prefs, last('high', 42), 3)).toEqual({ send: false, why: 'duplicate' });
  });

  it('does not push when the forecast falls', () => {
    expect(decide(cand(44), prefs, last('extreme', 53), 3)).toEqual({ send: false, why: 'not_higher' });
    expect(decide(cand(40), prefs, last('high', 45), 3)).toEqual({ send: false, why: 'below_threshold' });
  });

  it('confirms an estimate-based alert once, when the official forecast arrives', () => {
    const official = cand(43, { sourceKind: 'official', peakTime: null, issuedAt: '2026-11-19T09:00:00Z' });
    expect(decide(official, prefs, last('high', 42, 'estimated'), 3)).toEqual({ send: true, severity: 'high', reason: 'official_confirmation' });
    expect(decide(official, prefs, last('high', 43, 'official'), 3)).toEqual({ send: false, why: 'duplicate' });
  });

  it('respects per-severity toggles', () => {
    expect(decide(cand(45), { ...prefs, notifyHigh: false }, undefined, 3)).toEqual({ send: false, why: 'severity_disabled' });
    expect(decide(cand(53), { ...prefs, notifyExtreme: false }, undefined, 3)).toEqual({ send: false, why: 'severity_disabled' });
    expect(decide(cand(53), { ...prefs, notifyHigh: false }, undefined, 3)).toMatchObject({ send: true, severity: 'extreme' });
  });

  it('uses the per-device threshold', () => {
    expect(decide(cand(40), { ...prefs, thresholdC: 40 }, undefined, 3)).toMatchObject({ send: true, severity: 'high' });
    expect(decide(cand(46), { ...prefs, thresholdC: 48 }, undefined, 3)).toEqual({ send: false, why: 'below_threshold' });
  });
});
