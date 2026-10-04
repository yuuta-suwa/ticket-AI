# Apple App Privacy ("nutrition label") — answers
Tracking: **No** (NSPrivacyTracking=false; no ATT; ads non-personalised).
| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact info → Email address | Yes | Yes | No | App functionality (account/sign-in) |
| Identifiers → User ID | Yes | Yes | No | App functionality (account, entitlements via RevenueCat) |
| Identifiers → Device ID (push token) | Yes, if notifications enabled | Yes | No | App functionality (notifications) |
| User content / Usage data → Search history, watchlist | Yes | Yes | No | App functionality |
| Purchases → Purchase history | Yes (subscription status via RevenueCat/Apple) | Yes | No | App functionality |
| Usage data → Product interaction | Only non-identifying events if an analytics vendor is enabled (currently disabled in production) | No | No | Analytics |
| Diagnostics → Crash/performance | If an error-tracking vendor is enabled | No | No | App functionality |
| Advertising data | AdMob (FREE plan): coarse device/ad-interaction data processed by Google, non-personalised | No | No | Third-party advertising |
Not collected: location, contacts, photos, audio, health, financial info, browsing history.
**Re-verify against the final SDK set** (RevenueCat, AdMob, Expo) and AdMob's own privacy manifest before submission.
