import type { SupabaseClient } from '@supabase/supabase-js';
import type { Deal, DealAnalysis, Entitlements, FlightOffer, FlightSearchParams, HomeFeed, NotificationPreferences, PricePoint, RevalidationResult } from '@dealhunter/types';
import { DEFAULT_NOTIFICATION_PREFS, entitlementsForPlan, resolvePlan } from '@dealhunter/core';
import { ApiError, type AiExplanation, type DealHunterApi, type NotificationItem, type WatchItem } from './api';

/** Production implementation. Heavy logic runs in Edge Functions; user-owned rows go through RLS-protected tables. */
export class SupabaseApi implements DealHunterApi {
  constructor(private readonly sb: SupabaseClient) {}

  private async fn<T>(name: string, body?: unknown): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(name, { body: body as Record<string, unknown> | undefined });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 429) throw new ApiError('Too many requests. Please wait a moment.', 'RATE_LIMITED', 30);
      if (status === 401) throw new ApiError('Please sign in again.', 'UNAUTHENTICATED');
      if (status === 403) throw new ApiError('Not allowed.', 'FORBIDDEN');
      throw new ApiError(error.message || 'Network error', status ? 'SERVER' : 'NETWORK');
    }
    return data as T;
  }
  private async uid(): Promise<string> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new ApiError('Not signed in', 'UNAUTHENTICATED');
    return data.user.id;
  }

  searchFlights(params: FlightSearchParams) { return this.fn<Deal[]>('search-flights', params); }
  getHomeFeed() { return this.fn<HomeFeed>('home-feed'); }
  async getDeal(offerId: string) { return this.fn<Deal | null>('get-deal', { offerId }); }
  getPriceHistory(flightIdentity: string) { return this.fn<PricePoint[]>('price-history', { flightIdentity }); }
  revalidateOffer(offer: FlightOffer) { return this.fn<RevalidationResult>('revalidate-offer', { offer }); }
  explainDeal(offerId: string, analysis: DealAnalysis) { return this.fn<AiExplanation>('explain-deal', { offerId, analysis }); }

  async listWatchlist(): Promise<WatchItem[]> {
    const { data, error } = await this.sb.from('watchlists').select('*').order('created_at', { ascending: false });
    if (error) throw new ApiError(error.message, 'SERVER');
    return (data ?? []).map((r) => ({ id: r.id, origin: r.origin, destination: r.destination, departureDate: r.departure_date, cabin: r.cabin, targetPrice: r.target_price, flightIdentity: r.flight_identity, lastPrice: r.last_price, lastDecision: r.last_decision, createdAt: r.created_at }));
  }
  async addToWatchlist({ offer, targetPrice }: { offer: FlightOffer; targetPrice: number | null }): Promise<WatchItem> {
    const user_id = await this.uid();
    const { data, error } = await this.sb.from('watchlists').insert({
      user_id, origin: offer.origin, destination: offer.destination, departure_date: offer.departureAt.slice(0, 10), cabin: offer.cabin,
      target_price: targetPrice, flight_identity: offer.flightIdentity, last_price: offer.price.amount,
    }).select().single();
    // The DB trigger enforces the plan limit server-side (client checks are only UX).
    if (error) throw new ApiError(error.message, /limit/i.test(error.message) ? 'LIMIT_REACHED' : 'SERVER');
    return { id: data.id, origin: data.origin, destination: data.destination, departureDate: data.departure_date, cabin: data.cabin, targetPrice: data.target_price, flightIdentity: data.flight_identity, lastPrice: data.last_price, lastDecision: data.last_decision, createdAt: data.created_at };
  }
  async removeFromWatchlist(id: string) { const { error } = await this.sb.from('watchlists').delete().eq('id', id); if (error) throw new ApiError(error.message, 'SERVER'); }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const { data } = await this.sb.from('notification_preferences').select('*').maybeSingle();
    if (!data) return DEFAULT_NOTIFICATION_PREFS;
    return { enabledTypes: data.enabled_types, routes: data.routes, minScore: data.min_score, priceThreshold: data.price_threshold, quietHours: data.quiet_start_hour === null ? null : { startHour: data.quiet_start_hour, endHour: data.quiet_end_hour, utcOffsetMinutes: data.utc_offset_minutes } };
  }
  async saveNotificationPreferences(p: NotificationPreferences) {
    const user_id = await this.uid();
    const { error } = await this.sb.from('notification_preferences').upsert({ user_id, enabled_types: p.enabledTypes, routes: p.routes, min_score: p.minScore, price_threshold: p.priceThreshold, quiet_start_hour: p.quietHours?.startHour ?? null, quiet_end_hour: p.quietHours?.endHour ?? null, utc_offset_minutes: p.quietHours?.utcOffsetMinutes ?? 0 });
    if (error) throw new ApiError(error.message, 'SERVER');
  }
  async registerDevice({ pushToken, platform }: { pushToken: string; platform: 'ios' | 'android' }) {
    const user_id = await this.uid();
    const { error } = await this.sb.from('notification_devices').upsert({ user_id, push_token: pushToken, platform, enabled: true, last_seen: new Date().toISOString() }, { onConflict: 'push_token' });
    if (error) throw new ApiError(error.message, 'SERVER');
  }
  async unregisterDevice(pushToken: string) { await this.sb.from('notification_devices').delete().eq('push_token', pushToken); }
  async listNotifications(): Promise<NotificationItem[]> {
    const { data } = await this.sb.from('notification_history').select('*').order('created_at', { ascending: false }).limit(50);
    return (data ?? []).map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, dealId: r.deal_id, createdAt: r.created_at, readAt: r.read_at }));
  }

  async getEntitlements(): Promise<Entitlements> {
    const user_id = await this.uid();
    const [acc, ent] = await Promise.all([
      this.sb.from('user_access').select('plan').eq('user_id', user_id).maybeSingle(),
      this.sb.from('user_entitlements').select('premium_active, expires_at').eq('user_id', user_id).maybeSingle(),
    ]);
    return entitlementsForPlan(resolvePlan({ accessPlan: acc.data?.plan ?? null, premiumActive: !!ent.data?.premium_active, premiumExpiresAt: ent.data?.expires_at ?? null }));
  }
  async deleteAccount() { await this.fn('delete-account', { confirm: true }); await this.sb.auth.signOut(); }
}
