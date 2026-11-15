import { forbidden } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import AdminScans from '@/components/AdminScans';
export default async function Page() {
  if ((await getAuthenticatedUser()).role !== 'ADMIN') forbidden();
  return <AdminScans />;
}
