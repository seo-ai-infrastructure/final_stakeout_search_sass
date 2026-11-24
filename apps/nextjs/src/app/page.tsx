import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import Landing from '@/components/marketing/Landing';
import { CLOSER, promoLive, usd } from '@/lib/pricing';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';
import { getSettings } from '@stakeout/core/settings';

// Rebuilt every minute, so a dated offer leaves the page when it ends and the plans switch shows quickly.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const plans = (await getSettings().catch(() => null))?.newPlansLive;
  return {
    title: 'Stakeout Search | Local Rank Tracking and AI Overviews on Real Phones',
    description: plans
      ? `Show clients where they appear in Google’s AI Overviews and local results, on real phones with a recording at every point. Plans from ${usd(ACCOUNT_PLANS.P_SCOUT.tiers[0].cents)} a month; the ${usd(CLOSER.cents)} ${CLOSER.name} runs two 5×5 audits on our 5G lines, with a revenue brief.`
      : 'Show clients where they appear in Google’s AI Overviews and local results. Get 25 real-phone searches, recordings and a shareable report in your first $5 audit.',
  };
}

export default async function Home() {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  return <Landing live={promoLive()} plans={plans} />;
}
