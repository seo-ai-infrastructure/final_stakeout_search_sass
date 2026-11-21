import { forbidden } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { servicesOpen } from '@/lib/services';
import WhiteLabelServices from '@/components/WhiteLabelServices';

export const metadata = { title: 'White-Label Services | Stakeout Search' };

/** White-Label Services: admins only until it is launched. */
export default async function Page() {
  if (!servicesOpen(await getAuthenticatedUser())) forbidden();
  return <WhiteLabelServices />;
}
