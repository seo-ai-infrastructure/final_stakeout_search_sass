import type { Review } from './gbpReviews';

/** The email for a low-star review: which listing, how many stars, who, and what they wrote. */
export function reviewAlert(r: Pick<Review, 'stars' | 'author' | 'text'>, listing: string): { subject: string; lines: string[] } {
  const stars = r.stars ?? 0;
  const text = r.text.trim();
  return {
    subject: `Stakeout: new ${stars}-star review on ${listing}`,
    lines: [
      `${r.author} left ${stars} star${stars === 1 ? '' : 's'} on ${listing}.`,
      text ? '“' + (text.length > 600 ? text.slice(0, 597) + '…' : text) + '”' : 'A rating only, with no words.',
      'A calm, specific reply within a day does the most good. Reviews reach us from Google within the hour.',
    ],
  };
}
