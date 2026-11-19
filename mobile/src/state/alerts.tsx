import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { askPermission, getPushToken, readPermission, type Permission } from '@/lib/push';
import { KEYS, readJson, remove, writeJson } from '@/lib/storage';
import type { AlertRecord, DeviceSettings } from '@/lib/types';

interface Credentials {
  deviceId: string;
  deviceKey: string;
  token: string;
}

const DEFAULTS: DeviceSettings = { notificationsEnabled: false, thresholdC: 42, notifyHigh: true, notifyExtreme: true };

export interface AlertsContextValue {
  ready: boolean;
  permission: Permission;
  registered: boolean;
  /** Alerts are on for this device (registered, permission granted, switch enabled). */
  active: boolean;
  settings: DeviceSettings;
  busy: boolean;
  error: string | null;
  clearError(): void;
  enable(): Promise<void>;
  update(patch: Partial<DeviceSettings>): Promise<void>;
  sendTest(): Promise<boolean>;
  loadAlerts(): Promise<AlertRecord[]>;
  openSystemSettings(): void;
}

const Ctx = createContext<AlertsContextValue | null>(null);

export function useAlerts(): AlertsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAlerts must be used inside AlertsProvider');
  return v;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.');

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<Permission>('unknown');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs hold the latest values for async flows that outlive a render.
  const credsRef = useRef<Credentials | null>(null);
  const settingsRef = useRef<DeviceSettings>(DEFAULTS);
  credsRef.current = creds;
  settingsRef.current = settings;

  const saveCreds = useCallback(async (c: Credentials | null) => {
    credsRef.current = c;
    setCreds(c);
    if (c) await writeJson(KEYS.credentials, c);
    else await remove(KEYS.credentials);
  }, []);

  const saveSettings = useCallback((s: DeviceSettings) => {
    settingsRef.current = s;
    setSettings(s);
    void writeJson(KEYS.settings, s);
  }, []);

  /** Make sure this install is registered with the backend under its current push token. */
  const ensureRegistered = useCallback(async (): Promise<Credentials> => {
    const token = await getPushToken();
    const current = credsRef.current;
    if (current && current.token === token) return current;

    const res = await api.register(token);
    const next: Credentials = { deviceId: res.deviceId, deviceKey: res.deviceKey, token };
    await saveCreds(next);

    // A re-registration (new token or rotated key) must not reset what the user chose.
    const wanted = settingsRef.current;
    if (current && wanted.notificationsEnabled) {
      const patched = await api.patchSettings(`${next.deviceId}.${next.deviceKey}`, wanted);
      saveSettings(patched.settings);
    } else {
      saveSettings(res.settings);
    }
    return next;
  }, [saveCreds, saveSettings]);

  /** Run an authenticated call; if credentials were rejected, re-register once and retry. */
  const authed = useCallback(
    async <T,>(call: (auth: string) => Promise<T>): Promise<T> => {
      let c = credsRef.current ?? (await ensureRegistered());
      try {
        return await call(`${c.deviceId}.${c.deviceKey}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await saveCreds(null);
          c = await ensureRegistered();
          return call(`${c.deviceId}.${c.deviceKey}`);
        }
        throw e;
      }
    },
    [ensureRegistered, saveCreds],
  );

  // Startup: restore saved state, then quietly re-sync with the server.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [savedCreds, savedSettings, perm] = await Promise.all([
        readJson<Credentials>(KEYS.credentials),
        readJson<DeviceSettings>(KEYS.settings),
        readPermission().catch(() => 'unknown' as Permission),
      ]);
      if (!alive) return;
      if (savedSettings) saveSettings({ ...DEFAULTS, ...savedSettings });
      if (savedCreds) {
        credsRef.current = savedCreds;
        setCreds(savedCreds);
      }
      setPermission(perm);
      setReady(true);

      if (perm === 'granted') {
        try {
          const c = await ensureRegistered(); // also refreshes a changed push token
          const me = await api.getSettings(`${c.deviceId}.${c.deviceKey}`);
          if (alive) saveSettings(me.settings);
        } catch {
          /* offline at launch: saved settings stay in use */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensureRegistered, saveSettings]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let perm = await readPermission();
      if (perm === 'undetermined') perm = await askPermission();
      setPermission(perm);
      if (perm === 'unsupported') {
        setError('Push notifications need a real iPhone. They are not available in a simulator.');
        return;
      }
      if (perm !== 'granted') {
        setError('Notifications are turned off for this app in iPhone Settings.');
        return;
      }
      const c = await ensureRegistered();
      const res = await api.patchSettings(`${c.deviceId}.${c.deviceKey}`, { notificationsEnabled: true });
      saveSettings(res.settings);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, [ensureRegistered, saveSettings]);

  const update = useCallback(
    async (patch: Partial<DeviceSettings>) => {
      const before = settingsRef.current;
      saveSettings({ ...before, ...patch }); // optimistic
      setError(null);
      try {
        const res = await authed((auth) => api.patchSettings(auth, patch));
        saveSettings(res.settings);
      } catch (e) {
        saveSettings(before);
        setError(messageOf(e));
      }
    },
    [authed, saveSettings],
  );

  const sendTest = useCallback(async () => {
    setError(null);
    try {
      await authed((auth) => api.testNotification(auth));
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    }
  }, [authed]);

  const loadAlerts = useCallback(async () => {
    const res = await authed((auth) => api.alerts(auth));
    return res.alerts;
  }, [authed]);

  const value = useMemo<AlertsContextValue>(
    () => ({
      ready,
      permission,
      registered: creds !== null,
      active: creds !== null && permission === 'granted' && settings.notificationsEnabled,
      settings,
      busy,
      error,
      clearError: () => setError(null),
      enable,
      update,
      sendTest,
      loadAlerts,
      openSystemSettings: () => void Linking.openSettings(),
    }),
    [ready, permission, creds, settings, busy, error, enable, update, sendTest, loadAlerts],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
