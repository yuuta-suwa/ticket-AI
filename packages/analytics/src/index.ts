export type AnalyticsEventName =
  | 'app_open' | 'search_started' | 'search_completed' | 'deal_opened' | 'watch_added' | 'buy_signal_viewed'
  | 'revalidate_started' | 'revalidate_success' | 'purchase_out_click' | 'paywall_viewed'
  | 'subscription_started' | 'subscription_restored' | 'notification_opened' | 'account_deleted';

export type AnalyticsValue = string | number | boolean;
export type AnalyticsProps = Record<string, AnalyticsValue>;

export interface AnalyticsProvider {
  track(event: AnalyticsEventName, props?: AnalyticsProps): void;
}

/** Keys that must never reach an analytics backend (PII / identifiers). */
const FORBIDDEN_KEY = /(email|phone|name|address|token|password|user_?id|uid|ip|lat|lon|location)/i;
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Removes PII-looking keys/values. Defence in depth: callers should not pass PII in the first place. */
export function sanitizeProps(props: AnalyticsProps = {}): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN_KEY.test(k)) continue;
    if (typeof v === 'string' && (EMAIL_VALUE.test(v) || v.length > 100)) continue;
    out[k] = v;
  }
  return out;
}

export class NoopAnalytics implements AnalyticsProvider { track(): void {} }

export class MemoryAnalytics implements AnalyticsProvider {
  readonly events: { event: AnalyticsEventName; props: AnalyticsProps }[] = [];
  track(event: AnalyticsEventName, props?: AnalyticsProps): void { this.events.push({ event, props: sanitizeProps(props) }); }
}

/** Wraps any provider so every payload is sanitised. */
export class SanitizingAnalytics implements AnalyticsProvider {
  constructor(private readonly inner: AnalyticsProvider) {}
  track(event: AnalyticsEventName, props?: AnalyticsProps): void { try { this.inner.track(event, sanitizeProps(props)); } catch { /* analytics must never crash the app */ } }
}

// ---- Error tracking abstraction ----
export interface ErrorTracker { captureError(error: unknown, context?: Record<string, string | number | boolean>): void }
export class ConsoleErrorTracker implements ErrorTracker {
  captureError(error: unknown, context?: Record<string, string | number | boolean>): void {
    // eslint-disable-next-line no-console
    console.error('[error]', error instanceof Error ? error.message : String(error), context ? sanitizeProps(context) : '');
  }
}
