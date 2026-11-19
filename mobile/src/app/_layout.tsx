import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureForegroundNotifications } from '@/lib/push';
import { requestRefresh } from '@/lib/refreshBus';
import { AlertsProvider } from '@/state/alerts';
import { AppearanceProvider } from '@/state/appearance';
import { useTheme } from '@/theme';

configureForegroundNotifications();

/** Reacts to push notifications. Rendered on native only (the web preview has no push support). */
function NotificationEvents() {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();

  // A push that arrives while the app is open means the forecast changed: refetch everything now.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => requestRefresh());
    return () => sub.remove();
  }, []);

  // Tapping a heat alert opens the forecast (and refetches so the numbers match the alert).
  useEffect(() => {
    if (!lastResponse) return;
    const data = lastResponse.notification.request.content.data as { type?: string } | undefined;
    if (data?.type === 'heat_alert') {
      requestRefresh();
      router.navigate('/forecast');
    }
  }, [lastResponse, router]);

  return null;
}

function Shell() {
  const t = useTheme();

  const header = {
    headerStyle: { backgroundColor: t.colors.bg },
    headerTintColor: t.colors.accent,
    headerTitleStyle: { color: t.colors.text },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: t.colors.bg },
  } as const;

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      {Platform.OS !== 'web' ? <NotificationEvents /> : null}
      <Stack screenOptions={header}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sources" options={{ title: 'Weather data sources', headerBackTitle: 'Settings' }} />
        <Stack.Screen name="about" options={{ title: 'About', headerBackTitle: 'Settings' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <AlertsProvider>
          <Shell />
        </AlertsProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
