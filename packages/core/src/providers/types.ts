import type { FlightOffer, FlightSearchParams, PricePoint } from '@dealhunter/types';

/** Provider-specific code lives behind this port; domain logic never imports a concrete provider. */
export interface FlightProvider {
  readonly name: string;
  searchFlights(params: FlightSearchParams): Promise<FlightOffer[]>;
  getOffer(providerOfferId: string, hint?: FlightOffer): Promise<FlightOffer | null>;
  /** Re-quote the live price. Returns null when the offer is gone. */
  revalidateOffer(providerOfferId: string, hint?: FlightOffer): Promise<FlightOffer | null>;
  /** Raw provider payload → internal FlightOffer. */
  normalizeOffer(raw: unknown): FlightOffer;
}

/** Optional capability for providers/stores that can supply history (mock, or our own price_snapshots table). */
export interface PriceHistorySource { getHistory(flightIdentity: string, now?: Date): Promise<PricePoint[]> }
