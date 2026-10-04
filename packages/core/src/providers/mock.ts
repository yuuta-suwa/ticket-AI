import type { CabinClass, FlightOffer, FlightSearchParams, PricePoint } from '@dealhunter/types';
import type { FlightProvider, PriceHistorySource } from './types';

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const MOCK_CARRIERS = [
  { code: 'XA', name: 'Example Air' }, { code: 'XB', name: 'Sample Airways' }, { code: 'XC', name: 'Demo Pacific' }, { code: 'XD', name: 'Placeholder Jet' },
] as const; // fictional carriers: no real airline marks are used

const CABIN_MULT: Record<CabinClass, number> = { ECONOMY: 1, PREMIUM_ECONOMY: 1.6, BUSINESS: 3.2, FIRST: 5 };
const dayMs = 86_400_000;

export class MockFlightProvider implements FlightProvider, PriceHistorySource {
  readonly name = 'mock';
  constructor(private readonly clock: () => Date = () => new Date()) {}

  private base(o: string, d: string, cabin: CabinClass): number {
    return (180 + (hash(`${o}${d}`) % 900)) * CABIN_MULT[cabin];
  }
  private identity(o: string, d: string, carrier: string, date: string, cabin: CabinClass) { return `${o}-${d}:${carrier}:${date}:${cabin}`; }

  /** Deterministic ~120 point history for an identity; ends at `now`. A small share of series end in a sharp drop. */
  async getHistory(identity: string, now: Date = this.clock()): Promise<PricePoint[]> {
    const [route = 'AAA-BBB', , , cabin = 'ECONOMY'] = identity.split(':');
    const [o = 'AAA', d = 'BBB'] = route.split('-');
    const base = this.base(o, d, cabin as CabinClass);
    const r = rng(hash(identity));
    const n = 120; const pts: PricePoint[] = []; let p = base;
    for (let i = 0; i < n; i++) {
      p = Math.max(base * 0.5, p + (base - p) * 0.08 + (r() - 0.5) * base * 0.08);
      pts.push({ capturedAt: new Date(now.getTime() - (n - i) * 0.25 * dayMs).toISOString(), price: Math.round(p), provider: this.name });
    }
    return pts;
  }

  /** Current price: last history value, with a deterministic drop for ~1 in 5 identities. */
  private async currentPrice(identity: string, now: Date): Promise<{ price: number; seats: number }> {
    const h = await this.getHistory(identity, now);
    const last = (h[h.length - 1] as PricePoint).price;
    const bucket = Math.floor(now.getTime() / (10 * 60_000));
    const r = rng(hash(`${identity}#${bucket}`));
    const dropper = hash(identity) % 5 === 0;
    const price = Math.round(dropper ? last * (0.45 + r() * 0.2) : last * (0.97 + r() * 0.06));
    return { price, seats: 1 + Math.floor(r() * 9) };
  }

  async searchFlights(p: FlightSearchParams): Promise<FlightOffer[]> {
    const now = this.clock();
    const dates = p.flexibleDates ? [-1, 0, 1].map((k) => shiftDate(p.departureDate, k)) : [p.departureDate];
    const out: FlightOffer[] = [];
    for (const date of dates) {
      for (const c of MOCK_CARRIERS) {
        const identity = this.identity(p.origin, p.destination, c.code, date, p.cabin);
        const { price, seats } = await this.currentPrice(identity, now);
        out.push(this.build(p, c, date, identity, price * p.passengers, seats, now));
      }
    }
    return out.sort((a, b) => a.price.amount - b.price.amount);
  }

  private build(p: Pick<FlightSearchParams, 'origin' | 'destination' | 'cabin' | 'currency' | 'returnDate'>, c: { code: string; name: string }, date: string, identity: string, price: number, seats: number, now: Date): FlightOffer {
    const h = hash(identity); const stops = h % 3 === 0 ? 1 : 0;
    const dur = 120 + (hash(`${p.origin}${p.destination}`) % 600) + stops * 90;
    const dep = new Date(`${date}T${String(6 + (h % 14)).padStart(2, '0')}:${h % 2 ? '30' : '00'}:00Z`);
    return {
      id: `mock:${identity}`, provider: this.name, providerOfferId: identity, flightIdentity: identity,
      carrier: c.code, carrierName: c.name, flightNumbers: [`${c.code}${100 + (h % 800)}`],
      origin: p.origin, destination: p.destination, departureAt: dep.toISOString(), arrivalAt: new Date(dep.getTime() + dur * 60_000).toISOString(),
      returnDepartureAt: p.returnDate ? new Date(`${p.returnDate}T10:00:00Z`).toISOString() : undefined,
      cabin: p.cabin, stops, durationMinutes: dur, price: { amount: price, currency: p.currency },
      capturedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      availability: seats <= 3 ? 'LIMITED' : 'AVAILABLE', seatsLeft: seats,
      deepLink: `https://example.com/book?offer=${encodeURIComponent(identity)}`,
    };
  }

  async getOffer(id: string, hint?: FlightOffer): Promise<FlightOffer | null> { return this.revalidateOffer(id, hint); }

  async revalidateOffer(id: string, hint?: FlightOffer): Promise<FlightOffer | null> {
    const now = this.clock();
    const [route, carrier, date, cabin] = id.split(':');
    if (!route || !carrier || !date || !cabin) return null;
    const [o, d] = route.split('-');
    if (!o || !d) return null;
    const { price, seats } = await this.currentPrice(id, now);
    const c = MOCK_CARRIERS.find((x) => x.code === carrier) ?? { code: carrier, name: carrier };
    const mult = hint ? hint.price.amount / Math.max(1, (await this.currentPrice(id, new Date(hint.capturedAt))).price) : 1; // keep passenger multiplier
    const offer = this.build({ origin: o, destination: d, cabin: cabin as CabinClass, currency: hint?.price.currency ?? 'USD', returnDate: undefined }, c, date, id, Math.round(price * (Number.isFinite(mult) ? Math.max(1, Math.round(mult)) : 1)), seats, now);
    return offer;
  }

  normalizeOffer(raw: unknown): FlightOffer { return raw as FlightOffer; }
}

function shiftDate(iso: string, days: number): string { return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * dayMs).toISOString().slice(0, 10); }
