// Shared domain types. No runtime dependencies.

export const DEAL_CATEGORIES = [
  'FLIGHT', 'HOTEL', 'EVENT', 'SPORT', 'THEME_PARK', 'TRANSPORT',
  'RENTAL_CAR', 'TRAVEL_PACKAGE', 'EC', 'OTHER',
] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];
/** Categories exposed in the Phase 1 UI. */
export const PHASE1_CATEGORIES: readonly DealCategory[] = ['FLIGHT'];

export type Decision = 'BUY' | 'WAIT' | 'WATCH';
export type DealLevel = 'EXTREME_DEAL' | 'GREAT_DEAL' | 'GOOD_DEAL' | 'NORMAL';
export type Plan = 'FREE' | 'PREMIUM' | 'MANAGED' | 'ADMIN' | 'SUPER_ADMIN';
export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type TripType = 'ONE_WAY' | 'ROUND_TRIP';
export type AvailabilityState = 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';

export type ReasonCode =
  | 'PRICE_NEAR_HISTORIC_LOW'
  | 'EXTREME_MEDIAN_DEVIATION'
  | 'RAPID_PRICE_DROP'
  | 'HIGH_PRICE_RISE_RISK'
  | 'LOW_ADDITIONAL_DOWNSIDE'
  | 'INVENTORY_RISK'
  | 'LOW_DATA_CONFIDENCE'
  | 'INSUFFICIENT_HISTORY';

export interface Money { amount: number; currency: string }

export interface FlightSearchParams {
  origin: string;            // IATA
  destination: string;       // IATA
  departureDate: string;     // YYYY-MM-DD
  returnDate?: string;
  tripType: TripType;
  passengers: number;
  cabin: CabinClass;
  currency: string;
  flexibleDates: boolean;
}

export interface FlightOffer {
  id: string;                // stable internal id: provider:providerOfferId
  provider: string;
  providerOfferId: string;
  /** Stable identity of the product (route + carrier + date + cabin) used to join price history. */
  flightIdentity: string;
  carrier: string;
  carrierName: string;
  flightNumbers: string[];
  origin: string;
  destination: string;
  departureAt: string;       // ISO
  arrivalAt: string;
  returnDepartureAt?: string;
  cabin: CabinClass;
  stops: number;
  durationMinutes: number;
  price: Money;
  capturedAt: string;
  expiresAt: string;
  availability: AvailabilityState;
  seatsLeft?: number;
  /** Where the user completes the purchase. Never a DEAL HUNTER AI checkout. */
  deepLink: string;
}

export interface PricePoint { capturedAt: string; price: number; provider?: string }

export interface AnomalyComponents {
  historicalPosition: number | null;
  medianDeviation: number | null;
  suddenDrop: number | null;
  comparableMarketGap: number | null;
  crossProviderValidation: number | null;
  seasonality: number | null;
}
export interface AnomalyResult {
  score: number;             // 0-100
  level: DealLevel;
  components: AnomalyComponents;
  referencePrice: number;    // median-based reference
  discountPct: number;       // 0-1 vs reference
  insufficientHistory: boolean;
}

export interface ForecastResult {
  downProbability: number;
  flatProbability: number;
  upProbability: number;
  disappearanceRisk: number;
  expectedDownAmount: number;
  expectedUpAmount: number;
  forecastLow: number;
  forecastMedian: number;
  forecastHigh: number;
  confidence: number;        // 0-1
  modelVersion: string;
  /** true when advanced fields were withheld server-side because the plan does not include Advanced Forecast */
  redacted?: boolean;
}

export interface DecisionResult {
  decision: Decision;
  buyScore: number;          // 0-100
  confidence: number;
  waitLoss: number;
  buyLoss: number;
  decisionMargin: number;
  reasons: ReasonCode[];
}

export interface DealAnalysis {
  offerId: string;
  analyzedAt: string;
  anomaly: AnomalyResult;
  forecast: ForecastResult;
  decision: DecisionResult;
}

export interface Deal { offer: FlightOffer; analysis: DealAnalysis }

export type RevalidationStatus = 'UNCHANGED' | 'PRICE_CHANGED' | 'UNAVAILABLE' | 'ERROR';
export interface RevalidationResult {
  status: RevalidationStatus;
  previousPrice: number;
  currentPrice: number | null;
  deltaPct: number | null;
  deal: Deal | null;
  canProceed: boolean;
  checkedAt: string;
  message: string;
}

export type NotificationType =
  | 'EXTREME_DEAL' | 'TARGET_PRICE' | 'BUY_SIGNAL' | 'PRICE_DROP' | 'WATCHLIST_CHANGE';

export interface NotificationPreferences {
  enabledTypes: NotificationType[];
  routes: string[];          // "NRT-HNL"; empty = all
  minScore: number;
  priceThreshold: number | null;
  quietHours: { startHour: number; endHour: number; utcOffsetMinutes: number } | null;
}

export interface Entitlements {
  plan: Plan;
  adsEnabled: boolean;
  subscriptionRequired: boolean;
  advancedForecast: boolean;
  instantAlerts: boolean;
  extremeDeals: boolean;
  detailedCharts: boolean;
  priorityMonitoring: boolean;
  watchlistLimit: number;    // Infinity is serialised as -1
  isAdmin: boolean;
}

export type MonitoringPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type OutcomeLabel = 'GOOD_DECISION' | 'BAD_DECISION' | 'NEUTRAL';
export const OUTCOME_HORIZONS_HOURS = [1, 6, 24, 72, 168] as const;

export interface HomeFeed {
  extremeDeals: Deal[];
  buyNow: Deal[];
  priceDrops: Deal[];
  recommendedRoutes: { origin: string; destination: string; fromPrice: number; currency: string }[];
  latest: Deal[];
  generatedAt: string;
}
