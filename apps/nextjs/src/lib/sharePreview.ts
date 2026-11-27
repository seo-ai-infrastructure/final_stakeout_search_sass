import type { Metadata } from 'next';

/**
 * The title and link-preview tags of a shared report. "5G" is said only of a scan that ran on mobile
 * data; an older scan on home internet is a real-device report without it.
 */
export function sharePreview(scan: { targetBusiness: string; keyword: string; city: string; stateCode: string; totalPins: number; network: string }, brandName: string | null): Metadata {
  const fiveG = scan.network === 'mobile' ? '5G ' : '';
  const market = [scan.city, scan.stateCode].filter(Boolean).join(', ');
  const title = `${scan.targetBusiness}${market ? ' · ' + market : ''} — Real-Device ${fiveG}Visibility Report`;
  const ogTitle = `${scan.targetBusiness} (${scan.keyword}) — Verified ${fiveG}Search Report`;
  const description = `Real Android phone captures across ${scan.totalPins} neighborhood pins—including Map Pack ranks, 1-Box panels, AI Overviews, and video receipts.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title: ogTitle, description, type: 'article', siteName: brandName ?? 'Stakeout Search' },
    twitter: { card: 'summary', title: ogTitle, description },
  };
}
