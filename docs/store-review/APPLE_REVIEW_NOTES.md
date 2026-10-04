# Apple App Review Notes (paste into App Store Connect → App Review Information)

**Purpose.** DEAL HUNTER AI helps travellers decide whether to buy a flight now or wait. It analyses price history, highlights unusually low prices ("EXTREME DEAL"), and shows a BUY / WAIT / WATCH recommendation with reasons.

**We do not sell flights.** The app never takes payment for tickets and issues no tickets. "Continue to the seller" opens the airline / booking partner in the external browser, only after the app re-checks the latest price. Prices change in real time; forecasts are decision support, not guarantees (stated in-app and in the Terms).

**Native functionality (not a web wrapper).** Native screens only; push notifications (opt-in from Alerts tab), watchlist with price alerts, secure sign-in storage, deep links (`dealhunter://deal/<id>`), haptics, share sheet, cached offline deals, native subscriptions.

**Sign-in.** Email one-time code (production). For review, use the demo account below (password sign-in: tap "Sign in with a password instead").
- Review account: `[REVIEW_EMAIL — fill after running scripts/create-review-account.mjs]`
- Password: `[REVIEW_PASSWORD]`
This account shows a built-in sample market dataset so every feature can be reviewed even if live flight data is empty. Account, watchlist, notifications, subscription and deletion are real.
- MANAGED role demo (optional second account): `[REVIEW_MANAGED_EMAIL]` / `[REVIEW_MANAGED_PASSWORD]` — sees Premium features, no ads, no paywall. "Managed" is an operator-assigned role that can only be set from the admin web console; it cannot be obtained inside the app.

**Subscriptions.** "DEAL HUNTER Premium" auto-renewing subscription(s) via Apple In-App Purchase (through RevenueCat): Advanced Forecast, instant EXTREME DEAL alerts, expanded watchlist, detailed analysis, priority monitoring, ad-free. Paywall shows store price, period, auto-renew + cancel info, Restore Purchases, Terms, Privacy. **Restore Purchases** is on the paywall and Account tab. Test with sandbox account.

**Account deletion.** Account → Delete account (in app) and web `/account-deletion`. Deletes data; subscription cancellation is explained (Apple manages billing).

**Notifications.** Permission requested only when the user taps "Turn on notifications" in Alerts. Users control types, routes, min score, price threshold, quiet hours.

**Ads.** FREE plan only; non-personalised, no tracking (no ATT prompt). EEA consent via Google UMP.

**Privacy.** No location/contacts/camera/mic/photos. See App Privacy answers in docs/compliance/APPLE_PRIVACY_DISCLOSURE.md.
