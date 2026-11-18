import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import { TermsOfService } from '@/components/marketing/Legal';

export const metadata: Metadata = {
  title: 'Terms of Service | Stakeout Search',
  description: 'Terms of Service for Stakeout Search (operated by Marketing Divine LLC): credits, billing, integrations and add-on services.',
};

export default function Page() {
  return <TermsOfService />;
}
