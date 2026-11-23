import { forbidden } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { gbpOpen } from '@/lib/gbpAccess';
import { sellsAddon } from '@/lib/gbpBilling';
import GbpEditor from '@/components/GbpEditor';

export const metadata = { title: 'Connected Accounts' };

/** Google profiles: every listing for an admin; for a customer, the Google accounts they connected. */
export default async function Profiles() {
  const me = await getAuthenticatedUser();
  if (!gbpOpen(me)) forbidden();
  return <GbpEditor addon={await sellsAddon(me).catch(() => false)} />;
}
