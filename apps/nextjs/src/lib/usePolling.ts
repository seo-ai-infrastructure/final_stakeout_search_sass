'use client';
import { useEffect, useRef } from 'react';

/**
 * Runs `load` now and every `ms` while the tab is in view. A hidden tab stops asking (it kept the
 * servers and the database awake for nobody) and catches up the moment it is looked at again.
 */
export function usePolling(load: () => unknown, ms: number, deps: unknown[] = []) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void latest.current();
      timer = setInterval(() => void latest.current(), ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onChange = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
