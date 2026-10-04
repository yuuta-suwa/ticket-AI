# Google Play review notes (App access + declarations)

**App access (Play Console → App content → App access):** login required. Provide: `[REVIEW_EMAIL]` / `[REVIEW_PASSWORD]` (use "Sign in with a password instead"). Instructions: Home → open any deal → "Check latest price" → "Continue to the seller" (external browser) → Add to watchlist → Account → Upgrade to Premium / Restore purchases → Delete account.

**What the app is:** flight price analysis & decision support (BUY/WAIT/WATCH). It does not sell tickets; purchases happen on the airline/partner site after latest-price re-validation.
**Subscriptions:** Google Play Billing via RevenueCat; prices from Play; restore on Account and Paywall.
**Ads:** Yes (FREE plan only), AdMob, non-personalised; UMP consent in EEA/UK. Advertising ID permission **not** declared (`AD_ID` blocked).
**Permissions:** only `POST_NOTIFICATIONS` (requested on opt-in). No location/camera/mic/contacts/storage.
**Data safety:** docs/compliance/GOOGLE_DATA_SAFETY.md. **Account deletion URL:** `https://<site>/account-deletion` (and in-app). **Privacy policy URL:** `https://<site>/privacy`.
**Target audience:** 18+ (general adult). **Content rating:** no user-generated content, no violence/gambling.
**Managed users:** operator-assigned role (admin web only) that unlocks Premium without a subscription; not obtainable in-app.
