import { Platform } from 'react-native';
import mobileAds, { AdsConsent, MaxAdContentRating } from 'react-native-google-mobile-ads';
import type { AdPlacement, AdProvider } from '@dealhunter/core';
import { ENV } from './env';
import { errors } from './log';

/** AdMob adapter. Phase 1: contextual / NON-personalised ads only (requestNonPersonalizedAdsOnly on every request). */
export class AdMobAdProvider implements AdProvider {
  readonly name = 'admob';
  private ready = false;
  async initialize(opts: { nonPersonalized: boolean }): Promise<void> {
    try {
      // UMP consent (required by Google for EEA/UK users even for non-personalised ads). No-op elsewhere.
      await AdsConsent.gatherConsent();
      const info = await AdsConsent.getConsentInfo();
      if (info.canRequestAds === false) return;
      await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.G, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false });
      await mobileAds().initialize();
      this.ready = true; void opts;
    } catch (e) { errors.captureError(e, { area: 'ads-init' }); }
  }
  isPlacementEnabled(_p: AdPlacement): boolean { return this.ready && this.bannerUnitId() !== null; }
  /** Production requires real unit IDs from env; test IDs are used only in development builds. */
  bannerUnitId(): string | null {
    if (__DEV__ || ENV.appEnv !== 'production') return 'ca-app-pub-3940256099942544/6300978111'; // Google's documented test banner unit
    const id = Platform.OS === 'ios' ? ENV.admobBannerIos : ENV.admobBannerAndroid;
    return id || null;
  }
}
