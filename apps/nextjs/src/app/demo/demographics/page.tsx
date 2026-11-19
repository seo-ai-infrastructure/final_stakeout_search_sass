import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import RealReportDemo from '@/components/demo/RealReportDemo';

export const metadata: Metadata = {
  title: 'Top 25 Demo Map: Rank Where Your Best Customers Live | Stakeout Search',
  description:
    'A real Stakeout report for “emergency plumber near me” in Lakeland, Florida: phone searches in the highest-income neighborhoods, local rank next to Google’s AI answer, ads above the business, and a screen recording behind every pin.',
};

const fonts = {
  '--font-plex': '"IBM Plex Sans"',
  '--font-plex-condensed': '"IBM Plex Sans Condensed"',
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
} as CSSProperties;

/** Public sales demo: two real shared reports, embedded as-is. No account needed. */
export default function DemographicsDemoPage() {
  return (
    <div style={fonts} className="min-h-screen bg-[#102527]">
      <header className="flex items-center justify-between gap-4 border-b border-[#345052] px-[clamp(16px,3vw,48px)] py-4">
        <Link href="/" className="text-base font-semibold text-[#f3f6ef]">
          Stakeout Search
        </Link>
        <nav className="flex items-center gap-5 text-sm text-[#b1c4c4]">
          <Link href="/agency" className="hover:text-[#f3f6ef]">Done-for-you sprints</Link>
          <Link href="/login" className="rounded-md border border-[#345052] px-3 py-2 text-[#f3f6ef] hover:bg-[#173134]">
            Sign in
          </Link>
        </nav>
      </header>
      <RealReportDemo />
    </div>
  );
}
