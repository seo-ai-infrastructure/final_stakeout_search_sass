'use client';
import { useEffect, useRef, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import PocketTestForm from './PocketTestForm';
import './pocket.css';

const POCKET_OPEN = 'stakeout:pocket-open';

/** A button anywhere on the homepage that opens the pocket test's panel (the one the banner owns). */
export function PocketOpenButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(POCKET_OPEN))}>{children}</button>;
}

/**
 * The strip under the site's header that dares a visitor to check us against the phone in their
 * hand, and the panel it opens with the $1 pocket test's form (so nobody leaves the page to start).
 */
export default function PocketBanner() {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Other buttons on the page (PocketOpenButton) open the same panel.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(POCKET_OPEN, show);
    return () => window.removeEventListener(POCKET_OPEN, show);
  }, []);
  return (
    <>
      <aside className="pk-banner" aria-label="The $1 Pocket Test">
        <p><Smartphone size={17} aria-hidden="true" /> <span><strong>The $1 Pocket Test:</strong> run a live mobile capture right where you’re sitting and compare our video receipt to the phone in your hand. Not even close? Send a screenshot and get your buck back.</span></p>
        <button type="button" className="pk-banner-cta" onClick={() => setOpen(true)}>Test your location for $1</button>
      </aside>
      <dialog ref={dialog} className="pk-drawer" aria-labelledby="pk-drawer-title" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dialog.current) setOpen(false); }}>
        <div className="pk-drawer-in">
          <header>
            <h2 id="pk-drawer-title">The $1 Pocket Test</h2>
            <button type="button" className="pk-close" onClick={() => setOpen(false)} aria-label="Close"><X size={20} aria-hidden="true" /></button>
          </header>
          <p className="pk-lede">One of our Android phones runs your search on 5G at the exact spot you’re sitting, on video. You run the same search on your own phone and compare.</p>
          {open && <PocketTestForm />}
        </div>
      </dialog>
    </>
  );
}
