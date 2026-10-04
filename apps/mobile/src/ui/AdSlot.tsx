import React from 'react';
import { View } from 'react-native';
import { shouldShowAds, type AdPlacement } from '@dealhunter/core';
import { useApp } from '../providers/AppProvider';
import { Small } from './kit';

/** Renders ONLY for FREE users (server-derived entitlement) and only when the provider is ready. Contextual, non-personalised. */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  const { entitlements, ads } = useApp();
  if (!shouldShowAds(entitlements) || !ads.isPlacementEnabled(placement)) return null;
  // Lazy require keeps the native ads module out of the render path for PREMIUM / MANAGED users.
  const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  const unit = (ads as unknown as { bannerUnitId?: () => string | null }).bannerUnitId?.();
  if (!unit) return null;
  return (
    <View accessibilityLabel="Advertisement" style={{ alignItems: 'center', gap: 2 }}>
      <Small>Advertisement</Small>
      <BannerAd unitId={unit} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
    </View>
  );
}
