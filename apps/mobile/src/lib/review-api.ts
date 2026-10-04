import type { DealHunterApi } from '@dealhunter/api-client';
import type { DemoApi } from '@dealhunter/api-client';

/**
 * Review-safe composition for accounts flagged `profiles.review_mode` (set server-side only):
 * market data (search / feed / deal / revalidate) comes from the deterministic demo dataset so App Review works with an empty backend;
 * user-owned data, entitlements, push registration and account deletion stay on the REAL backend.
 */
export function createReviewSafeApi(real: DealHunterApi, demo: DemoApi): DealHunterApi {
  return {
    searchFlights: (p) => demo.searchFlights(p),
    getHomeFeed: () => demo.getHomeFeed(),
    getDeal: (id) => demo.getDeal(id),
    getPriceHistory: (i) => demo.getPriceHistory(i),
    revalidateOffer: (o) => demo.revalidateOffer(o),
    explainDeal: (id, a) => demo.explainDeal(id, a),
    listWatchlist: () => real.listWatchlist(),
    addToWatchlist: (i) => real.addToWatchlist(i),
    removeFromWatchlist: (id) => real.removeFromWatchlist(id),
    getNotificationPreferences: () => real.getNotificationPreferences(),
    saveNotificationPreferences: (p) => real.saveNotificationPreferences(p),
    registerDevice: (i) => real.registerDevice(i),
    unregisterDevice: (t) => real.unregisterDevice(t),
    listNotifications: () => real.listNotifications(),
    getEntitlements: () => real.getEntitlements(),
    deleteAccount: () => real.deleteAccount(),
  };
}
