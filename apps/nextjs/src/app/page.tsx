import type { Metadata } from 'next';
import '@/components/marketing/fonts';
import Landing from '@/components/marketing/Landing';

// Rebuilt every hour, so a dated offer leaves the page when it ends.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Stakeout Search: Every Data Point Comes with a Receipt',
  description:
    'Local rank tracking on real Android phones, in Chrome and the Google Maps app. GPS set at every grid point, residential ISPs you choose, AI Overviews tracked, and a screen recording behind every result.',
};

export default function Home() {
  return <Landing />;
}
