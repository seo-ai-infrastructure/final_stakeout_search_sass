import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@stakeout/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { gbpOpen } from '@/lib/gbpAccess';
import { UserSessionBadge } from '@/components/UserSessionBadge';
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner';
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) redirect('/login');
  // A customer who has connected nothing yet gets a button for the free part (Search Console and Analytics); after that, a plain link.
  const open = gbpOpen(user);
  const connected = open && user.role !== 'ADMIN'
    ? (await Promise.all([db.googleConnection.count({ where: { userId: user.id } }), db.gbpAccount.count({ where: { userId: user.id } })]).catch(() => [1, 1])).some((n) => n > 0)
    : true;
  return (
    <div className="min-h-screen">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-5 py-3">
        <nav className="flex flex-wrap items-center gap-5 text-sm">
          <Link href="/scans" className="flex items-center gap-2 font-black tracking-widest text-emerald-400" aria-label="Stakeout Search: scans">
            <img src="/brand/stakeout-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px]" />
            STAKEOUT
          </Link>
          <Link href="/new-scan">New scan</Link>
          <Link href="/scans">Scans & schedules</Link>
          {user.role === 'ADMIN' && (
            <Link href="/admin/devices">Device fleet</Link>
          )}
          {user.role === 'ADMIN' && <Link href="/admin/scans">All scans</Link>}
          {user.role === 'ADMIN' && (
            <Link href="/services" className="inline-flex items-center gap-1.5">
              White-Label Services
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-400" title="Only admins can see this for now">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                Admin only
              </span>
            </Link>
          )}
          {open && connected && <Link href="/profiles">Connected Accounts</Link>}
          {open && !connected && (
            <Link href="/profiles" className="rounded-lg bg-emerald-500 px-3.5 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400">
              Connect Search Console and Analytics <span className="font-normal opacity-80">· free</span>
            </Link>
          )}
        </nav>
        <UserSessionBadge />
      </header>
      {!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
      <main>{children}</main>
    </div>
  );
}
