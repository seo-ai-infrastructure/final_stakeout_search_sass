const SANDBOX = 'https://api-m.sandbox.paypal.com';
const LIVE = 'https://api-m.paypal.com';

/**
 * The PayPal API address for PAYPAL_API_BASE. Unset means the sandbox. The obvious variations of
 * the two real addresses are accepted (spaces, a trailing slash, no https://, the older
 * api.paypal.com hosts, or just "sandbox" / "live"); anything else is refused, since requests
 * carry the account's credentials and must only ever go to PayPal.
 */
export function paypalBase(raw: string | undefined): string {
  const v = (raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (v === '' || v === 'sandbox' || v === 'api-m.sandbox.paypal.com' || v === 'api.sandbox.paypal.com') return SANDBOX;
  if (v === 'live' || v === 'production' || v === 'api-m.paypal.com' || v === 'api.paypal.com') return LIVE;
  throw new Error(`PAYPAL_API_BASE must be ${SANDBOX} (testing) or ${LIVE} (real payments).`);
}
