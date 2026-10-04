import type { Metadata } from 'next';
import DeletionFlow from './DeletionFlow';
import { SupportEmail } from '../../legal/Placeholder';

export const metadata: Metadata = { title: 'Delete your account' };

export default function AccountDeletion() {
  return (
    <main>
      <h1>Delete your DEAL HUNTER AI account</h1>
      <p>You can delete your account from the app (<b>Account → Delete account</b>) or here. We verify you own the email address with a one-time code, then delete your data.</p>
      <h3>What is deleted</h3>
      <p>Profile, watchlist, saved deals, search history, notification preferences and devices, subscription records and access rights. Operational logs are anonymised. Aggregate market price data not linked to you is retained.</p>
      <h3>Subscriptions</h3>
      <p>Deleting your account does not cancel an App Store or Google Play subscription. Cancel it in your store account settings.</p>
      <DeletionFlow />
      <p className="muted">Can&apos;t sign in? Contact <SupportEmail /> from the email address of your account.</p>
    </main>
  );
}
