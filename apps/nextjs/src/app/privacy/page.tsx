import type { Metadata } from 'next';
import '@/components/marketing/fonts';
import { PrivacyPolicy } from '@/components/marketing/Legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Stakeout Search',
  description: 'Privacy Policy and Google API Services Limited Use disclosure for Stakeout Search (operated by Marketing Divine LLC).',
};

export default function Page() {
  return <PrivacyPolicy />;
}
