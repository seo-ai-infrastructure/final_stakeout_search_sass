import { redirect } from 'next/navigation';
import { db } from '@stakeout/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { gbpOpen } from '@/lib/gbpAccess';
import { DashboardHeader } from '@/components/DashboardHeader';
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
      <DashboardHeader isAdmin={user.role === 'ADMIN'} profilesOpen={open} connected={connected} user={{ email: user.email, name: user.name, creditBalance: user.creditBalance }} />
      {!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
      <main>{children}</main>
    </div>
  );
}
