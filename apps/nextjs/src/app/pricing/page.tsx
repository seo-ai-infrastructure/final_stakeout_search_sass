import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import PricingPage from '@/components/marketing/PricingPage';

// Rebuilt every hour, so a dated offer leaves the page when it ends.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Pricing | Stakeout Search',
  description:
    'Your first scan for $5, credit packs from $9, monthly plans from $197, no onboarding fee. One credit is one grid point searched on a real phone, with its recording and receipt.',
};

export default function Pricing() {
  return <PricingPage />;
}
