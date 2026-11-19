import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import RealReportDemo from '@/components/demo/RealReportDemo';

export const metadata: Metadata = {
  title: 'Top 25 Demo Map: Rank Where Your Best Customers Live | Stakeout Search',
  description:
    'A real Stakeout report for “emergency plumber near me” in Lakeland, Florida: phone searches in the highest-income neighborhoods, local rank next to Google’s AI answer, ads above the business, and a screen recording behind every pin.',
};

/** Public sales demo: real report screenshots and two real shared reports, embedded as-is. No account needed. */
export default function DemographicsDemoPage() {
  return <RealReportDemo />;
}
