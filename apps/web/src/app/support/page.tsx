import type { Metadata } from 'next';
import { SupportEmail } from '../../legal/Placeholder';

export const metadata: Metadata = { title: 'Support' };
export const dynamic = 'force-static';

export default function Support() {
  return (
    <main>
      <h1>Support</h1>
      <p>Contact: <SupportEmail /> <span className="muted">(placeholder — set before publication)</span></p>
      <div className="card"><h3 style={{ marginTop: 0 }}>Common questions</h3>
        <p><b>Do you sell flights?</b> No. We help you decide; you buy from the airline or booking partner. We re-check the price before you leave the app.</p>
        <p><b>How do I restore my Premium subscription?</b> In the app: Account → Restore purchases. It works on iPhone and Android with the same store account you used to subscribe.</p>
        <p><b>How do I cancel Premium?</b> In your App Store or Google Play subscription settings. Deleting your account does not cancel it.</p>
        <p><b>How do I delete my account?</b> In the app (Account → Delete account) or at <a href="/account-deletion">/account-deletion</a>.</p>
        <p><b>Why did the price change?</b> Fares change in real time. The seller&apos;s checkout price is the one that counts.</p>
      </div>
    </main>
  );
}
