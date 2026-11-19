import { useFocusEffect, useRouter } from 'expo-router';
import { BellSimple, CheckCircle, WarningCircle, XCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SourceBadge } from '@/components/heat';
import { Banner, Card, Screen, Skeleton, StateMessage, T } from '@/components/primitives';
import { subscribeRefresh } from '@/lib/refreshBus';
import { fmtDate, fmtStamp, fmtTime } from '@/lib/format';
import type { AlertRecord } from '@/lib/types';
import { useAlerts } from '@/state/alerts';
import { radius, space, useTheme } from '@/theme';

const STATUS = {
  sent: { label: 'Sent', detail: 'Accepted by the push service' },
  delivered: { label: 'Delivered', detail: 'Accepted by Apple push service' },
  failed: { label: 'Not delivered', detail: 'The notification could not be delivered' },
} as const;

export default function Alerts() {
  const t = useTheme();
  const router = useRouter();
  const a = useAlerts();
  const [items, setItems] = useState<AlertRecord[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const load = useCallback(
    async (manual = false) => {
      if (busy.current || !a.registered) return;
      busy.current = true;
      if (manual) setRefreshing(true);
      try {
        setItems(await a.loadAlerts());
        setFailed(null);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : 'Could not load alert history.');
      } finally {
        busy.current = false;
        setRefreshing(false);
      }
    },
    [a],
  );

  // Live: reload when the tab is opened and whenever a new alert push arrives.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => subscribeRefresh(() => void load()), [load]);

  return (
    <Screen title="Alerts" subtitle="Heat warnings sent to this iPhone" onRefresh={() => void load(true)} refreshing={refreshing}>
      {!a.ready ? <Skeleton height={96} /> : null}

      {a.ready && !a.registered ? (
        <StateMessage
          icon={<BellSimple size={32} color={t.colors.textSecondary} />}
          title="No alerts yet"
          body="Turn on heat alerts in Settings. Warnings you receive will be listed here."
          action={{ label: 'Open Settings', onPress: () => router.navigate('/settings') }}
        />
      ) : null}

      {a.registered && failed && !items ? <StateMessage title="Could not load history" body={failed} action={{ label: 'Try again', onPress: () => void load(true) }} /> : null}
      {a.registered && failed && items ? <Banner kind="offline">Cannot reach the server. Showing the history loaded earlier.</Banner> : null}

      {a.registered && !items && !failed ? (
        <>
          <Skeleton height={110} />
          <Skeleton height={110} />
        </>
      ) : null}

      {items && items.length === 0 ? (
        <StateMessage
          icon={<BellSimple size={32} color={t.colors.textSecondary} />}
          title="No heat alerts yet"
          body={`You will get a warning when the forecast reaches ${a.settings.thresholdC}°C or higher. Each one will appear here.`}
        />
      ) : null}

      {items?.map((al) => <AlertCard key={al.id} alert={al} />)}
    </Screen>
  );
}

function AlertCard({ alert }: { alert: AlertRecord }) {
  const t = useTheme();
  const level = alert.severity === 'extreme' ? 'extreme_danger' : 'danger';
  const s = t.levels[level];
  const st = STATUS[alert.status];
  const StatusIcon = alert.status === 'failed' ? XCircle : alert.status === 'delivered' ? CheckCircle : WarningCircle;
  const statusColor = alert.status === 'failed' ? t.colors.critical : alert.status === 'delivered' ? t.levels.normal.solid : t.colors.textSecondary;
  const reason = alert.reason === 'escalated' ? 'Upgraded warning' : alert.reason === 'updated' ? 'Updated forecast' : alert.reason === 'official_confirmation' ? 'Confirmed by PAGASA' : null;

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: s.tint, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
          <T v="caption" color={s.onTint} style={{ fontWeight: '700' }}>
            {alert.severity === 'extreme' ? 'Extreme warning' : 'High warning'}
          </T>
        </View>
        <T v="metric">{alert.heatIndexC}°C</T>
      </View>
      <T v="headline">
        {fmtDate(alert.forecastDate)}
        {alert.peakTime ? `, around ${fmtTime(alert.peakTime)}` : ''}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SourceBadge kind={alert.sourceKind} />
        {reason ? (
          <T v="footnote" tone="secondary">
            {reason}
          </T>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs }} accessible accessibilityLabel={`${st.label}. ${st.detail}. ${fmtStamp(alert.createdAt)}`}>
        <StatusIcon size={18} weight="fill" color={statusColor} />
        <T v="footnote" tone="secondary" style={{ flex: 1 }}>
          {st.label}, {fmtStamp(alert.createdAt)}
        </T>
      </View>
    </Card>
  );
}
