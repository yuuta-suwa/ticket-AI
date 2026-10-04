import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { APP_IDENTITY } from '@dealhunter/config';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'DEAL HUNTER AI — Know when to buy', template: '%s · DEAL HUNTER AI' },
  description: 'AI-assisted price analysis that helps you decide whether to buy a flight now or wait.',
  icons: { icon: '/favicon.png' },
  metadataBase: new URL(APP_IDENTITY.siteUrl.startsWith('http') ? APP_IDENTITY.siteUrl : 'https://example.com'),
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer>
          <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link><Link href="/account-deletion">Delete account</Link>
          <p>© DEAL HUNTER AI. Prices change in real time; forecasts are not guarantees. DEAL HUNTER AI does not sell or issue airline tickets.</p>
        </footer>
      </body>
    </html>
  );
}
