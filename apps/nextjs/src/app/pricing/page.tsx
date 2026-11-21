import type { Metadata } from 'next';
import '@/components/marketing/fonts';
import PricingPage from '@/components/marketing/PricingPage';

// Rebuilt every hour, so a dated offer leaves the page when it ends.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Pricing | Stakeout Search',
  description:
    'Your first scan for $5, credit packs from $9, monthly plans from $197. Search Console and Analytics free; Google listing management from $29 a location a month. One credit is one grid point searched on a real phone, with its recording and receipt.',
};

export default function Pricing() {
  return <PricingPage />;
}
