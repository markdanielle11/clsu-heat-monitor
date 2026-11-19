import * as SecureStore from 'expo-secure-store';

/** Small key-value store. Every call is guarded: storage can be unavailable and the app must still work. */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    /* ignore: the value simply will not persist */
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  credentials: 'clsu.credentials.v1',
  appearance: 'clsu.appearance.v1',
  settings: 'clsu.settings.v1',
} as const;
