import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import Landing from '@/components/marketing/Landing';
import { promoLive } from '@/lib/pricing';

// Rebuilt every hour, so a dated offer leaves the page when it ends.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Stakeout Search: Every Data Point Comes with a Receipt',
  description:
    'Local rank tracking on real Android phones, in Chrome and the Google Maps app: GPS set at every grid point, the AI Overview and Map Pack tracked together, and a screen recording behind every result. Seats from $39 per client a month; your first 5×5 audit is $5.',
};

export default function Home() {
  return <Landing live={promoLive()} />;
}
