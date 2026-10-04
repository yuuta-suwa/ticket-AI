import type { Entitlements } from '@dealhunter/types';

export type AdPlacement = 'HOME_FEED' | 'SEARCH_RESULTS';
export interface AdProvider {
  readonly name: string;
  initialize(opts: { nonPersonalized: boolean }): Promise<void>;
  isPlacementEnabled(p: AdPlacement): boolean;
}
/** Ads render only when the SERVER-derived entitlement says so. */
export const shouldShowAds = (e: Pick<Entitlements, 'adsEnabled'> | null | undefined): boolean => !!e && e.adsEnabled;
export class NoopAdProvider implements AdProvider {
  readonly name = 'noop';
  async initialize(): Promise<void> {}
  isPlacementEnabled(): boolean { return false; }
}
