/**
 * The VoidMob login mobile points use. With VOIDMOB_API_KEY and VOIDMOB_PROXY_ID set, it is the
 * package's own Flex login, read from VoidMob (and re-read every 10 minutes, keeping the last good one
 * if VoidMob cannot be reached): buying a new package then only needs VOIDMOB_PROXY_ID changed.
 * Otherwise the fixed VOIDMOB_USERNAME and VOIDMOB_PASSWORD.
 */
import { fetchFlexLogin, voidmobEndpoint, type FlexLogin } from '@stakeout/core/voidmob';

const REFRESH_MS = 10 * 60000;
/** After VoidMob gave no login, wait this long before asking again (points meanwhile use the fallback). */
const RETRY_MS = 60000;
let cached: { login: FlexLogin; at: number } | null = null;
let failed: { proxyId: string; at: number } | null = null;
let note = '';

/** For the admin page: where the mobile login comes from ("package prx_…" or "VOIDMOB_USERNAME"). */
export const voidmobLoginNote = () => note;

export async function voidmobLogin(): Promise<FlexLogin & { from: string }> {
  const key = process.env.VOIDMOB_API_KEY?.trim(),
    id = process.env.VOIDMOB_PROXY_ID?.trim();
  if (key && id) {
    if (cached?.login.proxyId === id && Date.now() - cached.at < REFRESH_MS) return { ...cached.login, from: 'package ' + id };
    // After a failed ask, wait a minute before asking again (the last good login, or the fixed one, meanwhile).
    if (!(failed?.proxyId === id && Date.now() - failed.at < RETRY_MS)) {
      try {
        const r = await fetchFlexLogin(key, id);
        if (r.login) {
          if (cached?.login.proxyId !== id || cached.login.username !== r.login.username || cached.login.password !== r.login.password)
            console.log('[voidmob] mobile login: package', id, 'Flex gateway', r.login.host + ':' + r.login.port, '(read from VoidMob)');
          cached = { login: r.login, at: Date.now() };
          failed = null;
          note = 'package ' + id;
          return { ...r.login, from: note };
        }
        failed = { proxyId: id, at: Date.now() };
        console.warn('[voidmob] VoidMob gave no Flex login for package', id, '(HTTP ' + r.status + (r.code ? ' ' + r.code : '') + ')');
      } catch (e) {
        failed = { proxyId: id, at: Date.now() };
        console.warn('[voidmob] could not reach VoidMob for the Flex login of package', id, '-', e instanceof Error ? e.message : String(e));
      }
    }
    if (cached?.login.proxyId === id) return { ...cached.login, from: 'package ' + id };
  }
  const username = process.env.VOIDMOB_USERNAME?.trim(),
    password = process.env.VOIDMOB_PASSWORD;
  if (username && password) {
    const { host, port } = voidmobEndpoint();
    note = 'VOIDMOB_USERNAME';
    return { proxyId: id ?? '', host, port, username, password, from: note };
  }
  throw new Error('MOBILE_DATA_NOT_CONFIGURED VoidMob gave no login: check VOIDMOB_API_KEY and VOIDMOB_PROXY_ID on the worker');
}
