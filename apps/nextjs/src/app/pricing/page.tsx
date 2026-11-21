import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import PricingPage from '@/components/marketing/PricingPage';
import { promoLive } from '@/lib/pricing';

// Rebuilt every hour, so a dated offer leaves the page when it ends.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Pricing | Stakeout Search',
  description:
    'Priced per client, not per pin: Scout from $39, Command from $59 and Dominator from $99 a client a month, less as you add clients. Your first 5×5 real-device audit is $5. Prospect audits from $15, no subscription. No setup fees.',
};

export default function Pricing() {
  return <PricingPage live={promoLive()} />;
}
