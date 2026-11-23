import type { Metadata } from 'next';
import VsScraperCredits from '@/components/marketing/VsScraperCredits';
import { CLOSER, usd } from '@/lib/pricing';

const description = `Stop buying scraper credits. The ${usd(CLOSER.cents)} Closer Pack runs two full 5×5 audits on real Android phones, with a screen recording at every pin, plus a revenue brief priced at county Google Ads rates.`;

export const metadata: Metadata = {
  title: '1 pin = 1 real Android session | Stakeout Search vs. scraper credits',
  description,
  openGraph: { title: 'Real Android phones vs. scraper credits | Stakeout Search', description, type: 'website' },
};

/** The Closer Pack's paid-search landing page; ?ag= matches the headline to the ad group. */
export default async function VsScraperCreditsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ag = (await searchParams).ag;
  return <VsScraperCredits ag={typeof ag === 'string' ? ag : undefined} />;
}
