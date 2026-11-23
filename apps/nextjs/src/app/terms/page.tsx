import type { Metadata } from 'next';
import '@/components/marketing/fonts';
import { TermsOfService } from '@/components/marketing/Legal';
import { getSettings } from '@stakeout/core/settings';

export const metadata: Metadata = {
  title: 'Terms of Service | Stakeout Search',
  description: 'Terms of Service for Stakeout Search (operated by Marketing Divine LLC): phone sessions, billing, integrations and add-on services.',
};

// Re-read every minute: the billing terms follow the plans switch.
export const revalidate = 60;

export default async function Page() {
  const s = await getSettings().catch(() => null);
  const from = s?.newPlansLive && s.newPlansLiveAt ? new Date(s.newPlansLiveAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }) : null;
  return <TermsOfService plans={Boolean(s?.newPlansLive)} plansFrom={from} />;
}
