import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import { SiteFoot, SiteNav } from '@/components/marketing/SiteKit';
import PocketResult from '@/components/pocket/PocketResult';
import { getSettings } from '@stakeout/core/settings';
import '@/components/marketing/site.css';
import '@/components/pocket/pocket.css';

// A private page: its address is the buyer's key to their result.
export const metadata: Metadata = { title: 'Your Pocket Test | Stakeout Search', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function PocketTestResult({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  const paid = (await searchParams).paid;
  return (
    <div className="so">
      <SiteNav page="pricing" plans={plans} />
      <main><PocketResult token={(await params).token} paid={typeof paid === 'string' && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid) ? paid : null} /></main>
      <SiteFoot note="The pocket test is one live search at one spot. A plan runs every pin of a grid." />
    </div>
  );
}
