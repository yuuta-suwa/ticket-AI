# Google Play Data safety — answers
Data collected: Personal info (email, user ID), App activity (searches, watchlist — in-app actions), Device or other IDs (push token), Purchase history (subscription status). Ads: device/ads interaction processed by AdMob (non-personalised).
Shared with third parties: Google AdMob (ads, FREE plan), RevenueCat (subscription entitlements), Expo/FCM (notifications) as **service providers**; flight providers receive search parameters only (no personal data).
Encryption in transit: Yes. Deletion: Yes — in-app and web (`/account-deletion`). Data can be deleted on request. Optional vs required: email required for account; push token optional; ads only on FREE.
Not collected: location, contacts, photos/videos, audio, files, calendar, health, financial info, web browsing, messages.
Ads declaration: contains ads = Yes. Advertising ID: not used (`AD_ID` blocked in manifest).
