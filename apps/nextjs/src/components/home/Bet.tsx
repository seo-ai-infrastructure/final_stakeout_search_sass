import type { ReactNode } from 'react';
import { PocketOpenButton } from '../pocket/PocketBanner';

/**
 * A button that opens the $1 Pocket Test. With the test switched off (POCKET_TEST=off) it becomes a
 * plain link instead, so no button on the page leads nowhere.
 */
export function Bet({ pocket, className, children, href, off }: { pocket: boolean; className?: string; children: ReactNode; href: string; off?: ReactNode }) {
  return pocket ? <PocketOpenButton className={className}>{children}</PocketOpenButton> : <a href={href} className={className}>{off ?? children}</a>;
}
