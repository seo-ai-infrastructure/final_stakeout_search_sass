import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import Landing from '@/components/marketing/Landing';
import { promoLive } from '@/lib/pricing';

// Rebuilt every hour, so a dated offer leaves the page when it ends.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Stakeout Search | Local Rank Tracking and AI Overviews on Real Phones',
  description:
    'Show clients where they appear in Google’s AI Overviews and local results. Get 25 real-phone searches, recordings and a shareable report in your first $5 audit.',
};

export default function Home() {
  return <Landing live={promoLive()} />;
}
