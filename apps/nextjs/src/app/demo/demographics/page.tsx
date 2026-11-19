import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import DemographicDemo from '@/components/demo/DemographicDemo';

export const metadata: Metadata = {
  title: 'Real-Device Geo-Grid Demo: Local Rank vs. Google AI Answers | Stakeout Search',
  description:
    'See two real Stakeout scans of “emergency plumber near me” in Lakeland, Florida: where the local list disappeared, where Google’s AI answer named the business, the Census buying power under every pin, and the phone recording behind each result.',
};

const fonts = {
  '--font-plex': '"IBM Plex Sans"',
  '--font-plex-condensed': '"IBM Plex Sans Condensed"',
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
} as CSSProperties;

/** Public sales demo: real Census data under two real device scans. No account needed. */
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
      <DemographicDemo />
    </div>
  );
}
