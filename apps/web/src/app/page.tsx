import Link from 'next/link';

export default function Landing() {
  return (
    <main>
      <h1>DEAL HUNTER AI</h1>
      <p style={{ fontSize: '1.25rem' }}>AI spots price distortions and tells you whether to <b>buy now</b> or <b>wait</b>.</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ul>
          <li><b>Price history</b> for each flight, so you can see what&apos;s normal.</li>
          <li><b>Anomaly detection</b> highlights EXTREME DEALs: prices far below the usual range.</li>
          <li><b>BUY / WAIT / WATCH</b> recommendations from a statistical forecast, with the reasons shown.</li>
          <li><b>Watchlist &amp; alerts</b> so you don&apos;t have to keep checking.</li>
          <li><b>Always re-checked</b>: we confirm the latest price before you go to the seller.</li>
        </ul>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Good to know</h3>
        <p className="muted">DEAL HUNTER AI is a decision-support tool. It does not sell or issue tickets — you complete your purchase with the airline or an approved booking partner. Forecasts are estimates, not guarantees.</p>
      </div>
      <p><Link className="btn" href="/support">Support</Link> <Link className="btn secondary" href="/privacy">Privacy Policy</Link></p>
      <p className="muted">App Store and Google Play links will appear here once the app is published.</p>
    </main>
  );
}
