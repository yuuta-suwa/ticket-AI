export const money = (amount: number, currency: string): string => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); } catch { return `${currency} ${Math.round(amount)}`; }
};
export const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;
export const duration = (min: number): string => `${Math.floor(min / 60)}h ${min % 60}m`;
export const timeOf = (iso: string): string => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
export const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const ago = (ms: number, now = Date.now()): string => {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const REASON_TEXT: Record<string, string> = {
  PRICE_NEAR_HISTORIC_LOW: 'Price is near its historical low',
  EXTREME_MEDIAN_DEVIATION: 'Far below the typical price for this flight',
  RAPID_PRICE_DROP: 'Dropped sharply in a short time',
  HIGH_PRICE_RISE_RISK: 'Meaningful chance the price rises',
  LOW_ADDITIONAL_DOWNSIDE: 'Little room left for the price to fall',
  INVENTORY_RISK: 'Seats may sell out soon',
  LOW_DATA_CONFIDENCE: 'Model confidence is low',
  INSUFFICIENT_HISTORY: 'Not enough price history yet',
};
export const LEVEL_TEXT: Record<string, string> = { EXTREME_DEAL: 'EXTREME DEAL', GREAT_DEAL: 'Great deal', GOOD_DEAL: 'Good deal', NORMAL: 'Normal price' };
