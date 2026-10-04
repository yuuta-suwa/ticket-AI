/**
 * SINGLE SOURCE OF TRUTH for store identity.
 * Every value tagged REPLACE_BEFORE_SUBMISSION is a placeholder: no real company,
 * domain or contact exists yet. Replace here (or via env at build time) — nowhere else.
 */
const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k] || undefined;

export const APP_IDENTITY = {
  name: 'DEAL HUNTER AI',
  slug: 'deal-hunter-ai',
  scheme: 'dealhunter',
  version: '1.0.0',
  /** REPLACE_BEFORE_SUBMISSION: must match the App ID registered in Apple Developer. */
  iosBundleIdentifier: env('DEALHUNTER_IOS_BUNDLE_ID') ?? 'ai.dealhunter.app',
  /** REPLACE_BEFORE_SUBMISSION: must match the Google Play application id. */
  androidPackage: env('DEALHUNTER_ANDROID_PACKAGE') ?? 'ai.dealhunter.app',
  /** REPLACE_BEFORE_SUBMISSION */
  operator: { legalName: '[OPERATOR LEGAL NAME — TO BE FILLED]', address: '[OPERATOR ADDRESS — TO BE FILLED]' },
  /** REPLACE_BEFORE_SUBMISSION */
  supportEmail: '[SUPPORT EMAIL — TO BE FILLED]',
  /** REPLACE_BEFORE_SUBMISSION: public site URL hosting /privacy /terms /account-deletion /support */
  siteUrl: env('NEXT_PUBLIC_SITE_URL') ?? 'https://REPLACE-ME.example',
  /** Google's published sample AdMob app IDs. Replace with real IDs before production ads. */
  admob: {
    iosAppId: env('DEALHUNTER_ADMOB_IOS_APP_ID') ?? 'ca-app-pub-3940256099942544~1458002511',
    androidAppId: env('DEALHUNTER_ADMOB_ANDROID_APP_ID') ?? 'ca-app-pub-3940256099942544~3347511713',
  },
} as const;
