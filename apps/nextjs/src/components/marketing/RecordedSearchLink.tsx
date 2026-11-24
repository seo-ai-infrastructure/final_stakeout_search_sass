'use client';

import { Play } from 'lucide-react';

export function RecordedSearchLink() {
  return (
    <a className="lp-primary so-btn" href="#lp-recording" onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const video = document.querySelector<HTMLVideoElement>('#lp-recording video');
      // Keep the native anchor and player controls available when playback is blocked.
      if (video) void video.play().catch(() => {});
    }}>
      <Play size={16} fill="currentColor" aria-hidden="true" /> Watch the 8-second search
    </a>
  );
}
