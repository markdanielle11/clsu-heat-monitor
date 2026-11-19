import { z } from 'zod';
import { CLSU } from '../location.js';
import { computeHeatIndexRounded, heatLevel } from '../heat/heatIndex.js';
import { localToIso } from '../time.js';
import { conditionLabel } from './conditions.js';
import type { CurrentConditions, EstimatedSnapshot, HourPoint, WeatherProvider } from './types.js';

/**
 * ESTIMATED forecast source: Open-Meteo (open-meteo.com), a public numerical weather
 * prediction API. This is NOT PAGASA and its output must always be labelled as an
 * estimate. Temperature and relative humidity come from the model grid cell that
 * contains the CLSU coordinates; the heat index is calculated here.
 *
 * Free tier terms: non-commercial use. See https://open-meteo.com/en/license
 */
const responseSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    relative_humidity_2m: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
  }),
});

export interface OpenMeteoOptions {
  baseUrl: string;
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
}

export class OpenMeteoProvider implements WeatherProvider {
  constructor(private readonly opts: OpenMeteoOptions) {}

  async fetchEstimated(): Promise<EstimatedSnapshot> {
    const url = new URL(this.opts.baseUrl);
    url.searchParams.set('latitude', String(CLSU.latitude));
    url.searchParams.set('longitude', String(CLSU.longitude));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code');
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,weather_code');
    url.searchParams.set('timezone', CLSU.timezone);
    url.searchParams.set('forecast_days', '3');
    if (this.opts.apiKey) url.searchParams.set('apikey', this.opts.apiKey);

    const doFetch = this.opts.fetchImpl ?? fetch;
    const attempts = (this.opts.retries ?? 2) + 1;
    let lastError: unknown;

    for (let i = 0; i < attempts; i++) {
      try {
        const res = await doFetch(url, { signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000) });
        if (!res.ok) throw new Error(`Open-Meteo responded with HTTP ${res.status}`);
        return parseOpenMeteo(await res.json(), new Date());
      } catch (e) {
        lastError = e;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 750 * (i + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

export function parseOpenMeteo(json: unknown, fetchedAt: Date): EstimatedSnapshot {
  const data = responseSchema.parse(json);
  const h = data.hourly;

  const hours: HourPoint[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const time = h.time[i];
    const t = h.temperature_2m[i];
    const rh = h.relative_humidity_2m[i];
    const code = h.weather_code[i];
    // Skip hours the model could not provide; never invent values.
    if (time === undefined || t == null || rh == null || code == null) continue;
    const heatIndexC = computeHeatIndexRounded(t, rh);
    hours.push({
      time: localToIso(time),
      tempC: round1(t),
      humidity: Math.round(rh),
      heatIndexC,
      level: heatLevel(heatIndexC),
      weatherCode: code,
      condition: conditionLabel(code),
    });
  }
  if (hours.length === 0) throw new Error('Open-Meteo returned no usable hourly data');

  const c = data.current;
  const currentHi = computeHeatIndexRounded(c.temperature_2m, c.relative_humidity_2m);
  const current: CurrentConditions = {
    time: localToIso(c.time),
    tempC: round1(c.temperature_2m),
    humidity: Math.round(c.relative_humidity_2m),
    heatIndexC: currentHi,
    level: heatLevel(currentHi),
    weatherCode: c.weather_code,
    condition: conditionLabel(c.weather_code),
  };

  return {
    provider: 'Open-Meteo',
    model: 'best_match',
    fetchedAt: fetchedAt.toISOString(),
    current,
    hours,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
