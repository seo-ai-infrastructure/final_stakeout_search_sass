import { db } from '@stakeout/db';
import { issueToken } from './emailTokens';
import { appUrl, mailerConfigured, sendLinkEmail } from './mailer';

/** Turn off only on disposable test instances: it hands starter credits to unverified signups. */
export const verificationRequired = () => process.env.EMAIL_VERIFICATION_REQUIRED !== 'false';

export const welcomeCredits = () => {
  const n = Number(process.env.WELCOME_CREDITS ?? 150);
  return Number.isSafeInteger(n) && n >= 0 && n <= 10000 ? n : 150;
};

/** Emails a verification link. Returns false when no mailer is configured. */
export async function sendVerification(user: { id: string; email: string }) {
  if (!mailerConfigured()) return false;
  const token = await issueToken('VERIFY_EMAIL', user.email, { userId: user.id });
  await sendLinkEmail(
    user.email,
    'Confirm your Stakeout email',
    'Confirm this address to activate your agency account and receive ' +
      welcomeCredits() + ' starter credits.',
    'Confirm email',
    appUrl('/api/auth/verify?token=' + token),
  );
  return true;
}

/** Marks the email verified and grants starter credits at most once per account. */
export async function completeVerification(userId: string) {
  const credits = welcomeCredits();
  await db.$transaction(async (tx) => {
    const marked = await tx.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    if (!marked.count || !credits) return;
    await tx.creditLedger.create({
      data: { userId, amount: credits, reason: 'WELCOME_GRANT', externalEventId: 'welcome:' + userId },
    });
    await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: credits } } });
  });
}
