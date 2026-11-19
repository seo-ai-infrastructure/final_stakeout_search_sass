import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { rpcAnswer, rpcError, rpcResult, type Rpc } from '@stakeout/core/agentTools';
import { accountOfKey } from '@/lib/apiKeys';
import { runTool } from '@/lib/agent';
import type { ActingUser } from '@/lib/acting';
import { AGENT_CLOSED, agentOpen } from '@/lib/gbpAccess';

export const dynamic = 'force-dynamic';
// Starting a scan prepares proxies for every city in the grid, which can take minutes.
export const maxDuration = 300;

const PER_MINUTE = 60;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

/**
 * POST /api/mcp: the MCP server for an account's own AI agents (Streamable HTTP, one JSON answer
 * per request, no session to keep). The agent sends its key as "Authorization: Bearer stk_…".
 * Each tool runs as the key's account through the site's own handlers.
 */
export async function POST(req: Request) {
  const key = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const account = key ? await accountOfKey(key).catch(() => null) : null;
  if (!account) return json(rpcError(null, -32001, 'Send your Stakeout key as "Authorization: Bearer stk_…". Keys are made on the Connected Accounts page, under AI agents.'), 401, { 'WWW-Authenticate': 'Bearer' });
  // A key made before agent access was taken off an account does nothing.
  if (!(await agentOpen(account.user as unknown as { id: string; role: string }).catch(() => false))) return json(rpcError(null, -32003, AGENT_CLOSED), 403);
  // A runaway agent is slowed down before it runs up Google's limits or the account's credits.
  const minute = 'stakeout:mcp:' + account.keyId + ':' + Math.floor(Date.now() / 60000);
  const used = await redis().incr(minute).catch(() => 0);
  if (used === 1) await redis().expire(minute, 120).catch(() => {});
  if (used > PER_MINUTE) return json(rpcError(null, -32002, 'Too many requests: this key is limited to ' + PER_MINUTE + ' a minute.'), 429, { 'Retry-After': '30' });

  let body: unknown;
  try { body = await req.json(); } catch { return json(rpcError(null, -32700, 'The request is not valid JSON.'), 400); }
  const origin = new URL(req.url).origin;
  const user = account.user as unknown as ActingUser;

  const one = async (m: Rpc): Promise<object | null> => {
    const a = rpcAnswer(m);
    if (a !== 'call') return a;
    const p = (m.params && typeof m.params === 'object' ? m.params : {}) as { name?: unknown; arguments?: unknown };
    const args = (p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments) ? p.arguments : {}) as Record<string, unknown>;
    try {
      const out = await runTool(user, String(p.name ?? ''), args, origin);
      return rpcResult(m.id, { content: [{ type: 'text', text: JSON.stringify(out) }], isError: false });
    } catch (e) {
      // What went wrong goes back to the agent as the tool's answer, so it can put it right or tell its person.
      if (!(e instanceof InputError)) console.error('[mcp] tool failed', String(p.name), e instanceof Error ? e.message : e);
      return rpcResult(m.id, { content: [{ type: 'text', text: e instanceof InputError ? e.message : 'Stakeout could not do that right now. Try again in a minute.' }], isError: true });
    }
  };

  if (Array.isArray(body)) {
    if (!body.length || body.length > 20) return json(rpcError(null, -32600, 'Send between 1 and 20 requests at a time.'), 400);
    const out: object[] = [];
    for (const m of body) { const a = await one((m ?? {}) as Rpc); if (a) out.push(a); }
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const a = await one((body ?? {}) as Rpc);
  return a ? json(a) : new Response(null, { status: 202 });
}

/** This server answers each request in full: there is no stream to open. */
export const GET = () => json(rpcError(null, -32000, 'Use POST.'), 405, { Allow: 'POST' });
export const DELETE = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
