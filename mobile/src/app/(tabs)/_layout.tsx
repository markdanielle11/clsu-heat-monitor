import { Tabs } from 'expo-router';
import { BellRinging, ChartLine, GearSix, Thermometer } from 'phosphor-react-native';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  const icon = (Icon: typeof Thermometer) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Icon size={26} color={String(color)} weight={focused ? 'fill' : 'regular'} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.textSecondary,
        tabBarStyle: { backgroundColor: t.colors.card, borderTopColor: t.colors.separator },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Now', tabBarIcon: icon(Thermometer) }} />
      <Tabs.Screen name="forecast" options={{ title: 'Forecast', tabBarIcon: icon(ChartLine) }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: icon(BellRinging) }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon(GearSix) }} />
    </Tabs>
  );
}
