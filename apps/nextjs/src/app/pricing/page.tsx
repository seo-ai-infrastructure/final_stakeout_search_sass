import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import PricingPage from '@/components/marketing/PricingPage';
import PricingPageV2 from '@/components/marketing/PlansV2';
import { CLOSER, promoLive, usd } from '@/lib/pricing';
import { ACCOUNT_PLANS, LINES } from '@stakeout/core/gbpPlans';
import { getSettings } from '@stakeout/core/settings';
import { foundingLeft } from '@stakeout/core/founding';

// Rebuilt every minute, so a dated offer leaves the page when it ends and the plans switch shows quickly.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const plans = (await getSettings().catch(() => null))?.newPlansLive;
  return {
    title: 'Pricing | Stakeout Search',
    description: plans
      ? `One pin, one phone session: Scout ${usd(ACCOUNT_PLANS.P_SCOUT.tiers[0].cents)}, Agency ${usd(ACCOUNT_PLANS.P_AGENCY.tiers[0].cents)}, Scale ${usd(ACCOUNT_PLANS.P_SCALE.tiers[0].cents)} and Agency Max ${usd(ACCOUNT_PLANS.P_MAX.tiers[0].cents)} a month, or two months free yearly, with real-phone sessions and revenue briefs. The listing add-on is ${usd(LINES.LISTING.tiers[0].cents)} a listing. Try one live grid with the ${usd(CLOSER.cents)} ${CLOSER.name}.`
      : 'Priced per client, not per pin: Scout from $39, Command from $59 and Dominator from $99 a client a month, less as you add clients. Your first 5×5 real-device audit is $5. Prospect audits from $15, no subscription. No setup fees.',
  };
}

export default async function Pricing() {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  return plans ? <PricingPageV2 live={promoLive()} foundingLeft={await foundingLeft().catch(() => 0)} /> : <PricingPage live={promoLive()} />;
}
