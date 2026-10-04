import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { PURCHASE_CONFIG } from '@dealhunter/config';
import type { PurchasePackage, PurchaseProvider, PurchaseResult, PurchaseState } from '@dealhunter/core';
import { ENV } from './env';

const toState = (ci: CustomerInfo): PurchaseState => {
  const e = ci.entitlements.active[PURCHASE_CONFIG.premiumEntitlementId];
  return { premiumActive: !!e, expiresAt: e?.expirationDate ?? null, willRenew: !!e?.willRenew, managementUrl: ci.managementURL };
};

/** Primary adapter. Prices & billing periods come from the store via RevenueCat — never hard-coded. */
export class RevenueCatPurchaseProvider implements PurchaseProvider {
  readonly name = 'revenuecat';
  private pkgs = new Map<string, PurchasesPackage>();
  private configured = false;

  async configure(appUserId: string): Promise<void> {
    const apiKey = Platform.OS === 'ios' ? ENV.revenueCatIos : ENV.revenueCatAndroid;
    if (!apiKey) throw new Error('RevenueCat API key missing');
    if (!this.configured) { Purchases.configure({ apiKey, appUserID: appUserId }); this.configured = true; }
    else await Purchases.logIn(appUserId);
  }
  async logOut(): Promise<void> { if (this.configured) { try { await Purchases.logOut(); } catch { /* anonymous already */ } } }

  async getPackages(): Promise<PurchasePackage[]> {
    const o = await Purchases.getOfferings();
    const offering = o.all[PURCHASE_CONFIG.offeringId] ?? o.current;
    this.pkgs.clear();
    return (offering?.availablePackages ?? []).map((p) => {
      this.pkgs.set(p.identifier, p);
      return {
        identifier: p.identifier, title: p.product.title, description: p.product.description, priceString: p.product.priceString,
        billingPeriod: p.product.subscriptionPeriod ?? null, introPriceString: p.product.introPrice?.priceString ?? null,
      };
    });
  }
  async purchase(id: string): Promise<PurchaseResult> {
    const p = this.pkgs.get(id);
    if (!p) return { status: 'error', message: 'Product unavailable' };
    try { const r = await Purchases.purchasePackage(p); return { status: 'success', state: toState(r.customerInfo) }; }
    catch (e) { const err = e as { userCancelled?: boolean; message?: string }; return err.userCancelled ? { status: 'cancelled' } : { status: 'error', message: err.message ?? 'Purchase failed' }; }
  }
  async restore(): Promise<PurchaseResult> {
    try { return { status: 'success', state: toState(await Purchases.restorePurchases()) }; }
    catch (e) { return { status: 'error', message: (e as Error).message ?? 'Restore failed' }; }
  }
  async getState(): Promise<PurchaseState> { return toState(await Purchases.getCustomerInfo()); }
}
