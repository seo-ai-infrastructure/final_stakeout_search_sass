'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isAdLanding, loadGoogleTag } from '@/lib/googleTag';

/** Google's tag on the public pages an ad can land on (see lib/googleTag.ts); nothing elsewhere. */
export default function GoogleTag() {
  const path = usePathname();
  useEffect(() => {
    if (path && isAdLanding(path)) loadGoogleTag(true);
  }, [path]);
  return null;
}
