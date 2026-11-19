import { useRouter } from 'expo-router';
import { BellRinging, BellSlash, CloudSun, Drop, Lock, Thermometer } from 'phosphor-react-native';
import { View } from 'react-native';
import { Banner, Button, Card, Notice, Screen, Skeleton, StateMessage, T } from '@/components/primitives';
import { LevelChip, LevelScale, LiveStatus, SourceBadge } from '@/components/heat';
import { useResource } from '@/hooks/useResource';
import { api } from '@/lib/api';
import { fmtAge, fmtStamp, fmtTime } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { useAlerts } from '@/state/alerts';
import { radius, space, useTheme } from '@/theme';

export default function Now() {
  const t = useTheme();
  const router = useRouter();
  const now = useNow(30_000);
  // Live: refetches every minute while open, on return to the app, and when a push arrives.
  const { data, error, loading, refreshing, refresh } = useResource(api.dashboard, { intervalMs: 60_000 });

  const ageMin = data ? Math.max(0, (now - new Date(data.source.fetchedAt).getTime()) / 60_000) : 0;

  return (
    <Screen title="Heat Index" subtitle="Central Luzon State University" onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }} accessible accessibilityLabel="Monitoring location is fixed to CLSU, Muñoz">
          <Lock size={14} weight="bold" color={t.colors.textSecondary} />
          <T v="footnote" tone="secondary">
            CLSU, Muñoz (fixed)
          </T>
        </View>
        {data ? <LiveStatus fetchedAt={data.source.fetchedAt} stale={data.source.stale || !!error} /> : null}
      </View>

      {error && data ? <Banner kind="offline">Cannot reach the server. Showing the last data received {fmtAge(ageMin)}.</Banner> : null}
      {data?.source.stale && !error ? <Banner kind="warn">The weather forecast has not refreshed in a while, so these numbers may be out of date.</Banner> : null}

      {loading ? <DashboardSkeleton /> : null}

      {!loading && !data && error ? (
        <StateMessage title={error.isNetwork ? 'No connection' : 'Heat data unavailable'} body={error.message} action={{ label: 'Try again', onPress: refresh }} />
      ) : null}

      {data ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="subhead" tone="secondary">
                Heat index right now
              </T>
              <SourceBadge kind="estimated" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }} accessible accessibilityLabel={`Heat index ${data.current.heatIndexC} degrees Celsius, ${t.levels[data.current.level].label}`}>
              <T v="hero">{data.current.heatIndexC}</T>
              <T v="title" tone="secondary" style={{ marginBottom: 8 }}>
                °C
              </T>
            </View>
            <LevelChip level={data.current.level} />
            <LevelScale heatIndexC={data.current.heatIndexC} />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              <Stat icon={<Thermometer size={18} color={t.colors.textSecondary} />} label="Temperature" value={`${Math.round(data.current.tempC)}°C`} />
              <Stat icon={<Drop size={18} color={t.colors.textSecondary} />} label="Humidity" value={`${data.current.humidity}%`} />
              <Stat icon={<CloudSun size={18} color={t.colors.textSecondary} />} label="Sky" value={data.current.condition} small />
            </View>
          </Card>

          <Card>
            <T v="headline">Today's highest forecast</T>
            {data.todayOfficial ? (
              <PeakRow
                badge={<SourceBadge kind="official" />}
                value={data.todayOfficial.heatIndexC}
                level={levelOf(data.todayOfficial.heatIndexC)}
                detail={`${data.todayOfficial.station}, issued ${fmtStamp(data.todayOfficial.issuedAt)}`}
              />
            ) : null}
            {data.todayEstimate ? (
              <PeakRow
                badge={<SourceBadge kind="estimated" />}
                value={data.todayEstimate.peakHeatIndexC}
                level={data.todayEstimate.level}
                detail={data.todayEstimate.peakTime ? `Expected around ${fmtTime(data.todayEstimate.peakTime)}` : undefined}
              />
            ) : null}
            {!data.todayOfficial ? <Notice>No official PAGASA heat index forecast is loaded for CLSU today. The value above is calculated by this app.</Notice> : null}
            {data.today ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs }}>
                <CloudSun size={18} color={t.colors.textSecondary} />
                <T v="subhead" tone="secondary">
                  Today's weather: {data.today.condition}
                </T>
              </View>
            ) : null}
          </Card>

          <AlertStatus onEnable={() => router.navigate('/settings')} />

          <Card>
            <T v="headline">Data source</T>
            <T v="subhead" tone="secondary">
              {data.source.name}. {data.source.description}
            </T>
            <T v="footnote" tone="secondary">
              Last update {fmtStamp(data.source.fetchedAt)} ({fmtAge(ageMin)})
            </T>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function levelOf(hi: number) {
  return hi >= 52 ? 'extreme_danger' : hi >= 42 ? 'danger' : hi >= 33 ? 'extreme_caution' : hi >= 27 ? 'caution' : 'normal';
}

function Stat({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.cardAlt, borderRadius: radius.control, padding: space.md, gap: 4 }} accessible accessibilityLabel={`${label} ${value}`}>
      {icon}
      <T v={small ? 'subhead' : 'headline'} numberOfLines={2} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      <T v="caption" tone="secondary">
        {label}
      </T>
    </View>
  );
}

function PeakRow({ badge, value, level, detail }: { badge: React.ReactNode; value: number; level: ReturnType<typeof levelOf>; detail?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      {badge}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <T v="metric">{value}°C</T>
        <LevelChip level={level} />
      </View>
      {detail ? (
        <T v="footnote" tone="secondary">
          {detail}
        </T>
      ) : null}
    </View>
  );
}

function AlertStatus({ onEnable }: { onEnable: () => void }) {
  const t = useTheme();
  const a = useAlerts();
  if (!a.ready) return null;
  if (a.active) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <BellRinging size={24} weight="fill" color={t.colors.accent} />
          <View style={{ flex: 1 }}>
            <T v="headline">Heat alerts are on</T>
            <T v="subhead" tone="secondary">
              You will be notified when the forecast reaches {a.settings.thresholdC}°C or higher, even when the app is closed.
            </T>
          </View>
        </View>
      </Card>
    );
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <BellSlash size={24} color={t.colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <T v="headline">Heat alerts are off</T>
          <T v="subhead" tone="secondary">
            Turn them on to get a push notification when the heat index is forecast to reach 42°C or higher.
          </T>
        </View>
      </View>
      <Button label="Set up alerts" onPress={onEnable} variant="tinted" />
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <Card>
        <Skeleton width="40%" />
        <Skeleton height={64} width="45%" />
        <Skeleton height={24} width="35%" />
        <Skeleton height={14} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Skeleton height={84} style={{ flex: 1 }} />
          <Skeleton height={84} style={{ flex: 1 }} />
          <Skeleton height={84} style={{ flex: 1 }} />
        </View>
      </Card>
      <Card>
        <Skeleton width="55%" />
        <Skeleton height={34} width="40%" />
        <Skeleton width="70%" />
      </Card>
    </>
  );
}
