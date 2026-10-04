/** Vendor-neutral purchase port. RevenueCat is the primary adapter (apps/mobile); Fake for tests/demo; DirectStore later. */
export interface PurchasePackage {
  identifier: string;
  title: string;
  description: string;
  /** Localised price string straight from the store (e.g. "$9.99"). NEVER hard-coded. */
  priceString: string;
  /** ISO-8601 billing period from the store, e.g. P1M / P1Y. */
  billingPeriod: string | null;
  introPriceString?: string | null;
}
export interface PurchaseState { premiumActive: boolean; expiresAt: string | null; willRenew: boolean; managementUrl?: string | null }
export type PurchaseResult = { status: 'success'; state: PurchaseState } | { status: 'cancelled' } | { status: 'error'; message: string };

export interface PurchaseProvider {
  readonly name: string;
  configure(appUserId: string): Promise<void>;
  logOut(): Promise<void>;
  getPackages(): Promise<PurchasePackage[]>;
  purchase(packageIdentifier: string): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
  getState(): Promise<PurchaseState>;
}
