import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { loadConfig } from '../../src/config.js';
import { createPool, migrate } from '../../src/db/pool.js';
import { Repo } from '../../src/db/repo.js';
import { runForecastCheck, runReceiptCheck } from '../../src/jobs/checkRunner.js';
import { silentLogger } from '../../src/log.js';
import type { PushMessage, PushSender, ReceiptResult, SendResult } from '../../src/push/sender.js';
import { TokenVault } from '../../src/security.js';
import type { EstimatedSnapshot, WeatherProvider } from '../../src/weather/types.js';
import { makeSnapshot } from '../helpers.js';

const DB = process.env.TEST_DATABASE_URL;
const ADMIN = 'a'.repeat(32);
const SECRET = 's'.repeat(40);

class FakeSender implements PushSender {
  sent: PushMessage[] = [];
  nextResult: ((m: PushMessage, i: number) => SendResult) | null = null;
  receipts = new Map<string, ReceiptResult>();
  private n = 0;
  async send(messages: PushMessage[]): Promise<SendResult[]> {
    this.sent.push(...messages);
    return messages.map((m, i) => this.nextResult?.(m, i) ?? { ok: true as const, ticketId: `ticket-${++this.n}` });
  }
  async getReceipts(ids: string[]) {
    const out = new Map<string, ReceiptResult>();
    for (const id of ids) {
      const r = this.receipts.get(id);
      if (r) out.set(id, r);
    }
    return out;
  }
}

class FakeWeather implements WeatherProvider {
  snapshot: EstimatedSnapshot | null = null;
  fail = false;
  async fetchEstimated(): Promise<EstimatedSnapshot> {
    if (this.fail || !this.snapshot) throw new Error('weather down');
    return this.snapshot;
  }
}

describe.skipIf(!DB)('API and alert pipeline (real Postgres)', () => {
  let pool: ReturnType<typeof createPool>;
  let repo: Repo;
  let server: Server;
  let base: string;
  let now = new Date('2026-11-19T02:00:00Z'); // 10:00 in Manila
  const sender = new FakeSender();
  const weather = new FakeWeather();
  const config = loadConfig({ DATABASE_URL: DB!, ADMIN_API_KEY: ADMIN, TOKEN_SECRET: SECRET, NODE_ENV: 'test' });
  const deps = () => ({ repo, weather, sender, config, log: silentLogger, now: () => now });

  const call = async (method: string, path: string, opts: { body?: unknown; auth?: string; admin?: string } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.auth ? { authorization: `Bearer ${opts.auth}` } : {}),
        ...(opts.admin ? { 'x-admin-key': opts.admin } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };

  const register = async (token = 'ExponentPushToken[testtoken0001]') => {
    const r = await call('POST', '/api/devices/register', { body: { expoPushToken: token, platform: 'ios' } });
    expect(r.status).toBe(201);
    return { auth: `${r.json.deviceId}.${r.json.deviceKey}`, id: r.json.deviceId as string };
  };

  const setPeaks = (peaks: [number, number, number]) => {
    weather.snapshot = makeSnapshot(now, peaks);
  };

  beforeAll(async () => {
    pool = createPool(DB!);
    await migrate(pool);
    repo = new Repo(pool, new TokenVault(SECRET));
    server = createApp({ ...deps(), rateLimits: false }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE alerts, alert_state, official_daily, forecast_snapshots, devices RESTART IDENTITY CASCADE');
    sender.sent = [];
    sender.nextResult = null;
    sender.receipts.clear();
    weather.fail = false;
    now = new Date('2026-11-19T02:00:00Z');
    setPeaks([30, 30, 30]);
  });

  it('serves public dashboard and forecast data for CLSU, labelled as an estimate', async () => {
    setPeaks([44, 47, 30]);
    const d = await call('GET', '/api/dashboard');
    expect(d.status).toBe(200);
    expect(d.json.location.name).toContain('Central Luzon State University');
    expect(d.json.location.latitude).toBe(15.7328);
    expect(d.json.source.official).toBe(false);
    expect(d.json.today).toMatchObject({ peakHeatIndexC: 44, level: 'danger', sourceKind: 'estimated', peakTime: '2026-11-19T13:00:00+08:00' });
    expect(d.json.todayOfficial).toBeNull();

    const f = await call('GET', '/api/forecast');
    expect(f.json.days.map((x: { peakHeatIndexC: number }) => x.peakHeatIndexC)).toEqual([44, 47, 33]); // the helper's baseline hour is 33
    expect(f.json.hours.length).toBe(72);

    const info = await call('GET', '/api/info');
    expect(info.json.thresholds.default).toBe(42);
  });

  it('reports NO_DATA cleanly when no weather has ever been fetched', async () => {
    weather.fail = true;
    const d = await call('GET', '/api/dashboard');
    expect(d.status).toBe(503);
    expect(d.json.error.code).toBe('NO_DATA');
  });

  it('flags stale data on the dashboard', async () => {
    weather.snapshot = makeSnapshot(now, [44, 30, 30], new Date(now.getTime() - 4 * 3_600_000));
    await repo.saveSnapshot(weather.snapshot);
    const d = await call('GET', '/api/dashboard');
    expect(d.json.source).toMatchObject({ stale: true, ageMinutes: 240 });
  });

  it('registers devices securely and enforces auth', async () => {
    const bad = await call('POST', '/api/devices/register', { body: { expoPushToken: 'not-a-token' } });
    expect(bad.status).toBe(400);

    const { auth, id } = await register();
    const row = (await pool.query('SELECT token_hash, token_enc, key_hash FROM devices WHERE id = $1', [id])).rows[0];
    expect(JSON.stringify(row)).not.toContain('testtoken0001');

    expect((await call('GET', '/api/devices/me')).status).toBe(401);
    expect((await call('GET', '/api/devices/me', { auth: `${id}.wrongkeywrongkeywrongkey` })).status).toBe(401);
    const me = await call('GET', '/api/devices/me', { auth });
    expect(me.json.settings).toMatchObject({ notificationsEnabled: true, thresholdC: 42, notifyHigh: true, notifyExtreme: true });

    // Re-registering the same token rotates the key and keeps a single row.
    const again = await register();
    expect(again.id).toBe(id);
    expect((await call('GET', '/api/devices/me', { auth })).status).toBe(401);
    expect((await pool.query('SELECT count(*)::int AS n FROM devices')).rows[0].n).toBe(1);
  });

  it('validates and stores settings', async () => {
    const { auth } = await register();
    expect((await call('PATCH', '/api/devices/me', { auth, body: { thresholdC: 20 } })).status).toBe(400);
    expect((await call('PATCH', '/api/devices/me', { auth, body: { location: 'Manila' } })).status).toBe(400);
    expect((await call('PATCH', '/api/devices/me', { auth, body: {} })).status).toBe(400);
    const ok = await call('PATCH', '/api/devices/me', { auth, body: { thresholdC: 44, notifyHigh: false } });
    expect(ok.json.settings).toMatchObject({ thresholdC: 44, notifyHigh: false, notifyExtreme: true });
  });

  it('sends one high warning, de-duplicates, then escalates to extreme and records history', async () => {
    const { auth } = await register();
    setPeaks([44, 30, 30]);

    const first = await runForecastCheck(deps());
    expect(first).toMatchObject({ ran: true, refreshed: true, devices: 1, sent: 1, failed: 0 });
    expect(sender.sent[0]!.title).toBe('HIGH HEAT INDEX WARNING');
    expect(sender.sent[0]!.body).toContain('CLSU Heat Index Alert: 44°C');
    expect(sender.sent[0]!.body).toContain('Not an official PAGASA forecast');
    expect(sender.sent[0]!.to).toBe('ExponentPushToken[testtoken0001]');

    const repeat = await runForecastCheck(deps());
    expect(repeat.sent).toBe(0);
    expect(sender.sent).toHaveLength(1);

    setPeaks([53, 30, 30]);
    now = new Date(now.getTime() + 30 * 60_000);
    const escalated = await runForecastCheck(deps());
    expect(escalated.sent).toBe(1);
    expect(sender.sent[1]!.title).toBe('EXTREME HEAT INDEX WARNING');

    setPeaks([55, 30, 30]);
    expect((await runForecastCheck(deps())).sent).toBe(0);

    const hist = await call('GET', '/api/alerts', { auth });
    expect(hist.json.alerts.map((a: { severity: string; heatIndexC: number; status: string }) => [a.severity, a.heatIndexC, a.status])).toEqual([
      ['extreme', 53, 'sent'],
      ['high', 44, 'sent'],
    ]);
    expect(hist.json.alerts[0]).toMatchObject({ forecastDate: '2026-11-19', sourceKind: 'estimated', reason: 'escalated' });
  });

  it('does nothing when the forecast stays below 42', async () => {
    await register();
    setPeaks([41, 41, 41]);
    expect((await runForecastCheck(deps())).sent).toBe(0);
    expect(sender.sent).toHaveLength(0);
  });

  it('alerts for tomorrow as soon as it is forecast, once', async () => {
    await register();
    setPeaks([30, 46, 30]);
    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.body).toContain('Fri, 20 Nov');
    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(1);
  });

  it('respects notification settings per device', async () => {
    const a = await register('ExponentPushToken[deviceAAAAAAA]');
    const b = await register('ExponentPushToken[deviceBBBBBBB]');
    const c = await register('ExponentPushToken[deviceCCCCCCC]');
    await call('PATCH', '/api/devices/me', { auth: a.auth, body: { notificationsEnabled: false } });
    await call('PATCH', '/api/devices/me', { auth: b.auth, body: { thresholdC: 47 } });
    void c;
    setPeaks([45, 30, 30]);
    await runForecastCheck(deps());
    expect(sender.sent.map((m) => m.to)).toEqual(['ExponentPushToken[deviceCCCCCCC]']);
  });

  it('uses an official PAGASA value over the estimate and confirms an earlier estimate alert once', async () => {
    await register();
    setPeaks([44, 30, 30]);
    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(1);

    expect((await call('POST', '/api/admin/official-forecast', { body: { entries: [] } })).status).toBe(401);
    const bad = await call('POST', '/api/admin/official-forecast', { admin: ADMIN, body: { entries: [{ date: '2026-11-19', heatIndexC: 400, issuedAt: '2026-11-19T01:00:00Z' }] } });
    expect(bad.status).toBe(400);
    const ok = await call('POST', '/api/admin/official-forecast', {
      admin: ADMIN,
      body: { entries: [{ date: '2026-11-19', heatIndexC: 44, issuedAt: '2026-11-19T01:00:00Z', sourceUrl: 'https://www.pagasa.dost.gov.ph/' }] },
    });
    expect(ok.status).toBe(201);

    const dash = await call('GET', '/api/dashboard');
    expect(dash.json.todayOfficial).toMatchObject({ heatIndexC: 44, station: 'Science City of Muñoz' });
    expect(dash.json.today).toMatchObject({ sourceKind: 'official', peakHeatIndexC: 44 });
    expect(dash.json.todayEstimate.sourceKind).toBe('estimated');

    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]!.title).toBe('CONFIRMED: HIGH HEAT INDEX WARNING');
    expect(sender.sent[1]!.body).toContain('Source: official PAGASA forecast, issued 19 Nov, 9:00 AM.');

    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(2);
  });

  it('retries after a transient push failure instead of losing the alert', async () => {
    const { auth } = await register();
    setPeaks([46, 30, 30]);
    sender.nextResult = () => ({ ok: false, error: 'SendFailed: network', tokenInvalid: false });
    const failed = await runForecastCheck(deps());
    expect(failed).toMatchObject({ sent: 0, failed: 1, invalidatedTokens: 0 });

    sender.nextResult = null;
    const retry = await runForecastCheck(deps());
    expect(retry.sent).toBe(1);

    const hist = (await call('GET', '/api/alerts', { auth })).json.alerts;
    expect(hist.map((a: { status: string }) => a.status)).toEqual(['sent', 'failed']);
  });

  it('retires a device whose token Expo reports as unregistered', async () => {
    const { auth, id } = await register();
    setPeaks([46, 30, 30]);
    sender.nextResult = () => ({ ok: false, error: 'DeviceNotRegistered: gone', tokenInvalid: true });
    const r = await runForecastCheck(deps());
    expect(r.invalidatedTokens).toBe(1);

    const row = (await pool.query('SELECT status FROM devices WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('invalid');
    expect((await call('GET', '/api/devices/me', { auth })).json.settings.tokenStatus).toBe('invalid');

    sender.nextResult = null;
    sender.sent = [];
    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(0);
  });

  it('resolves receipts: delivered, and failed receipts retire the token', async () => {
    const a = await register('ExponentPushToken[receiptAAAAAA]');
    const b = await register('ExponentPushToken[receiptBBBBBB]');
    setPeaks([45, 30, 30]);
    await runForecastCheck(deps());
    expect(sender.sent).toHaveLength(2);

    // Too fresh: not checked yet.
    expect(await runReceiptCheck(deps())).toEqual({ checked: 0, failed: 0 });
    await pool.query(`UPDATE alerts SET created_at = now() - interval '20 minutes'`);

    const rows = (await pool.query(`SELECT a.ticket_id, a.device_id FROM alerts a ORDER BY a.id`)).rows;
    sender.receipts.set(rows[0].ticket_id, { ok: true });
    sender.receipts.set(rows[1].ticket_id, { ok: false, error: 'DeviceNotRegistered: gone', tokenInvalid: true });

    expect(await runReceiptCheck(deps())).toEqual({ checked: 2, failed: 1 });
    const statuses = (await pool.query(`SELECT status FROM alerts ORDER BY id`)).rows.map((r) => r.status);
    expect(statuses).toEqual(['delivered', 'failed']);
    const invalid = (await pool.query(`SELECT id FROM devices WHERE status = 'invalid'`)).rows;
    expect(invalid).toHaveLength(1);
    void a;
    void b;
  });

  it('does not alert from stale estimates but still serves the dashboard', async () => {
    await register();
    weather.fail = true;
    const old = makeSnapshot(now, [46, 30, 30], new Date(now.getTime() - 7 * 3_600_000));
    await repo.saveSnapshot(old);
    const r = await runForecastCheck(deps());
    expect(r).toMatchObject({ refreshed: false, skippedStaleData: true, sent: 0 });
    expect(r.refreshError).toContain('weather down');
    expect((await call('GET', '/api/dashboard')).status).toBe(200);
  });

  it('keeps alerting from the last good snapshot when a refresh fails but data is fresh enough', async () => {
    await register();
    await repo.saveSnapshot(makeSnapshot(now, [46, 30, 30], new Date(now.getTime() - 60 * 60_000)));
    weather.fail = true;
    const r = await runForecastCheck(deps());
    expect(r).toMatchObject({ refreshed: false, sent: 1 });
  });

  it('only one instance runs a check at a time', async () => {
    await register();
    setPeaks([46, 30, 30]);
    const held = await repo.withAdvisoryLock(41_001, async () => runForecastCheck(deps()));
    expect(held.ran).toBe(true);
    if (held.ran) expect(held.result.ran).toBe(false);
    expect(sender.sent).toHaveLength(0);
  });

  it('sends a clearly labelled test notification and rate-limits nothing else', async () => {
    const { auth } = await register();
    const r = await call('POST', '/api/devices/me/test-notification', { auth });
    expect(r.json).toEqual({ sent: true });
    expect(sender.sent[0]!.title).toBe('Test notification');
    expect(sender.sent[0]!.body).toContain('not a heat alert');
  });

  it('deletes a device and its history', async () => {
    const { auth, id } = await register();
    setPeaks([46, 30, 30]);
    await runForecastCheck(deps());
    expect((await call('DELETE', '/api/devices/me', { auth })).status).toBe(204);
    expect((await pool.query('SELECT count(*)::int AS n FROM alerts WHERE device_id = $1', [id])).rows[0].n).toBe(0);
    expect((await call('GET', '/api/alerts', { auth })).status).toBe(401);
  });

  it('allows browser access only from configured origins', async () => {
    const corsServer = createApp({
      ...deps(),
      config: { ...config, CORS_ORIGINS: 'https://markdanielle11.github.io/' },
      rateLimits: false,
    }).listen(0);
    const url = `http://127.0.0.1:${(corsServer.address() as AddressInfo).port}/api/info`;
    try {
      const allowed = await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://markdanielle11.github.io', 'access-control-request-method': 'GET' } });
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://markdanielle11.github.io');
      const get = await fetch(url, { headers: { origin: 'https://markdanielle11.github.io' } });
      expect(get.headers.get('access-control-allow-origin')).toBe('https://markdanielle11.github.io');
      const other = await fetch(url, { headers: { origin: 'https://evil.example' } });
      expect(other.status).toBe(200);
      expect(other.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      corsServer.close();
    }
    // The default config allows no browser origin at all.
    const none = await fetch(`${base}/api/info`, { headers: { origin: 'https://markdanielle11.github.io' } });
    expect(none.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('manual admin trigger requires the admin key', async () => {
    expect((await call('POST', '/api/admin/run-check')).status).toBe(401);
    setPeaks([30, 30, 30]);
    const r = await call('POST', '/api/admin/run-check', { admin: ADMIN });
    expect(r.status).toBe(200);
    expect(r.json.refreshed).toBe(true);
  });
});
