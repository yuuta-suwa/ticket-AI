import type {
  Deal, DealAnalysis, Entitlements, HomeFeed, FlightOffer, FlightSearchParams, NotificationPreferences, NotificationType, PricePoint, RevalidationResult,
} from '@dealhunter/types';

export type { HomeFeed };
export interface WatchItem { id: string; origin: string; destination: string; departureDate: string; cabin: string; targetPrice: number | null; flightIdentity: string | null; lastPrice: number | null; lastDecision: string | null; createdAt: string }
export interface NotificationItem { id: string; type: NotificationType; title: string; body: string; dealId: string | null; createdAt: string; readAt: string | null }
export interface AiExplanation { text: string; cached: boolean; generatedAt: string }
export class ApiError extends Error {
  constructor(message: string, readonly code: 'RATE_LIMITED' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'LIMIT_REACHED' | 'NETWORK' | 'SERVER', readonly retryAfterSeconds?: number) { super(message); this.name = 'ApiError'; }
}

/** App-facing API. Implemented by SupabaseApi (production) and DemoApi (review-safe local demo). */
export interface DealHunterApi {
  searchFlights(params: FlightSearchParams): Promise<Deal[]>;
  getHomeFeed(): Promise<HomeFeed>;
  getDeal(offerId: string): Promise<Deal | null>;
  getPriceHistory(flightIdentity: string): Promise<PricePoint[]>;
  revalidateOffer(offer: FlightOffer): Promise<RevalidationResult>;
  explainDeal(offerId: string, analysis: DealAnalysis): Promise<AiExplanation>;

  listWatchlist(): Promise<WatchItem[]>;
  addToWatchlist(input: { offer: FlightOffer; targetPrice: number | null }): Promise<WatchItem>;
  removeFromWatchlist(id: string): Promise<void>;

  getNotificationPreferences(): Promise<NotificationPreferences>;
  saveNotificationPreferences(p: NotificationPreferences): Promise<void>;
  registerDevice(input: { pushToken: string; platform: 'ios' | 'android' }): Promise<void>;
  unregisterDevice(pushToken: string): Promise<void>;
  listNotifications(): Promise<NotificationItem[]>;

  getEntitlements(): Promise<Entitlements>;
  deleteAccount(): Promise<void>;
}
