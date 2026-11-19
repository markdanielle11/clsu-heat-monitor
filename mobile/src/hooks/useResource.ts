import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '@/lib/api';
import { subscribeRefresh } from '@/lib/refreshBus';

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  /** True only for the very first load (no data yet). */
  loading: boolean;
  /** True during a pull-to-refresh. */
  refreshing: boolean;
  /** Epoch ms of the last successful fetch. */
  updatedAt: number | null;
  refresh: () => Promise<void>;
}

interface State<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refreshing: boolean;
  updatedAt: number | null;
}

/**
 * Live data hook. It keeps data fresh without any user action:
 *  - polls every `intervalMs` while the screen is focused and the app is in the foreground
 *  - refetches when the screen gains focus and when the app returns to the foreground
 *  - refetches when something calls requestRefresh() (for example a push arrives)
 * A failed background refresh never wipes data that is already on screen.
 */
export function useResource<T>(load: () => Promise<T>, opts: { intervalMs?: number } = {}): Resource<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true, refreshing: false, updatedAt: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const inflight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (manual: boolean) => {
    if (inflight.current) return;
    inflight.current = true;
    if (manual && mounted.current) setState((s) => ({ ...s, refreshing: true }));
    try {
      const data = await loadRef.current();
      if (mounted.current) setState({ data, error: null, loading: false, refreshing: false, updatedAt: Date.now() });
    } catch (e) {
      const error = e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Something went wrong.');
      if (mounted.current) setState((s) => ({ ...s, error, loading: false, refreshing: false }));
    } finally {
      inflight.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run(false);
      if (!opts.intervalMs) return undefined;
      const id = setInterval(() => {
        if (AppState.currentState === 'active') void run(false);
      }, opts.intervalMs);
      return () => clearInterval(id);
    }, [run, opts.intervalMs]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run(false);
    });
    return () => sub.remove();
  }, [run]);

  useEffect(() => subscribeRefresh(() => void run(false)), [run]);

  const refresh = useCallback(() => run(true), [run]);
  return { ...state, refresh };
}
