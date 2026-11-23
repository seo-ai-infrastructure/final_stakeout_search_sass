import { DEMO_REPORT_URL } from '@/lib/pricing';

const signUp = (next: string) => '/login?mode=register&next=' + encodeURIComponent(next);

/** Where the buttons go. A new visitor creates an account first, then lands on the right page of the app. */
export const HREF = {
  /** The $5 first audit: the points dialog opens on it, on the new-scan page. */
  firstAudit: signUp('/new-scan?buy=welcome'),
  /** Seats are bought on the Plan and billing page. */
  seats: signUp('/profiles?tab=plan'),
  /** The Closer Pack: the price list opens on it after signing up, on the new-scan page where its audits are run. */
  closer: signUp('/new-scan?buy=closer'),
  /** A plan (Scout, Agency, Scale) is chosen on the Plan and billing page. */
  plans: signUp('/profiles?tab=plan'),
  /** A prospect audit pack, by its price list key. */
  prospects: (key: string) => signUp('/scans?buy=' + key),
  login: '/login',
  pricing: '/pricing',
  /** A real report anyone can open (Lakeland, FL, 5×5, 17 Nov 2026). */
  report: DEMO_REPORT_URL,
  /** The 7×7 scan the rank-tracker comparison is drawn from (Lakeland, FL, 15 Nov 2026). */
  sevenGrid: '/share/432807474370d4d4b14e2bc306975ceac268a3f055f93375',
  /** The hero point's own recording (point 5,5, 17 Nov 2026). */
  recording: '/api/media/hero',
  demo: '/demo',
  agency: '/agency',
  truth: '/truth',
  privacy: '/privacy',
  terms: '/terms',
  support: 'mailto:support@stakeoutsearch.com',
};
