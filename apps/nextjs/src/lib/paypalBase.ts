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

/**
 * A PayPal refusal in plain words. `issue` is PayPal's own code (details[0].issue, or the error
 * name); `field` is the part of the request it points at. The code is kept in the message so it
 * can be looked up.
 */
export function paypalProblem(issue: string, field = ''): string {
  if (/PAYEE|MERCHANT/i.test(issue) || /payee/i.test(field))
    return `PayPal did not accept the merchant ID (${issue}). PAYPAL_MERCHANT_ID must be the merchant ID of the PayPal business account that the client ID and secret belong to, in the same environment (sandbox or live).`;
  if (/PERMISSION_DENIED|NOT_AUTHORIZED|AUTHORIZATION/i.test(issue))
    return `This PayPal app is not allowed to do that (${issue}). Check the app's permissions in the PayPal developer dashboard.`;
  if (/INSTRUMENT_DECLINED|PAYER_ACTION_REQUIRED|PAYER_CANNOT_PAY/i.test(issue))
    return `PayPal declined that payment method (${issue}). Try another one.`;
  if (/ORDER_NOT_APPROVED/i.test(issue)) return 'The payment was not approved in PayPal.';
  return `PayPal could not complete this operation (${issue}).`;
}
