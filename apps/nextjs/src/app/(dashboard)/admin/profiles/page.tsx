import { forbidden } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import GbpEditor from '@/components/GbpEditor';

export const metadata = { title: 'Google profiles' };

export default async function Profiles() {
  if ((await getAuthenticatedUser()).role !== 'ADMIN') forbidden();
  return <GbpEditor />;
}
