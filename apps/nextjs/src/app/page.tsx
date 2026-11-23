import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import Landing from '@/components/marketing/Landing';
import { promoLive } from '@/lib/pricing';
import { getSettings } from '@stakeout/core/settings';

// Rebuilt every minute, so a dated offer leaves the page when it ends and the plans switch shows quickly.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const plans = (await getSettings().catch(() => null))?.newPlansLive;
  return {
    title: 'Stakeout Search | Local Rank Tracking and AI Overviews on Real Phones',
    description: plans
      ? 'Show clients where they appear in Google’s AI Overviews and local results, on real phones with a recording at every point. Plans from $49 a month; the $19 Closer Pack has two full 5×5 audits and a revenue brief.'
      : 'Show clients where they appear in Google’s AI Overviews and local results. Get 25 real-phone searches, recordings and a shareable report in your first $5 audit.',
  };
}

export default async function Home() {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  return <Landing live={promoLive()} plans={plans} />;
}
