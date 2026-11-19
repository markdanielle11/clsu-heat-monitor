import { Calculator, SealCheck } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useNow, useReduceMotion } from '@/hooks/useNow';
import { fmtAge, fmtHour } from '@/lib/format';
import { chartRange, scalePosition } from '@/lib/levels';
import type { Hour, HeatLevel, SourceKind } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import { T } from './primitives';

/** Severity label. The text always carries the meaning; colour only reinforces it. */
export function LevelChip({ level }: { level: HeatLevel }) {
  const t = useTheme();
  const s = t.levels[level];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: s.tint, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
      <T v="caption" color={s.onTint} style={{ fontWeight: '700' }}>
        {s.label}
      </T>
    </View>
  );
}

/** Makes the difference between a PAGASA value and an app estimate impossible to miss. */
export function SourceBadge({ kind }: { kind: SourceKind }) {
  const t = useTheme();
  const official = kind === 'official';
  const Icon = official ? SealCheck : Calculator;
  const fg = official ? t.colors.accent : t.colors.textSecondary;
  return (
    <View
      accessibilityLabel={official ? 'Official PAGASA forecast' : 'Estimate calculated by this app, not an official PAGASA forecast'}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: official ? t.colors.accentTint : t.colors.cardAlt,
      }}
    >
      <Icon size={14} weight="bold" color={fg} />
      <T v="caption" color={fg} style={{ fontWeight: '600' }}>
        {official ? 'PAGASA official' : 'Estimate'}
      </T>
    </View>
  );
}

/** Four PAGASA bands with a marker at the current value. */
export function LevelScale({ heatIndexC }: { heatIndexC: number }) {
  const t = useTheme();
  const bands: HeatLevel[] = ['caution', 'extreme_caution', 'danger', 'extreme_danger'];
  const pos = scalePosition(heatIndexC);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 14, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {bands.map((b) => (
          <View key={b} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.levels[b].solid }} />
        ))}
      </View>
      <View style={{ position: 'absolute', left: `${pos * 100}%`, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: t.colors.card, borderWidth: 3, borderColor: t.colors.text }} />
    </View>
  );
}

/** "Live" state: shows when the data was last refreshed on the server and ticks without any user action. */
export function LiveStatus({ fetchedAt, stale }: { fetchedAt: string; stale: boolean }) {
  const t = useTheme();
  const now = useNow(20_000);
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const minutes = Math.max(0, (now - new Date(fetchedAt).getTime()) / 60_000);
  const live = !stale && minutes < 45;

  useEffect(() => {
    if (!live || reduce) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, reduce, pulse]);

  const color = live ? t.levels.normal.solid : t.colors.critical;
  return (
    <View accessibilityRole="text" accessibilityLabel={`${live ? 'Live' : 'Outdated'}. Updated ${fmtAge(minutes)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: pulse }} />
      <T v="footnote" tone="secondary">
        {live ? 'Live' : 'Outdated'}, updated {fmtAge(minutes)}
      </T>
    </View>
  );
}

// ------------------------------------------------------------------ chart
const Y_LABEL_W = 34;
const PAD = 6;

export function HeatChart({ hours, thresholdC, width }: { hours: Hour[]; thresholdC: number; width: number }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  if (hours.length < 2 || width <= 0) return null;

  // Plot (value - min) so the axis starts at the data, then label ticks back to real degrees.
  const { min, max, step } = chartRange(hours.map((h) => h.heatIndexC), thresholdC);
  const data = hours.map((h) => ({ value: h.heatIndexC - min }));
  const plotW = width - Y_LABEL_W;

  // Own x labels (the library truncates labels narrower than the point spacing).
  const ticks = hours
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => ['00', '06', '12', '18'].includes(h.time.slice(11, 13)));
  const inner = plotW - PAD * 2;

  return (
    <View accessible accessibilityLabel={`Line chart of hourly heat index from ${min} to ${max} degrees Celsius. A dashed line marks the ${thresholdC} degree alert threshold.`}>
      <LineChart
        data={data}
        width={plotW}
        height={170}
        adjustToWidth
        disableScroll
        initialSpacing={PAD}
        endSpacing={PAD}
        maxValue={max - min}
        noOfSections={4}
        stepValue={step}
        yAxisLabelWidth={Y_LABEL_W}
        formatYLabel={(label) => String(Math.round(Number(label) + min))}
        yAxisTextStyle={{ color: t.colors.textSecondary, fontSize: 11 }}
        hideAxesAndRules={false}
        yAxisColor="transparent"
        xAxisColor={t.colors.separator}
        rulesColor={t.colors.separator}
        rulesType="solid"
        color={t.colors.accent}
        thickness={3}
        curved
        hideDataPoints
        areaChart
        startFillColor={t.colors.accent}
        endFillColor={t.colors.accent}
        startOpacity={0.22}
        endOpacity={0.02}
        showReferenceLine1
        referenceLine1Position={thresholdC - min}
        referenceLine1Config={{ type: 'dashed', color: t.levels.danger.solid, thickness: 1.5, dashWidth: 6, dashGap: 5 }}
        isAnimated={!reduce}
        animationDuration={600}
        backgroundColor="transparent"
      />
      <View style={{ height: 18, marginLeft: Y_LABEL_W, width: plotW }}>
        {ticks.map(({ h, i }) => (
          <T key={h.time} v="caption" tone="secondary" style={{ position: 'absolute', width: 40, textAlign: 'center', left: PAD + (i / (hours.length - 1)) * inner - 20 }}>
            {fmtHour(h.time)}
          </T>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- hourly
export function HourlyStrip({ hours, nowMs }: { hours: Hour[]; nowMs: number }) {
  const t = useTheme();
  const TILE = 68;
  const GAP = 8;

  const currentIndex = hours.findIndex((h) => {
    const start = new Date(h.time).getTime();
    return nowMs >= start && nowMs < start + 3_600_000;
  });
  // Start scrolled so the current hour is in view (only matters for today). Remount per day via `key`.
  const [initialX] = useState(() => (currentIndex > 1 ? (currentIndex - 1) * (TILE + GAP) : 0));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: initialX, y: 0 }} contentContainerStyle={{ gap: GAP, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
      {hours.map((h, i) => {
        const s = t.levels[h.level];
        const isNow = i === currentIndex;
        return (
          <View
            key={h.time}
            accessible
            accessibilityLabel={`${fmtHour(h.time)}${isNow ? ', now' : ''}. Heat index ${h.heatIndexC} degrees, ${s.label}. Temperature ${Math.round(h.tempC)} degrees, humidity ${h.humidity} percent.`}
            style={{
              width: TILE,
              alignItems: 'center',
              gap: 6,
              paddingVertical: space.md,
              borderRadius: radius.control,
              backgroundColor: t.colors.cardAlt,
              borderWidth: 2,
              borderColor: isNow ? t.colors.accent : 'transparent',
            }}
          >
            <T v="caption" tone="secondary">
              {isNow ? 'Now' : fmtHour(h.time)}
            </T>
            <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
              {h.heatIndexC}°
            </T>
            <View style={{ width: 28, height: 5, borderRadius: 3, backgroundColor: s.solid }} />
            <T v="caption" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {Math.round(h.tempC)}° / {h.humidity}%
            </T>
          </View>
        );
      })}
    </ScrollView>
  );
}

