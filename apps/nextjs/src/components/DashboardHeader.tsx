'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, Menu, X } from 'lucide-react';
import { UserSessionBadge } from './UserSessionBadge';
import styles from './DashboardHeader.module.css';

type Props = {
  isAdmin: boolean;
  profilesOpen: boolean;
  connected: boolean;
  user: { email: string; name?: string | null; creditBalance: number };
};

export function DashboardHeader({ isAdmin, profilesOpen, connected, user }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const links = [
    { href: '/new-scan', label: 'New scan' },
    { href: '/scans', label: 'Scans & schedules' },
    ...(isAdmin ? [
      { href: '/admin/devices', label: 'Device fleet' },
      { href: '/admin/scans', label: 'All scans' },
      { href: '/services', label: 'White-Label Services', admin: true },
    ] : []),
    ...(profilesOpen ? [{ href: '/profiles', label: connected ? 'Connected Accounts' : 'Connect Search Console and Analytics', connect: !connected }] : []),
  ];

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const renderLinks = () => links.map((link) => {
    const active = pathname === link.href || pathname.startsWith(link.href + '/');
    return <Link key={link.href} href={link.href} className={styles.navLink} aria-current={active ? 'page' : undefined} data-connect={'connect' in link && link.connect ? true : undefined} onClick={() => setMenuOpen(false)}>
      <span>{link.label}</span>
      {'admin' in link && link.admin && <span className={styles.adminBadge} title="Only admins can see this"><LockKeyhole size={10} aria-hidden="true" />Admin only</span>}
      {'connect' in link && link.connect && <span className={styles.free}>Free</span>}
    </Link>;
  });

  return <header className={styles.header}>
    <div className={styles.bar}>
      <Link href="/scans" className={styles.brand} aria-label="Stakeout Search: scans" onClick={() => setMenuOpen(false)}>
        <img src="/brand/stakeout-precision.svg" alt="" width={34} height={48} className={styles.brandMark} />
        <span className={styles.wordmark} aria-hidden="true"><span>STAKEOUT</span><span className={styles.search}>{'SEARCH'.split('').map((letter) => <span key={letter}>{letter}</span>)}</span></span>
      </Link>
      <nav className={styles.desktopNav} aria-label="Workspace">{renderLinks()}</nav>
      <div className={styles.account}><UserSessionBadge initialUser={user} /></div>
      <button ref={toggleRef} type="button" className={styles.menuToggle} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen((value) => !value)}>
        {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
      </button>
    </div>
    {menuOpen && <div className={styles.mobileMenu}>
      <button type="button" className={styles.backdrop} tabIndex={-1} aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />
      <nav id="workspace-navigation" className={styles.menuPanel} aria-label="Workspace menu">{renderLinks()}</nav>
    </div>}
  </header>;
}
