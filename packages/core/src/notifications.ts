import type { Deal, NotificationPreferences, NotificationType } from '@dealhunter/types';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabledTypes: ['EXTREME_DEAL', 'TARGET_PRICE', 'BUY_SIGNAL'],
  routes: [], minScore: 65, priceThreshold: null, quietHours: { startHour: 22, endHour: 8, utcOffsetMinutes: 0 },
};

export function isQuietHour(q: NotificationPreferences['quietHours'], now: Date): boolean {
  if (!q) return false;
  const local = new Date(now.getTime() + q.utcOffsetMinutes * 60_000).getUTCHours();
  return q.startHour === q.endHour ? false : q.startHour < q.endHour ? local >= q.startHour && local < q.endHour : local >= q.startHour || local < q.endHour;
}

/** Which notification types does this deal qualify for? */
export function classifyDeal(deal: Deal, prev: { price: number } | null, targetPrice: number | null): NotificationType[] {
  const out: NotificationType[] = [];
  const { analysis: a, offer: o } = deal;
  if (a.anomaly.level === 'EXTREME_DEAL') out.push('EXTREME_DEAL');
  if (a.decision.decision === 'BUY') out.push('BUY_SIGNAL');
  if (targetPrice !== null && o.price.amount <= targetPrice) out.push('TARGET_PRICE');
  if (prev && prev.price > 0) {
    const d = (o.price.amount - prev.price) / prev.price;
    if (d <= -0.05) out.push('PRICE_DROP');
    if (Math.abs(d) >= 0.03) out.push('WATCHLIST_CHANGE');
  }
  return out;
}

/** Dedupe key: same deal + type + $-bucket never notifies twice. */
export const dedupeKey = (deal: Deal, type: NotificationType): string =>
  `${deal.offer.flightIdentity}:${type}:${Math.round(deal.offer.price.amount / 5) * 5}`;

export interface NotifyDecision { send: boolean; reason?: 'TYPE_DISABLED' | 'ROUTE' | 'SCORE' | 'THRESHOLD' | 'QUIET_HOURS' | 'DUPLICATE'; key: string }

export function shouldNotify(
  prefs: NotificationPreferences, deal: Deal, type: NotificationType, now: Date, alreadySent: ReadonlySet<string>,
  opts: { instantAllowed: boolean } = { instantAllowed: true },
): NotifyDecision {
  const key = dedupeKey(deal, type);
  if (!prefs.enabledTypes.includes(type)) return { send: false, reason: 'TYPE_DISABLED', key };
  const route = `${deal.offer.origin}-${deal.offer.destination}`;
  if (prefs.routes.length && !prefs.routes.includes(route)) return { send: false, reason: 'ROUTE', key };
  if (deal.analysis.anomaly.score < prefs.minScore && type !== 'TARGET_PRICE') return { send: false, reason: 'SCORE', key };
  if (prefs.priceThreshold !== null && deal.offer.price.amount > prefs.priceThreshold) return { send: false, reason: 'THRESHOLD', key };
  // FREE users get standard (non-instant) delivery: still respects quiet hours; premium instant alerts may break through only for EXTREME_DEAL? No — quiet hours always win.
  if (isQuietHour(prefs.quietHours, now)) return { send: false, reason: 'QUIET_HOURS', key };
  if (!opts.instantAllowed && type === 'EXTREME_DEAL') { /* delivered via the standard batch, handled by caller */ }
  if (alreadySent.has(key)) return { send: false, reason: 'DUPLICATE', key };
  return { send: true, key };
}
