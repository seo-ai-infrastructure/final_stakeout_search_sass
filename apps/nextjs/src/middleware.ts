// apps/nextjs/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { allowedOnCustomDomain, hostOf, isPrimaryHost } from '@stakeout/core/brandHost';
const PROTECTED_PREFIXES = ['/new-scan', '/scans', '/admin'];
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // A customer's white-label domain: shared reports and what they load, nothing else. No login,
  // dashboard, pricing or account API is reachable there.
  const host = hostOf(req.headers);
  if (host && !isPrimaryHost(host)) {
    return allowedOnCustomDomain(pathname) ? NextResponse.next() : new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  // Allow public client share links (/share/[scanId]) & public APIs
  if (
    pathname.startsWith('/share') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next();
  }
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtected) {
    const sessionCookie = req.cookies.get('stakeout_uid')?.value;
    if (!sessionCookie || !sessionCookie.includes('.')) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
