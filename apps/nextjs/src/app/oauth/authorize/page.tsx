import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAppScheme, isLoopback, redirectHost } from '@stakeout/core/oauth';
import { getAuthenticatedUser } from '@/lib/auth';
import { agentOpen } from '@/lib/gbpAccess';
import { consentTicket, originOf } from '@/lib/oauth';
import { readAsk } from '@/lib/oauthAsk';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect an app · Stakeout Search', robots: { index: false, follow: false } };

const shell = 'mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10';
const card = 'rounded-2xl border border-slate-800 bg-slate-900 p-6';

function Stopped({ why }: { why: string }) {
  return (
    <main className={shell}>
      <div className={card}>
        <h1 className="text-xl font-semibold">This sign-in was stopped</h1>
        <p className="mt-3 text-sm text-slate-300">{why}</p>
        <p className="mt-3 text-sm text-slate-400">Nothing was shared. You can close this page and start again from the app.</p>
      </div>
    </main>
  );
}

/**
 * GET /oauth/authorize: where an AI app sends a person to approve it. The person signs in if they
 * are not already, sees which app is asking and where they will be sent back to, and allows or
 * refuses. Nothing is given to the app until they press Allow.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const h = await headers();
  const origin = originOf(h);
  if (!origin) return <Stopped why="Apps are connected on stakeoutsearch.com itself." />;

  const r = await readAsk(q, origin);
  if ('stop' in r) return <Stopped why={r.stop} />;
  if ('back' in r) redirect(r.back);

  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) {
    const again = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) again.append(k, x);
    redirect('/login?next=' + encodeURIComponent('/oauth/authorize?' + again.toString()));
  }

  const { ask, client } = r;
  const open = await agentOpen(user).catch(() => false);
  const local = isLoopback(ask.redirectUri), native = isAppScheme(ask.redirectUri);
  const from = client.kind === 'document' ? new URL(client.id).host : null;
  const fields: Record<string, string> = { client_id: ask.clientId, redirect_uri: ask.redirectUri, code_challenge: ask.challenge, resource: ask.resource, scope: ask.scope, state: ask.state, ticket: consentTicket(user.id, ask) };
  return (
    <main className={shell}>
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Stakeout Search</p>
        <h1 className="mt-1 break-words text-xl font-semibold">Let {client.name} use your Stakeout account?</h1>
        <p className="mt-2 text-sm text-slate-400">Signed in as <span className="text-slate-200">{user.email}</span>.</p>

        <dl className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-slate-500">App</dt><dd className="break-all text-slate-200">{client.name}{from ? ' · ' + from : ''}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-slate-500">Sends you back to</dt><dd className="break-all text-slate-200">{redirectHost(ask.redirectUri)}</dd></div>
        </dl>
        {!from && <p className="mt-2 text-xs text-slate-500">This app gave its own name; Stakeout has not checked who makes it. Go by where it sends you back to.</p>}
        {(local || native) && <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">This sends you back to a program on this computer, not to a website. Only allow it if you started this from an app you are running yourself, just now.</p>}

        <p className="mt-4 text-sm font-semibold text-slate-200">It will be able to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>Read your scans, listings, reviews, Search Console and Analytics</li>
          <li>Post to your listings, reply to reviews of 4 and 5 stars, and edit descriptions, hours, services, photos and booking links</li>
          <li>Start scans, within the monthly phone-session limit you set for agents</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">It can never change a listing’s name, categories, phone, website or address, and it never sees your password. You can disconnect it at any time on the Connected Accounts page, under AI agents.</p>
        {!open && <p className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">Agent access is not switched on for this account yet, so the app will connect but be refused until it is. It comes with any listing on a Command or Dominator seat.</p>}

        <form method="post" action="/api/oauth/decision" className="mt-5 flex flex-wrap gap-3">
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button type="submit" name="decision" value="allow" className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Allow</button>
          <button type="submit" name="decision" value="deny" className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm hover:border-slate-500">Cancel</button>
        </form>
      </div>
    </main>
  );
}
