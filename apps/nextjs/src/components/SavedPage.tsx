'use client';
import { useEffect, useState } from 'react';

/** Which parts of the AI Overview a saved page outlines (its #anchor); none: the page as it was. */
export type Outline = 'all' | 'p0' | 'card' | 'web' | 'none';

const OUTLINES: [Outline, string, string][] = [
  ['all', 'All three', 'border-slate-500'],
  ['p0', 'Position 0', 'border-amber-400'],
  ['card', 'Cards', 'border-violet-500'],
  ['web', 'Websites', 'border-cyan-400'],
  ['none', 'None', 'border-slate-700'],
];

/** The outline buttons over a saved page. */
export function OutlinePicker({ show, onChange, className = '' }: { show: Outline; onChange: (o: Outline) => void; className?: string }) {
  return (
    <div className={'flex flex-wrap items-center gap-1.5 ' + className} role="group" aria-label="Outline on the page">
      <span className="mr-1 text-xs text-slate-400">Outline</span>
      {OUTLINES.map(([k, label, border]) => (
        <button
          key={k}
          type="button"
          aria-pressed={show === k}
          onClick={() => onChange(k)}
          className={'min-h-[30px] rounded-lg border-2 px-2.5 text-[11px] font-semibold ' + border + (show === k ? ' bg-slate-800 text-white' : ' text-slate-400 hover:text-slate-200')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * A point's saved page in a frame. Its address is fetched once; each outline then switches in place
 * by the page's #anchor (the parts are marked when the page is saved), and nothing on it runs.
 */
export function SavedPageFrame({ pinId, kind, show, shareToken, className }: { pinId: string; kind: 'page_pre' | 'page_post'; show: Outline; shareToken?: string; className: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    fetch('/api/proof/' + pinId + '?kind=' + kind + '&as=json' + (shareToken ? '&share=' + encodeURIComponent(shareToken) : ''), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { url?: string }) => live && (j.url ? setUrl(j.url) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pinId, kind, shareToken]);
  if (!url) return <p className="p-4 text-sm text-slate-400">{failed ? 'This point’s saved page could not be opened.' : 'Opening the saved page…'}</p>;
  return (
    <iframe
      key={pinId + kind}
      title="The page Google served at this point"
      sandbox=""
      referrerPolicy="no-referrer"
      src={url + (show === 'none' ? '#top' : '#sk-' + show)}
      className={className}
    />
  );
}
