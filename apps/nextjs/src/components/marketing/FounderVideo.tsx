'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

/** The founder's recorded side-by-side breakdown (https://youtu.be/07nAbasvRFo). */
const FOUNDER_PROOF_YOUTUBE_ID = '07nAbasvRFo';

/**
 * The video as a still with a play button: YouTube's player is only loaded when someone presses
 * play, so the homepage stays fast and nothing of YouTube's runs for visitors who do not watch.
 */
export function FounderVideo({ title }: { title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-founder-frame">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${FOUNDER_PROOF_YOUTUBE_ID}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play the video: ${title}`}>
          <img src={`https://i.ytimg.com/vi/${FOUNDER_PROOF_YOUTUBE_ID}/hqdefault.jpg`} alt="" width={480} height={360} loading="lazy" decoding="async" />
          <span className="lp-founder-play" aria-hidden="true"><Play size={26} fill="currentColor" /></span>
        </button>
      )}
    </div>
  );
}
