// Metro inlines EXPO_PUBLIC_* only when referenced statically. Only client-safe values live here.
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
export const ENV = {
  appEnv,
  isProduction: appEnv === 'production',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  revenueCatIos: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
  revenueCatAndroid: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
  admobBannerIos: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_UNIT_ID ?? '',
  admobBannerAndroid: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_UNIT_ID ?? '',
  /** Demo mode can NEVER be active in a production build, whatever the flag says. */
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === 'true' && appEnv !== 'production',
};
export const hasBackend = ENV.supabaseUrl !== '' && ENV.supabaseAnonKey !== '';
