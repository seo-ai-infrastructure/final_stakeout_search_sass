import type { Metadata } from 'next';
import '@/components/marketing/fonts';
import Truth from '@/components/marketing/Truth';

export const metadata: Metadata = {
  title: 'Real Data Is Messy: The Dirty Secret of Local Rank Grids | Stakeout Search',
  description:
    'Smoothing, location typed into a URL, snapping and fractions-of-a-cent data: how a local rank grid can look better than the searches behind it, and five questions to ask any rank tracker.',
};

export default function TruthPage() {
  return <Truth />;
}
