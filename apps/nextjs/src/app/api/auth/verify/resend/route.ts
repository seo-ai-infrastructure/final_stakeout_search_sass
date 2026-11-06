import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { limit } from '@/lib/limits';
import { sendVerification } from '@/lib/verification';
import { InputError } from '@stakeout/core/grid';

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (user.emailVerifiedAt) return Response.json({ sent: false, verified: true });
    await limit('verify-resend', user.id, 3, 3600);
    if (!(await sendVerification(user)))
      throw new InputError('Email delivery is not configured. Contact support.', 503);
    return Response.json({ sent: true });
  } catch (e) {
    return errorResponse(e);
  }
}
