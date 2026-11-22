'use client';
import { aiFlagLines, identityNote, placementText, type AiEvidence, type PinAi } from '@stakeout/core/aiFlags';

/** One line for a point's AI Overview, as the "how far down you are" stack says it. */
export function aiSummary(a: PinAi, legacyPlace?: { pos: number; of: number } | null): string {
  if (a.state === 'parsed') {
    if (a.featured) return 'Featured · ' + placementText(a.featured);
    if (a.named) return 'Named in the answer';
    if (a.listing) return 'Your Google listing is cited as a source';
    if (a.websiteCited === 'verified') return 'Your website is cited';
    return a.websiteCited === 'unverified' ? 'Not featured or named · possible website citation' : 'Not featured, named or cited';
  }
  if (a.state === 'unparsed') return 'Unparsed: shown, but its answer could not be read';
  if (a.state === 'none') return 'None at this point';
  return legacyPlace ? `You are #${legacyPlace.pos} of ${legacyPlace.of} businesses it names` : a.visible ? 'It names you' : 'It does not name you';
}

const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\?.*$/, '').replace(/\/$/, '');

function Evidence({ items }: { items: AiEvidence[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-1 pl-6">
      {items.slice(0, 6).map((e, i) => (
        <li key={i} className="text-xs leading-relaxed text-slate-400">
          {e.sentence !== null ? <span className="text-slate-500">Sentence {e.sentence}: </span> : e.card !== null ? <span className="text-slate-500">Card {e.card}: </span> : e.flag === 'listing_source' ? <span className="text-slate-500">In the overview’s sources</span> : null}
          {e.text && <span className="text-slate-300">“{e.text}”</span>}
          {e.url && (
            <>
              {' '}
              <a href={e.url} target="_blank" rel="noreferrer nofollow" className="break-all text-sky-400 hover:underline">
                {short(e.url)}
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The tracked business in one point's AI Overview: the four flags (featured with its placement,
 * named in the answer's words, its Google listing cited as a source, its website cited or only
 * possibly), each with the sentence, card or address it stands on; how surely it is the business;
 * or why the flags are not known.
 */
export default function AiPresenceFlags({ a, business }: { a: PinAi; business: string }) {
  if (a.state === 'none') return null;
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">{business} in this AI Overview</p>
      {a.state === 'parsed' ? (
        <>
          <ul className="mt-2 space-y-1.5">
            {aiFlagLines(a).map((f) => (
              <li key={f.key} className="text-sm">
                <div className="flex items-start gap-2">
                  <span aria-hidden className={'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' + (f.on ? 'bg-violet-400 text-slate-950' : f.label.startsWith('Possible') ? 'bg-amber-400/80 text-slate-950' : 'bg-slate-800 text-slate-500')}>
                    {f.on ? '✓' : f.label.startsWith('Possible') ? '?' : '–'}
                  </span>
                  <span className={f.on ? 'text-white' : f.label.startsWith('Possible') ? 'text-amber-200' : 'text-slate-400'}>
                    {f.label}
                    <span className="sr-only">{f.on ? ': yes' : f.label.startsWith('Possible') ? ': to confirm' : ': no'}</span>
                    {f.detail && <span className="text-slate-400"> · {f.detail}</span>}
                  </span>
                </div>
                <Evidence items={f.evidence} />
              </li>
            ))}
          </ul>
          {a.advertised && <p className="mt-2 text-xs text-slate-400">It also runs an ad in the overview’s Sponsored block (an ad is never counted above).</p>}
          {identityNote(a.identity) && <p className="mt-2 text-xs text-slate-500">Found {identityNote(a.identity)}.</p>}
        </>
      ) : a.state === 'unparsed' ? (
        <p className="mt-1.5 text-sm text-slate-300">
          <span className="font-semibold text-white">Unparsed.</span> Google showed an AI Overview here, but its answer could not be read, so whether it features, names or cites the business is unknown. This point is left out of the AI counts.
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-slate-300">
          {a.visible ? 'Named in the AI Overview' : 'Not named in the AI Overview'} <span className="text-slate-500">(an earlier, single reading: this point was searched before featured, named, listing and website citations were told apart)</span>
        </p>
      )}
    </div>
  );
}
