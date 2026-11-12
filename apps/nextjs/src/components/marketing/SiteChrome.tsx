import Link from 'next/link';

/** New accounts are closed unless NEXT_PUBLIC_SIGNUPS_OPEN=true. */
export const SIGNUPS_OPEN = process.env.NEXT_PUBLIC_SIGNUPS_OPEN === 'true';

/** The "create an account" button, or "Sign in" while new accounts are closed. */
export function JoinLink({ className }: { className: string }) {
  return SIGNUPS_OPEN ? (
    <Link href="/login?mode=register" className={className}>Create your account</Link>
  ) : (
    <Link href="/login" className={className}>Sign in</Link>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Stakeout Search home">
      <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 3.5c-8.9 0-16.2 7.1-16.2 15.9C7.8 31.6 24 44.5 24 44.5s16.2-12.9 16.2-25.1C40.2 10.6 32.9 3.5 24 3.5z" fill="#f5c451" />
        <circle cx="24" cy="19.4" r="7.2" fill="#06080c" />
        <circle cx="24" cy="19.4" r="3" fill="#f5c451" />
      </svg>
      <span className="mk-display text-lg font-semibold tracking-wide">Stakeout Search</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#1b2431] bg-[#06080c]/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-2" aria-label="Main">
          <Link href="/truth" className="hidden rounded-lg px-3 py-2 text-[#9aa7b8] hover:text-white lg:block">The truth about grids</Link>
          <Link href="/demo" className="hidden rounded-lg px-3 py-2 text-[#9aa7b8] hover:text-white sm:block">Live demo</Link>
          <Link href="/pricing" className="rounded-lg px-3 py-2 text-[#9aa7b8] hover:text-white">Pricing</Link>
          <Link href="/agency" className="hidden rounded-lg px-3 py-2 text-[#9aa7b8] hover:text-white md:block">Done for you</Link>
          <Link href="/login" className="rounded-lg px-3 py-2 text-[#eef2f7] hover:bg-[#111823]">Sign in</Link>
          {SIGNUPS_OPEN && <Link href="/login?mode=register" className="mk-btn-primary rounded-lg px-4 py-2 font-semibold">Get started</Link>}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="border-t border-[#1b2431]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-[#9aa7b8] sm:px-8">
        <Logo />
        <nav className="flex flex-wrap gap-5" aria-label="Footer">
          <Link href="/truth" className="hover:text-white">The truth about grids</Link>
          <Link href="/demo" className="hover:text-white">Live demo</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/agency" className="hover:text-white">Done for you</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
          <a href="mailto:sass@stakeoutsearch.com" className="hover:text-white">sass@stakeoutsearch.com</a>
        </nav>
        <p className="w-full text-xs text-[#6b7686]">
          © 2026 Stakeout Search. Not affiliated with Google. Google Maps is a trademark of Google LLC.{note ? ' ' + note : ''}
        </p>
      </div>
    </footer>
  );
}
