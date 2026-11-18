import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import { PrivacyPolicy } from '@/components/marketing/Legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Stakeout Search',
  description: 'Privacy Policy and Google API Services Limited Use disclosure for Stakeout Search (operated by Marketing Divine LLC).',
};

export default function Page() {
  return <PrivacyPolicy />;
}
