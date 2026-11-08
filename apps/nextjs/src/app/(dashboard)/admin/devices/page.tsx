import { forbidden } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import Fleet from '@/components/AdminDeviceFleet';
import { TestPointCard } from '@/components/TestPointCard';
export default async function Devices() {
  if ((await getAuthenticatedUser()).role !== 'ADMIN') forbidden();
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-screen-2xl px-5 pt-5">
        <TestPointCard />
      </div>
      <Fleet />
    </div>
  );
}
