'use client';
import { useEffect, useState } from 'react';

/**
 * A long screenshot in a phone frame: the top of it shows as the thumbnail, and a click opens the
 * whole screenshot, scrollable, over the page. Closes with the × button, Esc, or a click outside.
 */
export default function ExpandShot({ src, alt, thumbHeight = 440, maxWidth = 270 }: { src: string; alt: string; thumbHeight?: number; maxWidth?: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={'Expand: ' + alt}
        style={{ maxWidth }}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-[28px] border-[6px] border-[#1b2431] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition hover:border-[#f5c451]/70"
      >
        <img src={src} alt={alt} loading="lazy" className="block w-full object-cover object-top" style={{ height: thumbHeight }} />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-[#06080c] via-[#06080c]/85 to-transparent pb-3 pt-10 text-[13px] font-semibold text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          Click to expand
        </span>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)} className="fixed inset-0 z-[100] flex justify-center overflow-y-auto overscroll-contain bg-[#06080c]/90 px-4 py-6 backdrop-blur-sm">
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" autoFocus className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[#2a3442] bg-[#0c1118] text-2xl leading-none text-white hover:border-[#f5c451]">×</button>
          <div onClick={(e) => e.stopPropagation()} className="h-fit w-full max-w-[460px] overflow-hidden rounded-2xl border border-[#2a3442] bg-white">
            <img src={src} alt={alt} className="block w-full" />
          </div>
        </div>
      )}
    </>
  );
}
