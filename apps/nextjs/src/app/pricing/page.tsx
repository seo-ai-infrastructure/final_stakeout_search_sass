import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import PricingPage from '@/components/marketing/PricingPage';

export const metadata: Metadata = {
  title: 'Pricing | Stakeout Search',
  description:
    'One-time founding onboarding for $497 with 1,000 credits, then monthly plans from $197. One credit is one grid point searched on a real phone, with its recording and receipt.',
};

export default function Pricing() {
  return <PricingPage />;
}
