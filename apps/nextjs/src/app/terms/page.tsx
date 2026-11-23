import type { Metadata } from 'next';
import '@/components/marketing/fonts';
import { TermsOfService } from '@/components/marketing/Legal';

export const metadata: Metadata = {
  title: 'Terms of Service | Stakeout Search',
  description: 'Terms of Service for Stakeout Search (operated by Marketing Divine LLC): phone sessions, billing, integrations and add-on services.',
};

export default function Page() {
  return <TermsOfService />;
}
