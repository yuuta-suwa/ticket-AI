import type { Metadata } from 'next';
import { Operator, OperatorAddress, SupportEmail } from '../../legal/Placeholder';

export const metadata: Metadata = { title: 'Privacy Policy' };
export const dynamic = 'force-static';

export default function Privacy() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: <span className="placeholder">[DATE — set at publication]</span></p>
      <p className="card"><b>Controller / operator:</b> <Operator /> · <OperatorAddress /> · <SupportEmail /><br /><span className="muted">Highlighted fields are placeholders that must be completed before publication.</span></p>

      <h2>1. What we collect</h2>
      <ul>
        <li><b>Account data:</b> your email address and an internal user ID (via Supabase Auth). Optional display name, language and currency preferences.</li>
        <li><b>Your activity in the app:</b> flight searches you run, flights you add to your watchlist or save, target prices and notification preferences.</li>
        <li><b>Device data for notifications:</b> a push notification token and platform (iOS/Android), only if you turn notifications on.</li>
        <li><b>Subscription data:</b> whether you have an active Premium subscription and its expiry date. We never see your payment card details.</li>
        <li><b>Technical data:</b> crash/error diagnostics and basic, non-identifying usage events (e.g. &quot;search started&quot;). Analytics events never include your email or other personal data.</li>
      </ul>
      <p>We do <b>not</b> collect precise location, contacts, photos, camera or microphone data, and we do not track you across other companies&apos; apps and websites.</p>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To provide the service: search, price analysis, BUY / WAIT / WATCH recommendations, watchlists and alerts.</li>
        <li>To unlock Premium features you have purchased and to prevent abuse (rate limiting).</li>
        <li>To send the alerts you ask for, within the limits (types, routes, quiet hours) you set.</li>
        <li>To improve the accuracy of our price models, using aggregate price data, not your personal data.</li>
      </ul>

      <h2>3. Service providers who process data for us</h2>
      <table>
        <thead><tr><th>Provider</th><th>Purpose</th><th>Data involved</th></tr></thead>
        <tbody>
          <tr><td>Supabase</td><td>Database, authentication, server functions</td><td>Account and app data</td></tr>
          <tr><td>Vercel</td><td>Website hosting and admin dashboard</td><td>Technical request data</td></tr>
          <tr><td>RevenueCat, Apple App Store, Google Play</td><td>Subscription purchase, restore and entitlement status</td><td>Anonymous/app user ID, purchase status</td></tr>
          <tr><td>Expo (push notification service), Apple APNs, Google FCM</td><td>Delivering push notifications</td><td>Push token, notification content</td></tr>
          <tr><td>Flight data providers <span className="muted">(to be listed when enabled)</span></td><td>Flight prices and availability</td><td>Search parameters (route, dates, cabin) — not your identity</td></tr>
          <tr><td>AI provider (e.g. OpenAI)</td><td>Plain-language explanations of a recommendation</td><td>Only a short, structured summary of a deal (decision, reasons, scores). No personal data and no raw price history. Explanations are cached per deal.</td></tr>
          <tr><td>Google AdMob (FREE plan only)</td><td>Advertising</td><td>See &quot;Advertising&quot; below</td></tr>
        </tbody>
      </table>

      <h2>4. Advertising</h2>
      <p>Ads are shown only on the FREE plan. In this version we request <b>contextual / non-personalised ads</b> and do not use the advertising identifier for tracking. In regions where required (e.g. EEA/UK) you will be asked for consent via a consent management prompt before ads are requested. Premium and Managed accounts see no ads.</p>

      <h2>5. Prices and recommendations</h2>
      <p>Prices come from third-party flight data providers and change in real time. Recommendations and forecasts are produced by statistical models and are decision support, not guarantees. When you leave the app to purchase, the airline or booking partner&apos;s own privacy policy applies.</p>

      <h2>6. Retention</h2>
      <ul>
        <li>Account and app data: kept while your account exists; deleted when you delete your account.</li>
        <li>Notification tokens: removed on sign-out, when invalid, or on account deletion.</li>
        <li>Operational logs and cost records: kept for up to <span className="placeholder">[RETENTION PERIOD — e.g. 12 months]</span>, with user references removed when you delete your account.</li>
        <li>Aggregate market price history (not linked to you): kept to improve models.</li>
        <li>Records we are legally required to keep (e.g. tax/accounting for purchases) are held by the app stores and payment processors.</li>
      </ul>

      <h2>7. Your choices and rights</h2>
      <ul>
        <li><b>Delete your account</b> in the app (Account → Delete account) or on the web at <a href="/account-deletion">/account-deletion</a>. Deleting your account does not cancel an App Store / Google Play subscription — cancel it in your store account settings.</li>
        <li>Turn notifications on or off at any time in the app or your device settings.</li>
        <li>Depending on where you live you may have rights to access, correct, port or erase your data and to object to processing. Contact us at <SupportEmail />.</li>
      </ul>

      <h2>8. Security &amp; children</h2>
      <p>We use encryption in transit, row-level access controls and secure on-device credential storage. The service is not directed to children under 16 and we do not knowingly collect their data.</p>

      <h2>9. Changes &amp; contact</h2>
      <p>We will update this page when our practices change. Questions: <SupportEmail />.</p>
    </main>
  );
}
