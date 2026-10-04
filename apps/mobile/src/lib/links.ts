import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { APP_IDENTITY } from '@dealhunter/config';

const base = APP_IDENTITY.siteUrl.replace(/\/$/, '');
export const LEGAL = { privacy: `${base}/privacy`, terms: `${base}/terms`, support: `${base}/support`, deletion: `${base}/account-deletion` };
export const openLegal = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
/** External purchase hand-off: opens the seller's site in the system browser. DEAL HUNTER AI never sells or issues tickets. */
export const openExternal = (url: string) => Linking.openURL(url);
export const openStoreSubscriptions = (managementUrl?: string | null) => Linking.openURL(managementUrl ?? 'https://apps.apple.com/account/subscriptions');
