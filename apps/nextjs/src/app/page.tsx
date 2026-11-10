import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import Landing from '@/components/marketing/Landing';

export const metadata: Metadata = {
  title: 'Stakeout Search: Every Data Point Comes with a Receipt',
  description:
    'Local rank tracking on real Android phones, in Chrome and the Google Maps app. GPS set at every grid point, residential ISPs you choose, AI Overviews tracked, and a screen recording behind every result.',
};

export default function Home() {
  return <Landing />;
}
