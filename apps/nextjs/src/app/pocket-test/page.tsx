import type { Metadata } from 'next';
import '@/components/marketing/siteFonts';
import { SiteFoot, SiteNav } from '@/components/marketing/SiteKit';
import PocketTestForm from '@/components/pocket/PocketTestForm';
import { getSettings } from '@stakeout/core/settings';
import '@/components/marketing/site.css';
import '@/components/pocket/pocket.css';

export const metadata: Metadata = {
  title: 'The $1 Pocket Test | Stakeout Search',
  description: 'One live Android search at the exact spot you are sitting, on video, for $1. Compare it with the phone in your hand.',
};
export const dynamic = 'force-dynamic';

export default async function PocketTestPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const plans = Boolean((await getSettings().catch(() => null))?.newPlansLive);
  const cancelled = (await searchParams).cancelled === '1';
  return (
    <div className="so">
      <SiteNav page="pricing" plans={plans} />
      <main className="pk-page">
        <p className="pk-kicker">The $1 Pocket Test</p>
        <h1>Don’t trust rank trackers? Test us against the phone in your pocket.</h1>
        <p className="pk-muted">One of our Android phones runs your search on 5G at the exact spot you’re sitting, on video. You run the same search on your own phone and compare. One search, one dollar.</p>
        <PocketTestForm cancelled={cancelled} />
      </main>
      <SiteFoot note="The pocket test is one live search at one spot. A plan runs every pin of a grid." />
    </div>
  );
}
