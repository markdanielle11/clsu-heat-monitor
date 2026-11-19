import type { HeatLevel } from '../heat/heatIndex.js';

/** Where a heat index number came from. Never mix these up in the UI or in notifications. */
export type SourceKind = 'official' | 'estimated';

export interface HourPoint {
  /** ISO instant with +08:00 offset, start of the hour. */
  time: string;
  tempC: number;
  humidity: number;
  /** Whole-degree heat index calculated by this app (estimate). */
  heatIndexC: number;
  level: HeatLevel;
  weatherCode: number;
  condition: string;
}

export interface CurrentConditions {
  time: string;
  tempC: number;
  humidity: number;
  heatIndexC: number;
  level: HeatLevel;
  weatherCode: number;
  condition: string;
}

/** An estimated forecast for the CLSU point, derived from numerical weather prediction. */
export interface EstimatedSnapshot {
  provider: string;
  model: string;
  fetchedAt: string;
  current: CurrentConditions;
  hours: HourPoint[];
}

/** One official PAGASA daily heat index forecast value for CLSU / Science City of Muñoz. */
export interface OfficialDaily {
  date: string;
  heatIndexC: number;
  issuedAt: string;
  station: string;
  sourceUrl: string | null;
}

export interface WeatherProvider {
  fetchEstimated(): Promise<EstimatedSnapshot>;
}
