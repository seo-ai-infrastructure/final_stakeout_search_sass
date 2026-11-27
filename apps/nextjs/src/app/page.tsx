import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import Landing from '@/components/marketing/Landing';
import HomePage from '@/components/home/HomePage';
import { WELCOME, promoLive, usd } from '@/lib/pricing';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';
import { getSettings } from '@stakeout/core/settings';

// Rebuilt every minute, so a dated offer leaves the page when it ends and the plans switch shows quickly.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const plans = (await getSettings().catch(() => null))?.newPlansLive;
  const title = 'Local Rank Tracking on Real Android Phones | Stakeout Search';
  const description = 'See the local pack, organic results and AI Overviews on real Android phones. Open a map pin to replay the search. ' +
    (plans ? `Plans from ${usd(ACCOUNT_PLANS.P_SCOUT.tiers[0].cents)}/month.` : `Run your first audit for ${usd(WELCOME.cents)}.`);
  return {
    title,
    description,
    openGraph: {
      title, description, type: 'website',
      images: [{ url: 'https://www.stakeoutsearch.com/media/demo/top25-combined-map.jpg', width: 978, height: 518, alt: 'Stuart’s Plumbing local rankings and AI Overview appearances across 25 Lakeland searches' }],
    },
  };
}

export default async function Home() {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  // The plans-era homepage; the $1 pocket test (POCKET_TEST=off takes it down, and its buttons with it).
  if (plans) return <HomePage live={promoLive()} pocket={process.env.POCKET_TEST !== 'off'} />;
  return <Landing live={promoLive()} plans={plans} />;
}
