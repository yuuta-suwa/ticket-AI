import type { Deal, DealAnalysis, Entitlements, FlightOffer, HomeFeed, FlightSearchParams, NotificationPreferences, PricePoint, RevalidationResult } from '@dealhunter/types';
import { buildHomeFeed, canAddToWatchlist, DEFAULT_NOTIFICATION_PREFS, dealFor, entitlementsForPlan, MockFlightProvider, revalidateOffer } from '@dealhunter/core';
import { ApiError, type AiExplanation, type DealHunterApi, type NotificationItem, type WatchItem } from './api';


/**
 * Review-safe demo backend: runs the REAL engines on MockFlightProvider data, fully offline.
 * Used for (a) App Review when the backend is empty, (b) screenshots, (c) local dev, (d) tests.
 * It is only selected when the build is configured with EXPO_PUBLIC_DEMO_MODE=true or the
 * server-issued review account signs in; never exposed in the normal production UX.
 */
export class DemoApi implements DealHunterApi {
  private watch: WatchItem[] = [];
  private prefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFS };
  private devices = new Set<string>();
  private deleted = false;
  private readonly provider: MockFlightProvider;
  constructor(private readonly opts: { plan?: Entitlements['plan']; clock?: () => Date } = {}) {
    this.provider = new MockFlightProvider(opts.clock);
  }
  private now() { return this.opts.clock?.() ?? new Date(); }

  private toDeal(o: FlightOffer): Promise<Deal> {
    const now = this.now();
    return dealFor(o, (id) => this.provider.getHistory(id, now), now);
  }
  async searchFlights(p: FlightSearchParams): Promise<Deal[]> {
    const offers = await this.provider.searchFlights(p);
    return Promise.all(offers.map((o) => this.toDeal(o)));
  }
  getHomeFeed(): Promise<HomeFeed> {
    const now = this.now();
    return buildHomeFeed(this.provider, (id) => this.provider.getHistory(id, now), now);
  }
  async getDeal(offerId: string): Promise<Deal | null> {
    const o = await this.provider.getOffer(offerId.replace(/^mock:/, ''));
    return o ? this.toDeal(o) : null;
  }
  getPriceHistory(identity: string): Promise<PricePoint[]> { return this.provider.getHistory(identity, this.now()); }
  revalidateOffer(offer: FlightOffer): Promise<RevalidationResult> {
    const now = this.now();
    return revalidateOffer(this.provider, offer, async (f) => ({ history: await this.provider.getHistory(f.flightIdentity, now), now }), now);
  }
  async explainDeal(_id: string, a: DealAnalysis): Promise<AiExplanation> {
    return { cached: true, generatedAt: this.now().toISOString(), text: `Demo explanation: ${a.decision.decision} with ${Math.round(a.decision.confidence * 100)}% confidence. This is decision support, not a guarantee.` };
  }
  async listWatchlist() { return this.watch; }
  async addToWatchlist({ offer, targetPrice }: { offer: FlightOffer; targetPrice: number | null }): Promise<WatchItem> {
    const e = await this.getEntitlements();
    if (!canAddToWatchlist(e, this.watch.length)) throw new ApiError('Watchlist limit reached', 'LIMIT_REACHED');
    const item: WatchItem = { id: `w${this.watch.length + 1}-${offer.id}`, origin: offer.origin, destination: offer.destination, departureDate: offer.departureAt.slice(0, 10), cabin: offer.cabin, targetPrice, flightIdentity: offer.flightIdentity, lastPrice: offer.price.amount, lastDecision: null, createdAt: this.now().toISOString() };
    this.watch = [item, ...this.watch]; return item;
  }
  async removeFromWatchlist(id: string) { this.watch = this.watch.filter((w) => w.id !== id); }
  async getNotificationPreferences() { return this.prefs; }
  async saveNotificationPreferences(p: NotificationPreferences) { this.prefs = p; }
  async registerDevice({ pushToken }: { pushToken: string }) { this.devices.add(pushToken); }
  async unregisterDevice(t: string) { this.devices.delete(t); }
  async listNotifications(): Promise<NotificationItem[]> {
    return [{ id: 'n1', type: 'EXTREME_DEAL', title: 'EXTREME DEAL: NRT → HNL', body: 'Price is far below its usual range. Verify the latest price before booking.', dealId: null, createdAt: this.now().toISOString(), readAt: null }];
  }
  async getEntitlements(): Promise<Entitlements> { return entitlementsForPlan(this.opts.plan ?? 'FREE'); }
  async deleteAccount() { this.deleted = true; this.watch = []; this.devices.clear(); }
  get isDeleted() { return this.deleted; }
}
