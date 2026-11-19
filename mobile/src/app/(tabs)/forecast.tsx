import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { HeatChart, HourlyStrip, LevelChip, LiveStatus, SourceBadge } from '@/components/heat';
import { Banner, Card, Notice, Screen, Segmented, Skeleton, StateMessage, T } from '@/components/primitives';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { api } from '@/lib/api';
import { dayLabel, fmtDate, fmtStamp, fmtTime } from '@/lib/format';
import { useAlerts } from '@/state/alerts';
import { space, useTheme } from '@/theme';

export default function Forecast() {
  const t = useTheme();
  const alerts = useAlerts();
  const now = useNow(60_000);
  // Live: forecast refetches every 5 minutes while open.
  const { data, error, loading, refreshing, refresh } = useResource(api.forecast, { intervalMs: 5 * 60_000 });
  const [dayIndex, setDayIndex] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);

  const day = data?.days[Math.min(dayIndex, (data?.days.length ?? 1) - 1)];
  const hours = useMemo(() => (data && day ? data.hours.filter((h) => h.time.slice(0, 10) === day.date) : []), [data, day]);
  const official = data && day ? data.official.find((o) => o.date === day.date) : undefined;
  const estimatePeak = useMemo(() => {
    if (hours.length === 0) return null;
    return hours.reduce((best, h) => (h.heatIndexC > best.heatIndexC ? h : best), hours[0]!);
  }, [hours]);

  return (
    <Screen title="Forecast" subtitle="Hourly heat index at CLSU" onRefresh={refresh} refreshing={refreshing}>
      {loading ? (
        <Card>
          <Skeleton height={38} />
          <Skeleton height={28} width="50%" />
          <Skeleton height={190} />
        </Card>
      ) : null}

      {!loading && !data && error ? (
        <StateMessage title={error.isNetwork ? 'No connection' : 'Forecast unavailable'} body={error.message} action={{ label: 'Try again', onPress: refresh }} />
      ) : null}

      {data && day ? (
        <>
          <View style={{ alignItems: 'flex-start' }}>
            <LiveStatus fetchedAt={data.source.fetchedAt} stale={data.source.stale || !!error} />
          </View>
          {error ? <Banner kind="offline">Cannot reach the server. Showing the last forecast received.</Banner> : null}

          <Segmented label="Forecast day" items={data.days.map((d, i) => ({ key: String(i), label: dayLabel(d.date, i) }))} value={String(dayIndex)} onChange={(k) => setDayIndex(Number(k))} />

          <Card>
            <T v="footnote" tone="secondary">
              {fmtDate(day.date)}
            </T>
            <T v="subhead" tone="secondary">
              Maximum predicted heat index
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
              <T v="hero" style={{ fontSize: 52, lineHeight: 56 }}>
                {day.peakHeatIndexC}°C
              </T>
              <LevelChip level={day.level} />
            </View>
            <SourceBadge kind={day.sourceKind} />
            <T v="subhead" tone="secondary">
              {day.sourceKind === 'official'
                ? `Official PAGASA forecast for ${official?.station ?? 'CLSU'}${official ? `, issued ${fmtStamp(official.issuedAt)}` : ''}.`
                : day.peakTime
                  ? `Highest value expected around ${fmtTime(day.peakTime)}.`
                  : ''}
            </T>
            {day.sourceKind === 'official' && estimatePeak ? (
              <Notice>
                The hourly values below are app estimates. Their highest value is {estimatePeak.heatIndexC}°C around {fmtTime(estimatePeak.time)}.
              </Notice>
            ) : null}
          </Card>

          <Card>
            <T v="headline">Heat index by hour</T>
            <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              <HeatChart hours={hours} thresholdC={alerts.settings.thresholdC} width={chartWidth} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ width: 18, borderTopWidth: 2, borderStyle: 'dashed', borderColor: t.levels.danger.solid }} />
              <T v="footnote" tone="secondary">
                Alert threshold, {alerts.settings.thresholdC}°C
              </T>
            </View>
          </Card>

          <Card>
            <T v="headline">Hour by hour</T>
            <HourlyStrip key={day.date} hours={hours} nowMs={now} />
            <T v="footnote" tone="secondary">
              Each bar shows the PAGASA category for that hour: Caution 27 to 32, Extreme Caution 33 to 41, Danger 42 to 51, Extreme Danger 52 and above. Hourly values are estimates calculated by this app.
            </T>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
