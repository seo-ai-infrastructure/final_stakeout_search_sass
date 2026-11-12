/** Transactional email through Resend's HTTP API. Configure RESEND_API_KEY, EMAIL_FROM and APP_URL. */
export const mailerConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL);

export function appUrl(path: string) {
  return process.env.APP_URL!.replace(/\/$/, '') + path;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function sendLinkEmail(to: string, subject: string, intro: string, action: string, url: string) {
  if (!mailerConfigured()) throw new Error('MAILER_NOT_CONFIGURED');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text: intro + '\n\n' + action + ': ' + url + '\n\nThis link expires in 24 hours. If you did not request it, ignore this email.',
      html:
        '<p>' + escape(intro) + '</p><p><a href="' + escape(url) + '">' + escape(action) +
        '</a></p><p style="color:#666">This link expires in 24 hours. If you did not request it, ignore this email.</p>',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('MAIL_SEND_FAILED_' + r.status);
}

/** A plain notice: a few lines of text and, optionally, one link. Nothing about expiring links. */
export async function sendNoticeEmail(to: string, subject: string, lines: string[], link?: { label: string; url: string }) {
  if (!mailerConfigured()) throw new Error('MAILER_NOT_CONFIGURED');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text: lines.join('\n\n') + (link ? '\n\n' + link.label + ': ' + link.url : ''),
      html: lines.map((l) => '<p>' + escape(l) + '</p>').join('') + (link ? '<p><a href="' + escape(link.url) + '">' + escape(link.label) + '</a></p>' : ''),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('MAIL_SEND_FAILED_' + r.status);
}
