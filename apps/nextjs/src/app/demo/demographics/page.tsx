import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import DemographicDemo from '@/components/demo/DemographicDemo';

export const metadata: Metadata = {
  title: 'Buying-Power Geo-Grid & AI Citation Sandbox | Stakeout Search',
  description:
    'Explore U.S. Census income, homeownership and housing age beneath simulated Google Maps rankings and AI citations. Test the Buying-Power Geo-Grid, then request a live Android evidence audit.',
};

const fonts = {
  '--font-plex': '"IBM Plex Sans"',
  '--font-plex-condensed': '"IBM Plex Sans Condensed"',
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
} as CSSProperties;

/** Public sales sandbox: real Census data under simulated rankings. No account needed. */
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
