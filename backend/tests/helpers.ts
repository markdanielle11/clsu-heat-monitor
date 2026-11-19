import { heatLevel } from '../src/heat/heatIndex.js';
import { addDays, manilaDate } from '../src/time.js';
import type { EstimatedSnapshot, HourPoint } from '../src/weather/types.js';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Three days of hourly points starting at 00:00 Manila on the date of `now`.
 * Every hour is `baseHi`, except the 13:00 hour of each day, which is set from `peaks`.
 */
export function makeHours(now: Date, peaks: [number, number, number], baseHi = 33): HourPoint[] {
  const start = manilaDate(now);
  const hours: HourPoint[] = [];
  for (let d = 0; d < 3; d++) {
    const date = addDays(start, d);
    for (let h = 0; h < 24; h++) {
      const hi = h === 13 ? peaks[d]! : baseHi;
      hours.push({
        time: `${date}T${pad(h)}:00:00+08:00`,
        tempC: 30,
        humidity: 60,
        heatIndexC: hi,
        level: heatLevel(hi),
        weatherCode: 2,
        condition: 'Partly cloudy',
      });
    }
  }
  return hours;
}

export function makeSnapshot(now: Date, peaks: [number, number, number], fetchedAt: Date = now): EstimatedSnapshot {
  const hours = makeHours(now, peaks);
  const cur = hours.find((h) => new Date(h.time).getTime() + 3_600_000 > now.getTime())!;
  return {
    provider: 'Open-Meteo',
    model: 'best_match',
    fetchedAt: fetchedAt.toISOString(),
    current: { time: cur.time, tempC: cur.tempC, humidity: cur.humidity, heatIndexC: cur.heatIndexC, level: cur.level, weatherCode: 2, condition: 'Partly cloudy' },
    hours,
  };
}
