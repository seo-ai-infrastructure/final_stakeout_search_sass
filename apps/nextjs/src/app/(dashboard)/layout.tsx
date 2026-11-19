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
  // A customer who has not connected a Google account yet gets a button for it; after that, a plain link.
  const open = gbpOpen(user);
  const connected = open && user.role !== 'ADMIN' ? (await db.gbpAccount.count({ where: { userId: user.id, profileId: { not: null } } }).catch(() => 1)) > 0 : true;
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
          {open && connected && <Link href="/profiles">Google profiles</Link>}
          {open && !connected && (
            <Link href="/profiles" className="rounded-lg bg-emerald-500 px-3.5 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400">
              Connect your Google account <span className="font-normal opacity-80">· free</span>
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
