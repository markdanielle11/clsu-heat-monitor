import { CLSU } from '../location.js';
import { heatLevel, type HeatLevel } from '../heat/heatIndex.js';
import { addDays, manilaDate } from '../time.js';
import type { EstimatedSnapshot, HourPoint, OfficialDaily } from '../weather/types.js';

export interface DaySummary {
  date: string;
  peakHeatIndexC: number;
  peakTime: string | null;
  level: HeatLevel;
  sourceKind: 'official' | 'estimated';
  /** Dominant daytime (06:00-18:00) condition from the weather model. */
  condition: string;
}

export const locationView = () => ({
  name: CLSU.name,
  shortName: CLSU.shortName,
  city: CLSU.city,
  latitude: CLSU.latitude,
  longitude: CLSU.longitude,
});

export function sourceView(snapshot: EstimatedSnapshot, now: Date, staleAfterMinutes: number) {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - new Date(snapshot.fetchedAt).getTime()) / 60_000));
  return {
    name: `${snapshot.provider} weather model forecast`,
    official: false as const,
    description: 'Temperature and humidity forecast for the CLSU coordinates. The heat index is calculated by this app, so it is an estimate and not a PAGASA value.',
    fetchedAt: snapshot.fetchedAt,
    ageMinutes,
    stale: ageMinutes > staleAfterMinutes,
  };
}

function dominantCondition(hours: HourPoint[]): string {
  const day = hours.filter((h) => {
    const hr = Number(h.time.slice(11, 13));
    return hr >= 6 && hr <= 18;
  });
  const pool = day.length > 0 ? day : hours;
  const counts = new Map<string, number>();
  for (const h of pool) counts.set(h.condition, (counts.get(h.condition) ?? 0) + 1);
  let best = pool[0]?.condition ?? 'Unknown';
  let n = 0;
  for (const [k, v] of counts) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

export function summarizeDay(date: string, hours: HourPoint[], official: OfficialDaily[]): DaySummary | null {
  const dayHours = hours.filter((h) => h.time.slice(0, 10) === date);
  if (dayHours.length === 0) return null;
  let peak = dayHours[0]!;
  for (const h of dayHours) if (h.heatIndexC > peak.heatIndexC) peak = h;
  const off = official.find((o) => o.date === date);
  const hi = off ? off.heatIndexC : peak.heatIndexC;
  return {
    date,
    peakHeatIndexC: hi,
    peakTime: off ? null : peak.time,
    level: heatLevel(hi),
    sourceKind: off ? 'official' : 'estimated',
    condition: dominantCondition(dayHours),
  };
}

export function dashboardView(snapshot: EstimatedSnapshot, official: OfficialDaily[], now: Date, staleAfterMinutes: number) {
  const today = manilaDate(now);
  const todayOfficial = official.find((o) => o.date === today) ?? null;
  const estimatedToday = summarizeDay(today, snapshot.hours, []);
  return {
    location: locationView(),
    current: { ...snapshot.current, sourceKind: 'estimated' as const },
    today: summarizeDay(today, snapshot.hours, official),
    /** The model's own estimate for today, kept separate so the app can show it next to an official value. */
    todayEstimate: estimatedToday,
    todayOfficial: todayOfficial && {
      heatIndexC: todayOfficial.heatIndexC,
      issuedAt: todayOfficial.issuedAt,
      station: todayOfficial.station,
      sourceUrl: todayOfficial.sourceUrl,
    },
    source: sourceView(snapshot, now, staleAfterMinutes),
    generatedAt: now.toISOString(),
  };
}

export function forecastView(snapshot: EstimatedSnapshot, official: OfficialDaily[], now: Date, staleAfterMinutes: number) {
  const today = manilaDate(now);
  const dates = [0, 1, 2].map((i) => addDays(today, i));
  return {
    location: locationView(),
    source: sourceView(snapshot, now, staleAfterMinutes),
    days: dates.map((d) => summarizeDay(d, snapshot.hours, official)).filter((d): d is DaySummary => d !== null),
    hours: snapshot.hours.filter((h) => dates.includes(h.time.slice(0, 10))),
    official,
    generatedAt: now.toISOString(),
  };
}

/** Plain-language description of where data comes from. Shown in Settings. */
export function infoView(defaultThresholdC: number) {
  return {
    location: locationView(),
    defaultThresholdC,
    thresholds: { default: defaultThresholdC, min: 35, max: 52, extreme: 52 },
    sources: [
      {
        kind: 'official',
        name: 'PAGASA (DOST) official heat index forecast',
        status:
          'PAGASA does not offer a public forecast API. Its heat index forecasts are published as bulletins and on iHeatMAP. Per Manila Bulletin (5 Jun 2026), PAGASA suspended daily heat index forecasts at the start of the rainy season and plans to resume them on 1 Mar 2027.',
        usage: 'When an official value for CLSU is loaded for a day, it replaces the estimate for that day and is labelled as official.',
      },
      {
        kind: 'estimated',
        name: 'Open-Meteo weather model forecast',
        status: 'Public numerical weather prediction data for the CLSU coordinates, refreshed about every 15 minutes.',
        usage: 'The app calculates the heat index from forecast temperature and humidity (NWS Rothfusz formula). This is an estimate, not an official PAGASA forecast, and may differ from PAGASA station values.',
      },
    ],
  };
}
