import { forbidden } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { gbpOpen } from '@/lib/gbpAccess';
import GbpEditor from '@/components/GbpEditor';

export const metadata = { title: 'Connected Accounts' };

/** Google profiles: every listing for an admin; for a customer, the Google accounts they connected. */
export default async function Profiles() {
  if (!gbpOpen(await getAuthenticatedUser())) forbidden();
  return <GbpEditor />;
}
