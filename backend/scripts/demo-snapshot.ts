/**
 * DEV ONLY. Injects a synthetic hot-day forecast so you can see the dashboard and test push alerts
 * without waiting for a real heat wave. It refuses to run when NODE_ENV=production.
 *
 *   npm run demo -- --tmax 37 --rhmin 55            # store the snapshot only
 *   npm run demo -- --tmax 37 --rhmin 55 --check    # also run the alert check and send real pushes
 *   npm run demo -- --official 44                   # also store an official PAGASA value for today (test data!)
 *
 * The next scheduled refresh replaces the synthetic data with the real forecast.
 * Official values you store here are TEST DATA: delete them with `DELETE FROM official_daily;`.
 */
import { loadConfig } from '../src/config.js';
import { createPool, migrate } from '../src/db/pool.js';
import { Repo } from '../src/db/repo.js';
import { computeHeatIndexRounded, heatLevel } from '../src/heat/heatIndex.js';
import { runForecastCheck } from '../src/jobs/checkRunner.js';
import { logger } from '../src/log.js';
import { ExpoPushSender } from '../src/push/sender.js';
import { TokenVault } from '../src/security.js';
import { addDays, localToIso, manilaDate } from '../src/time.js';
import { conditionLabel } from '../src/weather/conditions.js';
import type { EstimatedSnapshot, HourPoint, WeatherProvider } from '../src/weather/types.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run the demo script with NODE_ENV=production.');
  process.exit(1);
}

const args = process.argv.slice(2);
const num = (flag: string, fallback: number): number => {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
};
const tmax = num('--tmax', 36);
const tmin = num('--tmin', 25);
const rhmin = num('--rhmin', 55);
const rhmax = num('--rhmax', 90);
const official = args.includes('--official') ? num('--official', 44) : null;

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
await migrate(pool);
const repo = new Repo(pool, new TokenVault(config.TOKEN_SECRET));

const now = new Date();
const today = manilaDate(now);
const bell = (h: number) => Math.exp(-(((h - 14) / 4.5) ** 2));

const hours: HourPoint[] = [];
for (let d = 0; d < 3; d++) {
  const date = addDays(today, d);
  const dayBoost = d === 1 ? 1 : d === 2 ? -1.5 : 0; // tomorrow a bit hotter, day after cooler
  for (let h = 0; h < 24; h++) {
    const temp = tmin + (tmax + dayBoost - tmin) * bell(h);
    const rh = rhmax - (rhmax - rhmin) * bell(h);
    const code = h >= 6 && h <= 17 ? (h > 13 && h < 16 ? 2 : 1) : 0;
    const hi = computeHeatIndexRounded(temp, rh);
    hours.push({
      time: localToIso(`${date}T${String(h).padStart(2, '0')}:00`),
      tempC: Math.round(temp * 10) / 10,
      humidity: Math.round(rh),
      heatIndexC: hi,
      level: heatLevel(hi),
      weatherCode: code,
      condition: conditionLabel(code),
    });
  }
}
const cur = hours.find((h) => new Date(h.time).getTime() + 3_600_000 > now.getTime()) ?? hours[0]!;
const snapshot: EstimatedSnapshot = {
  provider: 'Open-Meteo',
  model: 'best_match',
  fetchedAt: now.toISOString(),
  current: { time: cur.time, tempC: cur.tempC, humidity: cur.humidity, heatIndexC: cur.heatIndexC, level: cur.level, weatherCode: cur.weatherCode, condition: cur.condition },
  hours,
};

await repo.saveSnapshot(snapshot);
console.log('Synthetic snapshot stored. Daily peaks:', [0, 1, 2].map((d) => Math.max(...hours.filter((h) => h.time.startsWith(addDays(today, d))).map((h) => h.heatIndexC))));

if (official !== null) {
  await repo.upsertOfficial({ date: today, heatIndexC: official, issuedAt: now.toISOString(), station: 'Science City of Muñoz', sourceUrl: null });
  console.log(`Stored TEST official value ${official}°C for ${today}.`);
}

if (args.includes('--check')) {
  const stub: WeatherProvider = { fetchEstimated: async () => snapshot };
  const summary = await runForecastCheck({ repo, weather: stub, sender: new ExpoPushSender(process.env.EXPO_ACCESS_TOKEN), config, log: logger });
  console.log('Alert check:', summary);
}
await pool.end();
