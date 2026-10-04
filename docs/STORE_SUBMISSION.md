# Store submission guide
Final approval is Apple/Google's decision. Software-side DONE = production build + materials + settings below.
1. Fill every placeholder: operator name/address/support email/dates (web legal pages, `identity.cjs`), listing copy in `store-assets/`.
2. Deploy web (Vercel): `/privacy`, `/terms`, `/support`, `/account-deletion` must be public HTTPS URLs → enter in both consoles.
3. Create subscription products (monthly/annual) in both stores; attach to RevenueCat offering `default`. Paywall prices come from the store — nothing to hard-code.
4. Run `scripts/create-review-account.mjs`; paste credentials into the Review Notes fields (docs/store-review/*).
5. Fill privacy questionnaires from `docs/compliance/APPLE_PRIVACY_DISCLOSURE.md` and `GOOGLE_DATA_SAFETY.md`.
6. Upload screenshots (`store-assets/screenshots`, regenerate with real device/simulator shots if preferred), icon (1024), feature graphic (Android).
7. TestFlight/Internal testing pass, then submit. Apple: select "Sign-in required", add notes; Google: declare Ads = yes, in-app purchases = yes, target audience 18+/general.
8. Complete `docs/RELEASE_CHECKLIST.md`.
