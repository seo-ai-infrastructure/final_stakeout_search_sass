import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import PricingPage from '@/components/marketing/PricingPage';
import PricingPageV2 from '@/components/marketing/PlansV2';
import { promoLive } from '@/lib/pricing';
import { getSettings } from '@stakeout/core/settings';

// Rebuilt every minute, so a dated offer leaves the page when it ends and the plans switch shows quickly.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const plans = (await getSettings().catch(() => null))?.newPlansLive;
  return {
    title: 'Pricing | Stakeout Search',
    description: plans
      ? 'One pin, one phone session: Scout $49, Agency $129 and Scale $299 a month, with real-phone sessions and revenue briefs. The listing add-on is $29 a listing. The Closer Pack is $19, no subscription.'
      : 'Priced per client, not per pin: Scout from $39, Command from $59 and Dominator from $99 a client a month, less as you add clients. Your first 5×5 real-device audit is $5. Prospect audits from $15, no subscription. No setup fees.',
  };
}

export default async function Pricing() {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  return plans ? <PricingPageV2 live={promoLive()} /> : <PricingPage live={promoLive()} />;
}
