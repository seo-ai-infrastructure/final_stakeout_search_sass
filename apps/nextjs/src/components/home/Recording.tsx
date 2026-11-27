'use client';

import { useEffect } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { PocketOpenButton } from '../pocket/PocketBanner';

/** A real phone recording, played in a panel over the page. */
export function Recording({ point, place, src, caption, label, pocket, onClose }: { point: string; place: string; src: string; caption: string; label: string; pocket: boolean; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Phone recording for ${point}`} onClick={onClose}>
      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-[#111923] border border-[#2C3E52] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-[#090E14] border-b border-[#1E2B38] flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] font-bold text-[#FF8A4F] uppercase">MP4 Screen Recording · {point}</span>
            <h4 className="text-sm font-bold text-white">{place}</h4>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close the recording" className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <div className="p-5 bg-[#0B1119]">
          <div className="mx-auto max-w-[300px] rounded-[26px] border-4 border-slate-700 bg-black overflow-hidden shadow-2xl">
            <video key={src} className="block w-full aspect-[9/16] max-h-[62vh] object-contain bg-black" src={src} controls autoPlay muted playsInline preload="metadata" aria-label={label} />
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-400">{caption}</p>
          {pocket && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Want to see this live at your own coordinates?</span>
              <span onClick={onClose}>
                <PocketOpenButton className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-[#FF6A28] hover:bg-[#ff7b40] text-white text-xs font-bold cursor-pointer">Test Your Pocket · $1 <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></PocketOpenButton>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
