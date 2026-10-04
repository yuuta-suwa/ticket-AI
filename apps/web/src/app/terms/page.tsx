import type { Metadata } from 'next';
import { Operator, SupportEmail } from '../../legal/Placeholder';

export const metadata: Metadata = { title: 'Terms of Service' };
export const dynamic = 'force-static';

export default function Terms() {
  return (
    <main>
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: <span className="placeholder">[DATE — set at publication]</span> · Operator: <Operator /> · Contact: <SupportEmail /></p>

      <h2>1. What DEAL HUNTER AI is</h2>
      <p>DEAL HUNTER AI is a flight price search and <b>decision-support</b> service. It shows prices from third-party providers, analyses price history, highlights unusual prices and offers BUY / WAIT / WATCH recommendations.</p>

      <h2>2. We do not sell tickets</h2>
      <p>We are <b>not</b> an airline, travel agent or party to your ticket purchase. We do not sell, issue or change tickets. When you choose to buy, you are sent to the airline, an online travel agency or an approved booking partner. Your purchase contract is with them, under their terms and conditions.</p>

      <h2>3. Prices are not guaranteed</h2>
      <p>Prices and availability change in real time and may differ from what we last showed. We re-check the latest price before you leave for a seller, but the <b>price, fare conditions and availability shown by the seller at checkout are the only ones that apply</b>. Always verify them before paying.</p>

      <h2>4. Recommendations and forecasts are not guarantees</h2>
      <p>Anomaly scores, forecasts, BUY / WAIT / WATCH and any plain-language explanations are statistical estimates produced from historical and current data. They may be wrong. They are not financial, travel or professional advice and you remain responsible for your decisions. &quot;EXTREME DEAL&quot; means a price far from its usual range — not that a fare is an error or will be honoured by the seller.</p>

      <h2>5. Accounts</h2>
      <p>You must provide a valid email address and keep your sign-in credentials secure. You may delete your account at any time (Account → Delete account, or <a href="/account-deletion">/account-deletion</a>).</p>

      <h2>6. Plans and subscriptions</h2>
      <p><b>FREE</b> includes basic search and analysis, a limited watchlist, standard notifications and advertising. <b>PREMIUM</b> is an auto-renewing subscription purchased through the Apple App Store or Google Play and adds Advanced Forecast, instant alerts, expanded watchlists, detailed analysis, priority monitoring and an ad-free experience. Price, billing period and renewal terms are shown in the app (from the store) before you subscribe. Payment is charged to your store account; subscriptions renew automatically unless cancelled at least 24 hours before the end of the period; manage or cancel in your store account settings; refunds are handled by the store under its policies. Some accounts may be granted access by the operator (&quot;Managed&quot;).</p>

      <h2>7. Acceptable use</h2>
      <p>Do not scrape or automate the service, attempt to bypass rate limits or access controls, resell data, or interfere with its operation. We may suspend accounts that abuse the service. Data from flight providers is subject to those providers&apos; usage terms, which we and you must respect.</p>

      <h2>8. Availability and liability</h2>
      <p>The service is provided &quot;as is&quot;. Providers may be unavailable and data may be delayed. To the extent permitted by law we are not liable for losses arising from reliance on prices, forecasts or recommendations, missed or unavailable fares, or third-party sellers. Nothing limits liability that cannot be limited by law.</p>

      <h2>9. Changes and governing law</h2>
      <p>We may update these terms; continued use means acceptance. Governing law and jurisdiction: <span className="placeholder">[TO BE COMPLETED BY OPERATOR]</span>.</p>
    </main>
  );
}
