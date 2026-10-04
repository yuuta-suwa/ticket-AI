import type { Deal, FlightOffer, PricePoint, RevalidationResult } from '@dealhunter/types';
import { REVALIDATION_CONFIG } from '@dealhunter/config';
import { analyzeOffer, type AnalysisContext } from './analyze';
import type { FlightProvider } from './providers/types';

export function needsRevalidation(offer: Pick<FlightOffer, 'capturedAt' | 'expiresAt'>, now = new Date(), maxAgeMs: number = REVALIDATION_CONFIG.maxOfferAgeMs): boolean {
  return now.getTime() - new Date(offer.capturedAt).getTime() > maxAgeMs || now.getTime() >= new Date(offer.expiresAt).getTime();
}

/**
 * revalidateOffer(): fetch the latest price from the provider, recompute the recommendation,
 * and decide whether the hand-off to the purchase site may proceed. Never throws.
 */
export async function revalidateOffer(
  provider: FlightProvider,
  offer: FlightOffer,
  loadContext: (fresh: FlightOffer) => Promise<AnalysisContext> | AnalysisContext,
  now = new Date(),
): Promise<RevalidationResult> {
  const checkedAt = now.toISOString();
  const previousPrice = offer.price.amount;
  try {
    const fresh = await provider.revalidateOffer(offer.providerOfferId, offer);
    if (!fresh || fresh.availability === 'UNAVAILABLE') {
      return { status: 'UNAVAILABLE', previousPrice, currentPrice: null, deltaPct: null, deal: null, canProceed: false, checkedAt, message: 'This fare is no longer available.' };
    }
    const ctx = await loadContext(fresh);
    const history: PricePoint[] = [...ctx.history, { capturedAt: fresh.capturedAt, price: fresh.price.amount, provider: fresh.provider }];
    const analysis = analyzeOffer(fresh, { ...ctx, history, now });
    const deal: Deal = { offer: fresh, analysis };
    const deltaPct = previousPrice > 0 ? (fresh.price.amount - previousPrice) / previousPrice : 0;
    const changed = Math.abs(deltaPct) >= REVALIDATION_CONFIG.materialChangePct;
    return {
      status: changed ? 'PRICE_CHANGED' : 'UNCHANGED',
      previousPrice, currentPrice: fresh.price.amount, deltaPct, deal, canProceed: true, checkedAt,
      message: changed ? 'The price has changed since you last looked.' : 'Price confirmed.',
    };
  } catch {
    return { status: 'ERROR', previousPrice, currentPrice: null, deltaPct: null, deal: null, canProceed: false, checkedAt, message: 'We could not confirm the latest price. Please try again.' };
  }
}
