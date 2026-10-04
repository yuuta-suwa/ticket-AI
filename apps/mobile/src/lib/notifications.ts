import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { ENV } from './env';
import { errors } from './log';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPushStatus(): Promise<PushStatus> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Permission is requested ONLY when the user opts in (never at launch). Returns the Expo push token or null. */
export async function enablePush(): Promise<{ status: PushStatus; token: string | null }> {
  if (!Device.isDevice) return { status: 'unsupported', token: null };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('deals', { name: 'Deal alerts', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { status: status === 'denied' ? 'denied' : 'undetermined', token: null };
  try {
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId || ENV.easProjectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return { status: 'granted', token: t.data };
  } catch (e) { errors.captureError(e, { area: 'push-token' }); return { status: 'granted', token: null }; }
}
