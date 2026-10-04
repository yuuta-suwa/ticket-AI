const { APP_IDENTITY } = require('@dealhunter/config/identity.cjs');

/** All store identity comes from packages/config/identity.cjs (one place to change). */
/** @param {{ config: import('expo/config').ExpoConfig }} ctx @returns {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  name: APP_IDENTITY.name,
  slug: APP_IDENTITY.slug,
  scheme: APP_IDENTITY.scheme,
  version: APP_IDENTITY.version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_IDENTITY.iosBundleIdentifier,
    supportsTablet: false,
    // Non-personalised, contextual ads only in Phase 1 → no tracking, no ATT prompt.
    infoPlist: { ITSAppUsesNonExemptEncryption: false, UIBackgroundModes: ['remote-notification'] },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
      ],
    },
  },
  android: {
    package: APP_IDENTITY.androidPackage,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B1220' },
    permissions: ['POST_NOTIFICATIONS'],
    blockedPermissions: [
      'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO', 'android.permission.READ_CONTACTS', 'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'com.google.android.gms.permission.AD_ID',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#0B1220' }],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#0E9F6E', defaultChannel: 'deals' }],
    ['react-native-google-mobile-ads', { iosAppId: APP_IDENTITY.admob.iosAppId, androidAppId: APP_IDENTITY.admob.androidAppId, userTrackingPermission: false }],
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' }, android: { minSdkVersion: 26 } }],
  ],
  extra: {
    router: {},
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID },
    siteUrl: APP_IDENTITY.siteUrl,
  },
});
