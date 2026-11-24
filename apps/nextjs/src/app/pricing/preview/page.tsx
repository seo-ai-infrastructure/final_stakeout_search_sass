import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '@/components/marketing/siteFonts';
import PricingPageV2 from '@/components/marketing/PlansV2';
import { getAuthenticatedUser } from '@/lib/auth';
import { promoLive } from '@/lib/pricing';
import { getSettings, newPlansFor } from '@stakeout/core/settings';
import { foundingLeft } from '@stakeout/core/founding';

/** The pricing page with the account plans, before they go live: admins and the preview emails only. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Pricing preview | Stakeout Search', robots: { index: false, follow: false } };

export default async function PricingPreview() {
  const [user, settings] = await Promise.all([getAuthenticatedUser().catch(() => null), getSettings().catch(() => null)]);
  if (!user || !settings || !newPlansFor(user, settings)) redirect('/pricing');
  return <PricingPageV2 live={promoLive()} foundingLeft={await foundingLeft().catch(() => 0)} />;
}
