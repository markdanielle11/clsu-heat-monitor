import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { KEYS, readJson, writeJson } from '@/lib/storage';

export type AppearancePref = 'system' | 'light' | 'dark';

interface Ctx {
  pref: AppearancePref;
  setPref(p: AppearancePref): void;
}

const AppearanceContext = createContext<Ctx>({ pref: 'system', setPref: () => undefined });
export const useAppearance = (): Ctx => useContext(AppearanceContext);

const apply = (p: AppearancePref) => Appearance.setColorScheme(p === 'system' ? 'unspecified' : p);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<AppearancePref>('system');

  useEffect(() => {
    readJson<AppearancePref>(KEYS.appearance).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPrefState(saved);
        apply(saved);
      }
    });
  }, []);

  const setPref = useCallback((p: AppearancePref) => {
    setPrefState(p);
    apply(p);
    void writeJson(KEYS.appearance, p);
  }, []);

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
