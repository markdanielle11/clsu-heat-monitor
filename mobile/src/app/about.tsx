import Constants from 'expo-constants';
import { ScrollView } from 'react-native';
import { Card, T } from '@/components/primitives';
import { space, useTheme } from '@/theme';

export default function About() {
  const t = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.lg }} contentInsetAdjustmentBehavior="automatic">
      <Card>
        <T v="title">CLSU Heat Monitor</T>
        <T v="footnote" tone="secondary">
          Version {version}
        </T>
        <T v="body">
          Watches the forecast heat index for Central Luzon State University in Science City of Muñoz, Nueva Ecija, and sends a push notification to this iPhone when it reaches 42°C or higher.
        </T>
      </Card>
      <Card>
        <T v="headline">How alerts work</T>
        <T v="subhead" tone="secondary">
          A server, not your phone, checks the forecast every 15 minutes. That is why alerts arrive even when the app is closed. A high warning is sent from 42°C and an extreme warning from 52°C. You get one notification per day and severity, plus an update if the forecast rises sharply.
        </T>
      </Card>
      <Card>
        <T v="headline">Please note</T>
        <T v="subhead" tone="secondary">
          This is an independent project. It is not an official PAGASA, DOST or CLSU application. Values marked Estimate are calculated by the app from a weather model and are not PAGASA forecasts. For official guidance, follow PAGASA and university advisories.
        </T>
      </Card>
    </ScrollView>
  );
}
