'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

const ID = '07nAbasvRFo';

/** The founder's video: a still with a play button, so YouTube loads only when someone asks for it. */
export function FounderFacade() {
  const [play, setPlay] = useState(false);
  return (
    <div className="relative aspect-video bg-black">
      {!play ? (
        <button type="button" onClick={() => setPlay(true)} aria-label="Play original 3-tracker head-to-head breakdown video" className="group relative w-full h-full block text-left cursor-pointer overflow-hidden">
          <img src={`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`} alt="Google Rankings Are Lying to You — Head-to-Head Rank Tracker Test" loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-95 transition-all duration-300" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090E14] via-[#090E14]/35 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#FF6A28] text-white flex items-center justify-center shadow-2xl shadow-[#FF6A28]/50 group-hover:scale-110 transition-transform"><Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white ml-1" aria-hidden="true" /></div>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <div className="inline-block px-2 py-0.5 rounded bg-black/70 border border-white/15 font-mono text-[10px] text-amber-300 uppercase mb-1.5">Same Keyword · Same Coordinates · Same Timestamp</div>
            <p className="text-white font-bold text-base sm:text-lg leading-snug">“When Measurement Becomes Noisy, Optimization Becomes Superstition.”</p>
          </div>
        </button>
      ) : (
        <iframe className="w-full h-full" src={`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`} title="Google Rankings Are Lying to You — Original Side-by-Side Breakdown" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      )}
    </div>
  );
}
