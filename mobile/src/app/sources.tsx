import { ArrowSquareOut } from 'phosphor-react-native';
import { Linking, ScrollView, View } from 'react-native';
import { SourceBadge } from '@/components/heat';
import { Card, Group, Row, Skeleton, StateMessage, T } from '@/components/primitives';
import { useResource } from '@/hooks/useResource';
import { api } from '@/lib/api';
import { space, useTheme } from '@/theme';

export default function Sources() {
  const t = useTheme();
  const { data, error, loading, refresh } = useResource(api.info);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.lg }} contentInsetAdjustmentBehavior="automatic">
      {loading ? <Skeleton height={160} /> : null}
      {!loading && !data && error ? <StateMessage title="Could not load" body={error.message} action={{ label: 'Try again', onPress: refresh }} /> : null}
      {data ? (
        <>
          <T v="subhead" tone="secondary">
            Monitored point: {data.location.latitude}, {data.location.longitude} (CLSU campus). The app never mixes the two sources below: every number is labelled with where it came from.
          </T>
          {data.sources.map((s) => (
            <Card key={s.kind}>
              <SourceBadge kind={s.kind} />
              <T v="headline">{s.name}</T>
              <T v="subhead" tone="secondary">
                {s.status}
              </T>
              <T v="subhead">{s.usage}</T>
            </Card>
          ))}
          <Group header="Links">
            <Row label="PAGASA iHeatMAP" detail="Official heat index monitoring" onPress={() => void Linking.openURL('https://iheatmap.pagasa.dost.gov.ph/')} right={<ArrowSquareOut size={18} color={t.colors.textSecondary} />} />
            <Row label="PAGASA website" onPress={() => void Linking.openURL('https://www.pagasa.dost.gov.ph/')} right={<ArrowSquareOut size={18} color={t.colors.textSecondary} />} />
            <Row label="Open-Meteo" detail="Weather data by Open-Meteo.com, licensed CC BY 4.0" onPress={() => void Linking.openURL('https://open-meteo.com/')} last right={<ArrowSquareOut size={18} color={t.colors.textSecondary} />} />
          </Group>
        </>
      ) : null}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
