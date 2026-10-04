import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '../../../server/admin';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdmin();
  return (
    <>
      <nav className="top" aria-label="Admin">
        <b>DEAL HUNTER · Admin</b>
        <Link href="/admin">Overview</Link><Link href="/admin/users">Users</Link><Link href="/admin/deals">Deals</Link><Link href="/admin/providers">Providers</Link>
        <Link href="/admin/costs">Costs</Link><Link href="/admin/accuracy">Accuracy</Link><Link href="/admin/revenue">Revenue</Link>
        <span className="muted" style={{ marginLeft: 'auto' }}>{actor.email} · <span className="badge">{actor.plan}</span></span>
      </nav>
      <main>{children}</main>
    </>
  );
}
