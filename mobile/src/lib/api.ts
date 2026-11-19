import type { AlertRecord, Dashboard, DeviceSettings, Forecast, Info } from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** "<deviceId>.<deviceKey>" */
  auth?: string;
  timeoutMs?: number;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, 'NO_API_URL', 'The app is not connected to a server. Set EXPO_PUBLIC_API_URL and rebuild.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.auth ? { Authorization: `Bearer ${opts.auth}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    if (!res.ok) {
      throw new ApiError(res.status, json?.error?.code ?? 'HTTP_ERROR', json?.error?.message ?? `Request failed (${res.status}).`);
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  dashboard: () => request<Dashboard>('/api/dashboard'),
  forecast: () => request<Forecast>('/api/forecast'),
  info: () => request<Info>('/api/info'),

  register: (expoPushToken: string) =>
    request<{ deviceId: string; deviceKey: string; settings: DeviceSettings }>('/api/devices/register', {
      method: 'POST',
      body: { expoPushToken, platform: 'ios' },
    }),
  getSettings: (auth: string) => request<{ settings: DeviceSettings }>('/api/devices/me', { auth }),
  patchSettings: (auth: string, patch: Partial<DeviceSettings>) =>
    request<{ settings: DeviceSettings }>('/api/devices/me', { method: 'PATCH', auth, body: patch }),
  alerts: (auth: string) => request<{ alerts: AlertRecord[] }>('/api/alerts?limit=50', { auth }),
  testNotification: (auth: string) => request<{ sent: true }>('/api/devices/me/test-notification', { method: 'POST', auth }),
};
