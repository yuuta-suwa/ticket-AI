import { describe, expect, it } from 'vitest';
import { ApiError, DemoApi } from '../src';

const params = { origin: 'NRT', destination: 'HNL', departureDate: '2026-08-15', tripType: 'ONE_WAY' as const, passengers: 1, cabin: 'ECONOMY' as const, currency: 'USD', flexibleDates: false };
const clock = () => new Date('2026-06-01T00:00:00Z');

describe('DemoApi (review-safe backend)', () => {
  it('search → deal → revalidate flow works offline', async () => {
    const api = new DemoApi({ clock });
    const deals = await api.searchFlights(params);
    expect(deals.length).toBeGreaterThan(0);
    const d = await api.getDeal(deals[0]!.offer.id);
    expect(d?.analysis.decision.decision).toBeDefined();
    const r = await api.revalidateOffer(deals[0]!.offer);
    expect(r.canProceed).toBe(true);
  });
  it('home feed is populated so review works with an empty backend', async () => {
    const f = await new DemoApi({ clock }).getHomeFeed();
    expect(f.latest.length).toBeGreaterThan(0); expect(f.recommendedRoutes.length).toBeGreaterThan(0);
  });
  it('FREE watchlist limit is enforced; PREMIUM/MANAGED have more', async () => {
    const free = new DemoApi({ clock });
    const deals = await free.searchFlights(params);
    for (let i = 0; i < 3; i++) await free.addToWatchlist({ offer: deals[i]!.offer, targetPrice: null });
    await expect(free.addToWatchlist({ offer: deals[3]!.offer, targetPrice: null })).rejects.toBeInstanceOf(ApiError);
    const managed = new DemoApi({ clock, plan: 'MANAGED' });
    for (let i = 0; i < 4; i++) await managed.addToWatchlist({ offer: deals[i % 4]!.offer, targetPrice: null });
    expect((await managed.listWatchlist()).length).toBe(4);
  });
  it('delete account clears personal data', async () => {
    const api = new DemoApi({ clock }); const deals = await api.searchFlights(params);
    await api.addToWatchlist({ offer: deals[0]!.offer, targetPrice: 100 }); await api.registerDevice({ pushToken: 't', platform: 'ios' });
    await api.deleteAccount(); expect(api.isDeleted).toBe(true); expect(await api.listWatchlist()).toEqual([]);
  });
});
