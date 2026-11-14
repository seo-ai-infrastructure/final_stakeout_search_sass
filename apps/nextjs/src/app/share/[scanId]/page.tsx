import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeoGridDashboard } from '@/components/GeoGridDashboard';
import { hostOf } from '@stakeout/core/brandHost';
import { brandForShare } from '@/lib/brandShare';

/** A white-labelled report carries the customer's name and logo in the browser tab too. */
export async function generateMetadata({ params }: { params: Promise<{ scanId: string }> }): Promise<Metadata> {
  try {
    const { brand } = await brandForShare((await params).scanId, hostOf(await headers()));
    if (!brand) return {};
    return {
      title: `${brand.name} · Local visibility report`,
      description: `Local search visibility report from ${brand.name}.`,
      ...(brand.logo ? { icons: { icon: brand.logo } } : {}),
      robots: { index: false, follow: false },
    };
  } catch {
    return {};
  }
}

export default async function Page({ params }: { params: Promise<{ scanId: string }> }) {
  return <GeoGridDashboard identifier={(await params).scanId} shared />;
}
