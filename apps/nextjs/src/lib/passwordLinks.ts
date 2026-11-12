import { issueToken } from './emailTokens';
import { appUrl, mailerConfigured, sendNoticeEmail } from './mailer';

/** Emails a link to choose a password. Returns the link, for an admin to pass on by hand. */
export async function sendPasswordLink(user: { id: string; email: string }, opts: { days: number; invited: boolean }) {
  const token = await issueToken('SET_PASSWORD', user.email, { userId: user.id }, opts.days * 86400000);
  const url = appUrl('/set-password?token=' + token);
  let emailed = false;
  if (mailerConfigured()) {
    const life = opts.days === 1 ? '24 hours' : opts.days + ' days';
    await sendNoticeEmail(
      user.email,
      opts.invited ? 'Your Stakeout Search account is ready' : 'Set your Stakeout Search password',
      opts.invited
        ? ['An account has been created for you at Stakeout Search.', `Choose your password with the link below. It works once and expires in ${life}.`]
        : ['Use the link below to choose a new password for your Stakeout Search account.', `It works once and expires in ${life}. If you did not ask for this, ignore this email: your password has not changed.`],
      { label: 'Choose your password', url },
    )
      .then(() => (emailed = true))
      .catch((e) => console.error('[password] link email not sent:', (e as Error).message));
  }
  return { url, emailed };
}
