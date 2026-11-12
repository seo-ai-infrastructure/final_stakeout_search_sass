'use client';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const field = 'mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white';
const label = 'block text-xs font-semibold uppercase tracking-wider text-slate-300';
const primary = 'w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60';

async function call(body: unknown) {
  const r = await fetch('/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
  return d;
}

/** With a link's token: choose a password. Without one: ask for a link by email. */
function SetPassword() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'request' | 'sent' | 'done'>(token ? 'checking' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/password?token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          setEmail(d.email);
          setState('ready');
        } else setState('invalid');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  const submit = async (e: React.FormEvent, run: () => Promise<void>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await run();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-xl font-bold">{state === 'request' || state === 'sent' ? 'Reset your password' : 'Choose your password'}</h1>

        {state === 'checking' && <p className="mt-4 text-sm text-slate-400">Checking your link…</p>}

        {state === 'invalid' && (
          <>
            <p className="mt-4 text-sm text-slate-300">This link has expired or was already used.</p>
            <button type="button" className={primary + ' mt-5'} onClick={() => setState('request')}>
              Send me a new link
            </button>
          </>
        )}

        {state === 'ready' && (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) =>
              submit(e, async () => {
                if (password !== again) throw new Error('The two passwords do not match.');
                await call({ action: 'set', token, password });
                setState('done');
              })
            }
          >
            <p className="text-sm text-slate-300">
              For <span className="font-semibold text-white">{email}</span>
            </p>
            <div>
              <label className={label} htmlFor="pw">New password</label>
              <input id="pw" className={field} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
            </div>
            <div>
              <label className={label} htmlFor="pw2">Type it again</label>
              <input id="pw2" className={field} type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save password'}</button>
          </form>
        )}

        {state === 'done' && (
          <>
            <p className="mt-4 text-sm text-slate-300">Your password is saved. You can sign in with it now.</p>
            <Link href="/login" className={primary + ' mt-5 block text-center'}>Sign in</Link>
          </>
        )}

        {state === 'request' && (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) =>
              submit(e, async () => {
                await call({ action: 'request', email });
                setState('sent');
              })
            }
          >
            <p className="text-sm text-slate-300">Enter your account’s email and we will send a link to choose a new password.</p>
            <div>
              <label className={label} htmlFor="em">Email</label>
              <input id="em" className={field} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className={primary}>{busy ? 'Sending…' : 'Email me a link'}</button>
          </form>
        )}

        {state === 'sent' && (
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            If <span className="font-semibold text-white">{email}</span> has an account, a link is on its way. It works once and expires in 24 hours. Check your spam folder if it does not arrive.
          </p>
        )}

        {state !== 'done' && (
          <p className="mt-6 text-center text-sm text-slate-400">
            <Link href="/login" className="hover:text-white">Back to sign in</Link>
          </p>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SetPassword />
    </Suspense>
  );
}
