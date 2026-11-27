import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeoGridDashboard } from '@/components/GeoGridDashboard';
import { hostOf } from '@stakeout/core/brandHost';
import { brandForShare } from '@/lib/brandShare';
import { db } from '@stakeout/db';
import { sharePreview } from '@/lib/sharePreview';

/**
 * What a pasted share link shows in Facebook, Slack or iMessage: the scan's own business, market and
 * keyword, read here on the server (the report itself loads in the browser). A white-labelled report
 * carries the customer's name and logo, and never ours.
 */
export async function generateMetadata({ params }: { params: Promise<{ scanId: string }> }): Promise<Metadata> {
  try {
    const token = (await params).scanId;
    const { allowed, brand } = await brandForShare(token, hostOf(await headers()));
    if (!allowed) return {};
    const scan = await db.gridScan.findFirst({ where: { shareToken: token }, select: { targetBusiness: true, keyword: true, city: true, stateCode: true, totalPins: true, network: true } });
    const branded: Metadata = brand ? { ...(brand.logo ? { icons: { icon: brand.logo } } : {}), robots: { index: false, follow: false } } : {};
    if (!scan) return brand ? { title: `${brand.name} · Local visibility report`, description: `Local search visibility report from ${brand.name}.`, ...branded } : {};
    return { ...sharePreview(scan, brand?.name ?? null), ...branded };
  } catch {
    return {};
  }
}

export default async function Page({ params }: { params: Promise<{ scanId: string }> }) {
  return <GeoGridDashboard identifier={(await params).scanId} shared />;
}
