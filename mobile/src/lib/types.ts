/** Mirrors the backend responses in backend/src/api/views.ts. */
export type HeatLevel = 'normal' | 'caution' | 'extreme_caution' | 'danger' | 'extreme_danger';
export type SourceKind = 'official' | 'estimated';
export type AlertSeverity = 'high' | 'extreme';

export interface Location {
  name: string;
  shortName: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface SourceInfo {
  name: string;
  official: false;
  description: string;
  fetchedAt: string;
  ageMinutes: number;
  stale: boolean;
}

export interface Current {
  time: string;
  tempC: number;
  humidity: number;
  heatIndexC: number;
  level: HeatLevel;
  condition: string;
  sourceKind: 'estimated';
}

export interface DaySummary {
  date: string;
  peakHeatIndexC: number;
  peakTime: string | null;
  level: HeatLevel;
  sourceKind: SourceKind;
  condition: string;
}

export interface OfficialToday {
  heatIndexC: number;
  issuedAt: string;
  station: string;
  sourceUrl: string | null;
}

export interface Dashboard {
  location: Location;
  current: Current;
  today: DaySummary | null;
  todayEstimate: DaySummary | null;
  todayOfficial: OfficialToday | null;
  source: SourceInfo;
  generatedAt: string;
}

export interface Hour {
  time: string;
  tempC: number;
  humidity: number;
  heatIndexC: number;
  level: HeatLevel;
  condition: string;
}

export interface OfficialDaily {
  date: string;
  heatIndexC: number;
  issuedAt: string;
  station: string;
  sourceUrl: string | null;
}

export interface Forecast {
  location: Location;
  source: SourceInfo;
  days: DaySummary[];
  hours: Hour[];
  official: OfficialDaily[];
  generatedAt: string;
}

export interface DeviceSettings {
  notificationsEnabled: boolean;
  thresholdC: number;
  notifyHigh: boolean;
  notifyExtreme: boolean;
}

export interface AlertRecord {
  id: number;
  forecastDate: string;
  severity: AlertSeverity;
  heatIndexC: number;
  peakTime: string | null;
  sourceKind: SourceKind;
  reason: string;
  title: string;
  body: string;
  status: 'sent' | 'delivered' | 'failed';
  error: string | null;
  createdAt: string;
}

export interface Info {
  location: Location;
  defaultThresholdC: number;
  thresholds: { default: number; min: number; max: number; extreme: number };
  sources: { kind: SourceKind; name: string; status: string; usage: string }[];
}
