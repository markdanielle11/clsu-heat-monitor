import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Postgres connection string (Supabase, Neon, Render, local). Add ?sslmode=require for hosted DBs. */
  DATABASE_URL: z.string().min(1),
  /** Protects /api/admin/*. Use a long random value. */
  ADMIN_API_KEY: z.string().min(24, 'ADMIN_API_KEY must be at least 24 characters'),
  /** Master secret used to encrypt and hash stored push tokens. Never change it after launch. */
  TOKEN_SECRET: z.string().min(32, 'TOKEN_SECRET must be at least 32 characters'),
  ENABLE_SCHEDULER: z.enum(['true', 'false']).default('true'),
  /** Forecast refresh + alert check. Default: every 15 minutes (Open-Meteo updates "current" every 15 min). */
  FORECAST_CRON: z.string().default('*/15 * * * *'),
  /** Expo push receipt check. Default: every 10 minutes. */
  RECEIPT_CRON: z.string().default('*/10 * * * *'),
  OPEN_METEO_BASE_URL: z.string().url().default('https://api.open-meteo.com/v1/forecast'),
  /** Only needed for Open-Meteo commercial plans. */
  OPEN_METEO_API_KEY: z.string().optional(),
  /** Dashboard shows an "outdated" warning after this many minutes without a successful refresh. */
  STALE_AFTER_MINUTES: z.coerce.number().int().positive().default(180),
  /** Alerts are NOT sent from estimated data older than this. */
  MAX_ALERT_DATA_AGE_MINUTES: z.coerce.number().int().positive().default(360),
  /** Re-notify when the forecast peak rises by at least this many degrees within the same severity. */
  SIGNIFICANT_CHANGE_C: z.coerce.number().int().positive().default(3),
  /**
   * Comma-separated browser origins allowed to call the API (only needed for the web version of the app,
   * for example https://markdanielle11.github.io). The iPhone app does not use CORS. Empty = no browser access.
   */
  CORS_ORIGINS: z.string().default(''),
  /** Set true when running behind a proxy (Render, Fly, Railway) so rate limiting sees client IPs. */
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  return parsed.data;
}
