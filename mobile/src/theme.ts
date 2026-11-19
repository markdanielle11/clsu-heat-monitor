import { useColorScheme } from 'react-native';
import type { HeatLevel } from './lib/types';

/**
 * Design tokens.
 *
 * Language: iOS grouped-list UI (Apple HIG), system font, flat cards, one accent colour.
 * Shape rule (applied everywhere): cards 20, controls (buttons, segments, steppers) 12, chips full pill.
 * Accent (blue) is used ONLY for interactive things. Heat severity has its own semantic scale
 * that follows the PAGASA categories, and is always paired with a text label.
 */
export const radius = { card: 20, control: 12, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export interface Palette {
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  separator: string;
  accent: string;
  onAccent: string;
  accentTint: string;
  critical: string;
  warnBg: string;
  warnText: string;
}

const light: Palette = {
  bg: '#F1F2F6',
  card: '#FBFBFC',
  cardAlt: '#EBEDF2',
  text: '#15171C',
  textSecondary: '#555B6B',
  textTertiary: '#5F6678',
  separator: '#DEE1E8',
  accent: '#0B63E5',
  onAccent: '#FFFFFF',
  accentTint: '#E3EDFD',
  critical: '#C4281C',
  warnBg: '#FFF1D6',
  warnText: '#6B4300',
};

const dark: Palette = {
  bg: '#0A0B0D',
  card: '#15171B',
  cardAlt: '#1F2227',
  text: '#EEF0F3',
  textSecondary: '#A3A9B5',
  textTertiary: '#8D94A3',
  separator: '#2A2D34',
  accent: '#5AA2FF',
  onAccent: '#08111F',
  accentTint: '#16283F',
  critical: '#FF8A80',
  warnBg: '#3A2C0E',
  warnText: '#FFD58A',
};

export interface LevelStyle {
  label: string;
  /** Fill for bars and markers (non-text, needs 3:1 against the card). */
  solid: string;
  /** Chip background. */
  tint: string;
  /** Chip text (needs 4.5:1 against tint). */
  onTint: string;
}

const levelsLight: Record<HeatLevel, LevelStyle> = {
  normal: { label: 'Normal', solid: '#1F8A70', tint: '#DDF3EC', onTint: '#0F5F4B' },
  caution: { label: 'Caution', solid: '#9C7400', tint: '#FFF3C4', onTint: '#654C00' },
  extreme_caution: { label: 'Extreme Caution', solid: '#C96A00', tint: '#FFE8CC', onTint: '#7A4100' },
  danger: { label: 'Danger', solid: '#D23A21', tint: '#FFE1DB', onTint: '#9C1F0B' },
  extreme_danger: { label: 'Extreme Danger', solid: '#9E1B3C', tint: '#F9DCE4', onTint: '#7E0F2C' },
};

const levelsDark: Record<HeatLevel, LevelStyle> = {
  normal: { label: 'Normal', solid: '#35B592', tint: '#16352C', onTint: '#7ADBBE' },
  caution: { label: 'Caution', solid: '#E3B100', tint: '#3A3110', onTint: '#FFD84D' },
  extreme_caution: { label: 'Extreme Caution', solid: '#F29A2E', tint: '#40280A', onTint: '#FFB45E' },
  danger: { label: 'Danger', solid: '#F0573D', tint: '#47190F', onTint: '#FF9A86' },
  extreme_danger: { label: 'Extreme Danger', solid: '#E04A72', tint: '#4A1222', onTint: '#FF8FA8' },
};

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
  levels: Record<HeatLevel, LevelStyle>;
}

export const themes: Record<'light' | 'dark', Theme> = {
  light: { scheme: 'light', colors: light, levels: levelsLight },
  dark: { scheme: 'dark', colors: dark, levels: levelsDark },
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? themes.dark : themes.light;
}

/** Text styles (iOS type scale). Numbers use tabular figures so values do not jitter. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.3 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  hero: { fontSize: 64, lineHeight: 68, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  metric: { fontSize: 28, lineHeight: 33, fontWeight: '700', fontVariant: ['tabular-nums'] },
} as const;
