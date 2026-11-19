import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import type { Config } from '../config.js';
import type { Device, Repo } from '../db/repo.js';
import { DEFAULT_ALERT_THRESHOLD_C } from '../heat/heatIndex.js';
import { runForecastCheck } from '../jobs/checkRunner.js';
import { errMsg, type Logger } from '../log.js';
import type { PushSender } from '../push/sender.js';
import { safeEqual } from '../security.js';
import { manilaDate } from '../time.js';
import type { EstimatedSnapshot, WeatherProvider } from '../weather/types.js';
import { dashboardView, forecastView, infoView } from './views.js';

export interface AppDeps {
  repo: Repo;
  weather: WeatherProvider;
  sender: PushSender;
  config: Config;
  log: Logger;
  now?: () => Date;
  /** Tests turn rate limiting off. */
  rateLimits?: boolean;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const registerSchema = z.object({
  expoPushToken: z.string().regex(/^(Expo|Exponent)PushToken\[[^\]\s]+\]$/, 'Not a valid Expo push token'),
  platform: z.enum(['ios', 'android']).default('ios'),
});

const settingsSchema = z
  .object({
    notificationsEnabled: z.boolean(),
    thresholdC: z.number().int().min(35).max(52),
    notifyHigh: z.boolean(),
    notifyExtreme: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting');

const officialEntry = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heatIndexC: z.number().int().min(0).max(70),
  issuedAt: z.iso.datetime({ offset: true }),
  station: z.string().min(1).max(120).default('Science City of Muñoz'),
  sourceUrl: z.url().max(500).optional(),
});
const officialSchema = z.object({ entries: z.array(officialEntry).min(1).max(31) });

export function createApp(deps: AppDeps): express.Express {
  const { repo, weather, sender, config, log } = deps;
  const clock = deps.now ?? (() => new Date());
  const app = express();

  if (config.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));

  // CORS: only for explicitly allowed browser origins (the web version of the app).
  const allowedOrigins = new Set(
    config.CORS_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  const limitsOn = deps.rateLimits !== false;
  const limiter = (opts: { windowMs: number; limit: number; key?: (req: Request) => string }): RequestHandler =>
    limitsOn
      ? rateLimit({
          windowMs: opts.windowMs,
          limit: opts.limit,
          standardHeaders: 'draft-7',
          legacyHeaders: false,
          ...(opts.key ? { keyGenerator: opts.key } : {}),
          validate: { keyGeneratorIpFallback: false },
          message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later.' } },
        })
      : (_req, _res, next) => next();

  app.use(limiter({ windowMs: 15 * 60_000, limit: 600, key: (req) => req.ip ?? 'unknown' }));

  // ----------------------------------------------------------------- helpers
  const requireDevice: RequestHandler = async (req, res, next) => {
    const m = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/i.exec(req.header('authorization') ?? '');
    const device = m ? await repo.authenticateDevice(m[1]!, m[2]!) : null;
    if (!device) throw new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid device credentials.');
    res.locals.device = device;
    next();
  };

  const requireAdmin: RequestHandler = (req, _res, next) => {
    const key = req.header('x-admin-key') ?? '';
    if (!key || !safeEqual(key, config.ADMIN_API_KEY)) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid admin key.');
    next();
  };

  const deviceOf = (res: Response): Device => res.locals.device as Device;

  /** Latest snapshot; on a brand new deployment, fetch one on demand. */
  async function currentSnapshot(): Promise<EstimatedSnapshot> {
    const existing = await repo.latestSnapshot();
    if (existing) return existing;
    try {
      const fresh = await weather.fetchEstimated();
      await repo.saveSnapshot(fresh);
      return fresh;
    } catch (e) {
      log.error('on-demand forecast fetch failed', { error: errMsg(e) });
      throw new HttpError(503, 'NO_DATA', 'Weather data is not available yet. Please try again shortly.');
    }
  }

  const settingsView = (d: Device) => ({
    notificationsEnabled: d.notificationsEnabled,
    thresholdC: d.thresholdC,
    notifyHigh: d.notifyHigh,
    notifyExtreme: d.notifyExtreme,
    tokenStatus: d.status,
  });

  // ------------------------------------------------------------ public routes
  app.get('/api/health', async (_req, res) => {
    await repo.pool.query('SELECT 1');
    res.json({ ok: true, time: clock().toISOString() });
  });

  app.get('/api/info', (_req, res) => {
    res.json(infoView(DEFAULT_ALERT_THRESHOLD_C));
  });

  app.get('/api/dashboard', async (_req, res) => {
    const now = clock();
    const [snapshot, official] = await Promise.all([currentSnapshot(), repo.listOfficialFrom(manilaDate(now))]);
    res.json(dashboardView(snapshot, official, now, config.STALE_AFTER_MINUTES));
  });

  app.get('/api/forecast', async (_req, res) => {
    const now = clock();
    const [snapshot, official] = await Promise.all([currentSnapshot(), repo.listOfficialFrom(manilaDate(now))]);
    res.json(forecastView(snapshot, official, now, config.STALE_AFTER_MINUTES));
  });

  // ----------------------------------------------------------- device routes
  app.post('/api/devices/register', limiter({ windowMs: 60 * 60_000, limit: 30, key: (r) => r.ip ?? 'unknown' }), async (req, res) => {
    const body = registerSchema.parse(req.body);
    const { device, deviceKey } = await repo.registerDevice(body.expoPushToken, body.platform);
    res.status(201).json({ deviceId: device.id, deviceKey, settings: settingsView(device) });
  });

  app.get('/api/devices/me', requireDevice, (_req, res) => {
    res.json({ settings: settingsView(deviceOf(res)) });
  });

  app.patch('/api/devices/me', requireDevice, async (req, res) => {
    const patch = settingsSchema.parse(req.body);
    const updated = await repo.updateSettings(deviceOf(res).id, patch);
    if (!updated) throw new HttpError(404, 'NOT_FOUND', 'Device not found.');
    res.json({ settings: settingsView(updated) });
  });

  app.delete('/api/devices/me', requireDevice, async (_req, res) => {
    await repo.deleteDevice(deviceOf(res).id);
    res.status(204).end();
  });

  app.get('/api/alerts', requireDevice, async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit ?? undefined);
    res.json({ alerts: await repo.listAlerts(deviceOf(res).id, limit) });
  });

  app.post(
    '/api/devices/me/test-notification',
    requireDevice,
    limiter({ windowMs: 60 * 60_000, limit: 5, key: (r) => `test:${r.header('authorization') ?? r.ip ?? 'unknown'}` }),
    async (_req, res) => {
      const token = await repo.getDeviceToken(deviceOf(res).id);
      if (!token) throw new HttpError(409, 'TOKEN_INVALID', 'This device is not registered for push notifications.');
      const [result] = await sender.send([
        {
          to: token,
          title: 'Test notification',
          body: 'CLSU Heat Monitor push notifications are working. This is a test and not a heat alert.',
          data: { type: 'test' },
        },
      ]);
      if (!result?.ok) {
        if (result?.tokenInvalid) await repo.markDeviceInvalid(deviceOf(res).id, result.error);
        throw new HttpError(502, 'PUSH_FAILED', result?.error ?? 'Push service did not respond.');
      }
      res.json({ sent: true });
    },
  );

  // ------------------------------------------------------------ admin routes
  /**
   * Load official PAGASA heat index forecast values for CLSU. The values must be copied from a
   * real PAGASA product (bulletin, iHeatMAP, or a data request) by a person or a trusted script.
   */
  app.post('/api/admin/official-forecast', requireAdmin, async (req, res) => {
    const { entries } = officialSchema.parse(req.body);
    for (const e of entries) {
      await repo.upsertOfficial({ date: e.date, heatIndexC: e.heatIndexC, issuedAt: e.issuedAt, station: e.station, sourceUrl: e.sourceUrl ?? null });
    }
    log.info('official forecast values stored', { count: entries.length });
    res.status(201).json({ stored: entries.length });
  });

  app.post('/api/admin/run-check', requireAdmin, async (_req, res) => {
    res.json(await runForecastCheck({ repo, weather, sender, config, log, now: clock }));
  });

  // ---------------------------------------------------------------- failures
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found.')));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') } });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body.' } });
      return;
    }
    log.error('unhandled request error', { error: errMsg(err) });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  });

  return app;
}
