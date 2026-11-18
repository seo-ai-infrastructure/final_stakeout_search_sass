'use client';
import { useRef } from 'react';

/** Where the home page's recording starts, in seconds (past the phone's set-up, at the search itself). */
const START = 15;

/** The real recording in the hero phone: silent, started at the search, and looped from there. */
export default function HeroVideo({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const toStart = () => {
    const v = ref.current;
    if (!v) return;
    if (Number.isFinite(v.duration) && v.duration > START + 1) v.currentTime = START;
    void v.play().catch(() => {});
  };
  return (
    <video
      ref={ref}
      className="block aspect-[9/16] w-full bg-black object-cover"
      src={'/api/media/hero#t=' + START}
      autoPlay
      muted
      playsInline
      preload="metadata"
      aria-label={label}
      onLoadedMetadata={(e) => e.currentTarget.currentTime < START && toStart()}
      onEnded={toStart}
    />
  );
}
