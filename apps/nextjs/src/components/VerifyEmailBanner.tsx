'use client';
import { useState } from 'react';

export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function resend() {
    setState('sending');
    try {
      const r = await fetch('/api/auth/verify/resend', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState('sent');
    } catch (e) {
      setMessage((e as Error).message || 'Could not send the email.');
      setState('error');
    }
  }
  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-950/30 px-5 py-2.5 text-sm text-amber-100">
      Confirm {email} to activate your account.{' '}
      {state === 'sent' ? (
        <span>We sent a new link.</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === 'sending'}
          className="underline underline-offset-2"
        >
          {state === 'sending' ? 'Sending…' : 'Resend the link'}
        </button>
      )}
      {state === 'error' && <span className="ml-2 text-amber-300">{message}</span>}
    </div>
  );
}
