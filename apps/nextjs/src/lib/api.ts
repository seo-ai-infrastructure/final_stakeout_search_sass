import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { safeErrorText, errorCode } from '@stakeout/core/errorText';

export function errorResponse(e: unknown) {
  if (e instanceof InputError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.message === 'UNAUTHORIZED')
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  // The full cause goes to the server log (secrets masked); the visitor sees only its code.
  console.error('Request failed', safeErrorText(e));
  const code = errorCode(e);
  return NextResponse.json(
    { error: 'Service temporarily unavailable.' + (code ? ' (' + code + ')' : ''), code },
    { status: 503 },
  );
}
