import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

export type Permission = 'unknown' | 'undetermined' | 'granted' | 'denied' | 'unsupported';

/** Show heat alerts even while the app is open, so a live warning is never silently swallowed. */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Push only works in the installed iPhone app: not in the web version, not in a simulator. */
export const pushSupported = (): boolean => Platform.OS !== 'web' && Device.isDevice;

export async function readPermission(): Promise<Permission> {
  if (!pushSupported()) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.status === 'denied' ? 'denied' : 'undetermined';
}

/** Shows the iOS permission prompt (only the first time; afterwards iOS returns the saved answer). */
export async function askPermission(): Promise<Permission> {
  if (!pushSupported()) return 'unsupported';
  const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return p.granted ? 'granted' : 'denied';
}

export function easProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? undefined;
}

/** Expo push token for this install. APNs delivery is handled by Expo with the credentials EAS manages. */
export async function getPushToken(): Promise<string> {
  const projectId = easProjectId();
  if (!projectId) {
    throw new Error('This build has no EAS project ID. Run "eas init" in the mobile folder, then rebuild.');
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}
