import { describe, expect, it, vi } from 'vitest';
import { TokenVault, safeEqual } from '../../src/security.js';
import { OpenMeteoProvider, parseOpenMeteo } from '../../src/weather/openMeteo.js';

const fixture = () => ({
  current: { time: '2026-11-19T13:15', temperature_2m: 35, relative_humidity_2m: 60, weather_code: 1 },
  hourly: {
    time: ['2026-11-19T12:00', '2026-11-19T13:00', '2026-11-19T14:00'],
    temperature_2m: [34, 35, null],
    relative_humidity_2m: [62, 60, 58],
    weather_code: [1, 1, 2],
  },
});

describe('parseOpenMeteo', () => {
  it('converts to Manila ISO times, computes heat index and levels', () => {
    const s = parseOpenMeteo(fixture(), new Date('2026-11-19T05:20:00Z'));
    expect(s.provider).toBe('Open-Meteo');
    expect(s.current.time).toBe('2026-11-19T13:15:00+08:00');
    expect(s.current.heatIndexC).toBeGreaterThanOrEqual(44);
    expect(s.current.level).toBe('danger');
    expect(s.hours[1]).toMatchObject({ time: '2026-11-19T13:00:00+08:00', tempC: 35, humidity: 60, condition: 'Mostly clear' });
  });

  it('skips hours with missing values instead of inventing numbers', () => {
    expect(parseOpenMeteo(fixture(), new Date()).hours).toHaveLength(2);
  });

  it('rejects malformed responses and empty forecasts', () => {
    expect(() => parseOpenMeteo({}, new Date())).toThrow();
    const empty = fixture();
    empty.hourly.temperature_2m = [null, null, null];
    expect(() => parseOpenMeteo(empty, new Date())).toThrow(/no usable hourly data/);
  });
});

describe('OpenMeteoProvider', () => {
  const ok = () => new Response(JSON.stringify(fixture()), { status: 200 });

  it('always queries the CLSU coordinates in Manila time', async () => {
    const fetchImpl = vi.fn(async () => ok());
    await new OpenMeteoProvider({ baseUrl: 'https://example.test/v1/forecast', fetchImpl }).fetchEstimated();
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [URL])[0]);
    expect(url.searchParams.get('latitude')).toBe('15.7328');
    expect(url.searchParams.get('longitude')).toBe('120.9311');
    expect(url.searchParams.get('timezone')).toBe('Asia/Manila');
    expect(url.searchParams.get('apikey')).toBeNull();
  });

  it('retries transient failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 502 })).mockResolvedValueOnce(ok());
    const s = await new OpenMeteoProvider({ baseUrl: 'https://example.test', fetchImpl, retries: 1 }).fetchEstimated();
    expect(s.hours.length).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws after the last attempt', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(new OpenMeteoProvider({ baseUrl: 'https://example.test', fetchImpl, retries: 0 }).fetchEstimated()).rejects.toThrow(/503/);
  });
});

describe('TokenVault', () => {
  const vault = new TokenVault('x'.repeat(40));
  const token = 'ExponentPushToken[abcdefghijklmnop]';

  it('round-trips and never stores plaintext', () => {
    const enc = vault.encrypt(token);
    expect(enc).not.toContain('abcdefghijklmnop');
    expect(vault.decrypt(enc)).toBe(token);
  });

  it('uses a fresh IV each time but a stable lookup hash', () => {
    expect(vault.encrypt(token)).not.toBe(vault.encrypt(token));
    expect(vault.lookupHash(token)).toBe(vault.lookupHash(token));
    expect(vault.lookupHash(token)).not.toBe(vault.lookupHash(token + 'x'));
  });

  it('detects tampering and wrong secrets', () => {
    const enc = Buffer.from(vault.encrypt(token), 'base64');
    enc[enc.length - 1]! ^= 1;
    expect(() => vault.decrypt(enc.toString('base64'))).toThrow();
    expect(() => new TokenVault('y'.repeat(40)).decrypt(vault.encrypt(token))).toThrow();
  });

  it('compares secrets in constant time without length leaks', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
