import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { duoplusPost } from '@stakeout/core/redis';

const run = promisify(execFile);

/**
 * How the worker runs shell commands on a phone.
 *
 * ADB (default when the phone has an ADB address): direct connection to the phone,
 * no DuoPlus API call, so it does not count against the 1 request/second limit.
 * Allow-list the worker's static outbound IPs in DuoPlus's ADB IP whitelist.
 *
 * API (fallback, or DEVICE_TRANSPORT=api): DuoPlus's cloudPhone/command endpoint,
 * one rate-limited request per command.
 */
export type ShellTarget = { imageId: string; adbAddr: string | null };

export function transportFor(d: ShellTarget): 'adb' | 'api' {
  return process.env.DEVICE_TRANSPORT === 'api' || !d.adbAddr ? 'api' : 'adb';
}

const connected = new Set<string>();
/** ADB passwords reported by DuoPlus's phone list (adb_password), by ADB address. */
const adbPasswords = new Map<string, string>();
export function setAdbPassword(addr: string, password: string | null | undefined) {
  if (password) adbPasswords.set(addr, password);
  else adbPasswords.delete(addr);
}

const errText = (e: unknown) => {
  const x = e as { stderr?: unknown; message?: unknown; killed?: boolean };
  const raw = String(x?.stderr || x?.message || e || '').replace(/\s+/g, ' ').trim();
  return (x?.killed ? 'timed out; ' : '') + raw.slice(0, 160);
};

async function ensureConnected(addr: string) {
  if (connected.has(addr)) return;
  const { stdout } = await run('adb', ['connect', addr], { timeout: 15000 });
  if (!/connected to|already connected/i.test(stdout))
    throw new Error('ADB_CONNECT_FAILED ' + stdout.replace(/\s+/g, ' ').slice(0, 120));
  // Phones with an ADB password need a login after connecting (adb shell glogin <password>).
  const pw = adbPasswords.get(addr);
  if (pw) {
    const r = await run('adb', ['-s', addr, 'shell', 'glogin', pw], { timeout: 10000 }).catch((e) => ({ stdout: 'error: ' + errText(e) }));
    console.log('[adb] login on', addr, '·', String(r.stdout).replace(/\s+/g, ' ').slice(0, 80));
  }
  connected.add(addr);
}

/**
 * Whether a failed adb call means the phone could not be reached (reconnect and try again), rather
 * than a shell command that ran on the phone and ended with a non-zero status, as `test -f` or
 * `cat` of a missing file do. Reconnecting for those drops every other ADB stream open to that
 * phone (a forwarded DevTools socket, another shell): they are reported as a plain failure instead.
 */
export function adbUnreachable(e: unknown, args: string[]): boolean {
  const x = e as { code?: unknown; killed?: boolean; signal?: unknown; stderr?: unknown };
  if (args[0] !== 'shell') return true;
  // Timed out or killed: the link may be dead. No exit status, or adb's own 255: adb itself failed.
  if (x?.killed || x?.signal || typeof x?.code !== 'number' || x.code === 255) return true;
  return /(^|\n)\s*(adb: )?error: |device (offline|not found|unauthorized|still authorizing)|no devices\/emulators|protocol fault|connection (reset|refused)|broken pipe/i.test(
    String(x?.stderr ?? ''),
  );
}

const reconnectLogged = new Map<string, number>();

async function adb(addr: string, args: string[], timeoutMs: number) {
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureConnected(addr);
      const { stdout } = await run('adb', ['-s', addr, ...args], {
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      });
      return stdout;
    } catch (e) {
      last = errText(e);
      // The command ran and ended with an error status: the phone is fine, nothing to reconnect.
      if (!adbUnreachable(e, args)) break;
      // Dropped connection: reconnect once, then give up.
      if (Date.now() - (reconnectLogged.get(addr) ?? 0) > 60000) {
        reconnectLogged.set(addr, Date.now());
        console.warn('[adb] reconnecting', addr, 'after', (args[0] === 'shell' ? 'shell ' + String(args[1] ?? '').split(' ')[0] : args[0]) + ':', last.slice(0, 120));
      }
      connected.delete(addr);
      await run('adb', ['disconnect', addr], { timeout: 5000 }).catch(() => {});
    }
  }
  // Say which command failed and why, so a failure can be fixed rather than guessed at.
  const what = args[0] === 'shell' ? 'shell ' + String(args[1] ?? '').split(' ')[0] : args[0];
  throw new Error('ADB_COMMAND_FAILED ' + what + ': ' + last);
}

/** Runs one shell command on the phone and returns its output. */
export async function shell(d: ShellTarget, command: string, timeoutMs = 30000) {
  if (transportFor(d) === 'adb') return adb(d.adbAddr!, ['shell', command], timeoutMs);
  const res = await duoplusPost('/api/v1/cloudPhone/command', {
    image_id: d.imageId,
    command,
  });
  return String(res?.data?.content ?? '');
}

/** Writes a file on the phone. ADB: one push. API: base64 in chunks (several requests). */
export async function push(d: ShellTarget, path: string, content: string, mode = '755') {
  if (transportFor(d) === 'adb') {
    const dir = await mkdtemp(join(tmpdir(), 'stakeout-push-'));
    try {
      const local = join(dir, 'file');
      await writeFile(local, content);
      await adb(d.adbAddr!, ['shell', `mkdir -p "$(dirname ${path})"`], 15000);
      await adb(d.adbAddr!, ['push', local, path], 60000);
      await adb(d.adbAddr!, ['shell', `chmod ${mode} ${path}`], 15000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    return;
  }
  const tmp = path + '.b64';
  const chunks = Buffer.from(content, 'utf8').toString('base64').match(/.{1,700}/g) ?? [];
  await shell(d, `mkdir -p "$(dirname ${path})"; rm -f ${tmp} ${path}`);
  for (const chunk of chunks) await shell(d, `echo -n ${chunk} >> ${tmp}`);
  await shell(d, `base64 -d ${tmp} > ${path} && chmod ${mode} ${path}; rm -f ${tmp}`);
}

/** Copies a file from the phone to the worker over ADB (no API call, no proxy data). */
export async function pull(d: ShellTarget, remotePath: string, localPath: string, timeoutMs = 120000) {
  if (transportFor(d) !== 'adb') throw new Error('PULL_NEEDS_ADB');
  await adb(d.adbAddr!, ['pull', remotePath, localPath], timeoutMs);
}

/**
 * Read-only check: does Chrome on the phone answer on its DevTools socket through our ADB
 * connection? (Needed to save each results page's HTML.) Lists the phone's DevTools sockets,
 * forwards a free local port to Chrome's, and reads only its version and how many tabs are open.
 * Nothing on the page is touched; no tab addresses are kept.
 */
export async function devtoolsProbe(d: ShellTarget): Promise<{ ok: boolean; sockets: string; browser: string | null; tabs: number | null; error: string | null }> {
  if (transportFor(d) !== 'adb') return { ok: false, sockets: '', browser: null, tabs: null, error: 'no ADB address' };
  const sockets = (
    await adb(d.adbAddr!, ['shell', 'grep -o "@[A-Za-z0-9_.]*devtools[A-Za-z0-9_.]*" /proc/net/unix | sort -u'], 15000).catch((e) => 'error: ' + errText(e))
  )
    .replace(/\s+/g, ' ')
    .trim();
  let port = '';
  try {
    port = (await adb(d.adbAddr!, ['forward', 'tcp:0', 'localabstract:chrome_devtools_remote'], 15000)).trim();
    if (!/^\d+$/.test(port)) return { ok: false, sockets, browser: null, tabs: null, error: 'forward gave "' + port.slice(0, 60) + '"' };
    const get = (path: string) => fetch('http://127.0.0.1:' + port + path, { signal: AbortSignal.timeout(6000) }).then((r) => r.json() as Promise<unknown>);
    const version = (await get('/json/version')) as { Browser?: string };
    const list = (await get('/json/list').catch(() => null)) as { type?: string }[] | null;
    return {
      ok: Boolean(version?.Browser),
      sockets,
      browser: version?.Browser ?? null,
      tabs: Array.isArray(list) ? list.filter((t) => t?.type === 'page').length : null,
      error: null,
    };
  } catch (e) {
    return { ok: false, sockets, browser: null, tabs: null, error: errText(e) };
  } finally {
    if (/^\d+$/.test(port)) await adb(d.adbAddr!, ['forward', '--remove', 'tcp:' + port], 10000).catch(() => {});
  }
}

/** Forwards a free local port to Chrome's DevTools socket on the phone, over the ADB connection; returns the port. */
export async function forwardDevtools(d: ShellTarget): Promise<number> {
  if (transportFor(d) !== 'adb') throw new Error('DEVTOOLS_NEEDS_ADB');
  const out = (await adb(d.adbAddr!, ['forward', 'tcp:0', 'localabstract:chrome_devtools_remote'], 15000)).trim();
  if (!/^\d+$/.test(out)) throw new Error('DEVTOOLS_FORWARD ' + out.slice(0, 60));
  return Number(out);
}

/**
 * Removes that forward. Never reconnects the phone on failure (a forward a dropped link already
 * removed is not worth dropping the phone's other streams for).
 */
export async function unforwardDevtools(d: ShellTarget, port: number) {
  if (transportFor(d) === 'adb') await run('adb', ['-s', d.adbAddr!, 'forward', '--remove', 'tcp:' + port], { timeout: 10000 });
}
