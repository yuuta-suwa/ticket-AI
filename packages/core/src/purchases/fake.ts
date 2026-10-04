import type { PurchasePackage, PurchaseProvider, PurchaseResult, PurchaseState } from './types';

/** In-memory provider for unit tests and review-safe demo builds. Prices are placeholders from the "store". */
export class FakePurchaseProvider implements PurchaseProvider {
  readonly name = 'fake';
  private state: PurchaseState = { premiumActive: false, expiresAt: null, willRenew: false };
  private restorable: PurchaseState | null = null;
  constructor(private readonly packages: PurchasePackage[] = [
    { identifier: '$rc_monthly', title: 'Premium Monthly', description: 'Fake monthly', priceString: 'FAKE-PRICE', billingPeriod: 'P1M' },
    { identifier: '$rc_annual', title: 'Premium Annual', description: 'Fake annual', priceString: 'FAKE-PRICE', billingPeriod: 'P1Y' },
  ]) {}
  async configure(): Promise<void> {}
  async logOut(): Promise<void> { this.state = { premiumActive: false, expiresAt: null, willRenew: false }; }
  async getPackages() { return this.packages; }
  async purchase(id: string): Promise<PurchaseResult> {
    const p = this.packages.find((x) => x.identifier === id);
    if (!p) return { status: 'error', message: 'Unknown package' };
    this.state = { premiumActive: true, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), willRenew: true };
    this.restorable = this.state;
    return { status: 'success', state: this.state };
  }
  async restore(): Promise<PurchaseResult> {
    if (!this.restorable) return { status: 'success', state: this.state };
    this.state = this.restorable; return { status: 'success', state: this.state };
  }
  async getState() { return this.state; }
}
