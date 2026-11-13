/** Shared, illustrative data so every section of the home page tells the same story. */

/** The example grid's size: every illustration on the home page is one 5×5 scan. */
export const GRID_N = 5;

/** Rank at each point of the 5×5 phone wall (21 = not in the top 20). Strongest near the centre. */
export const WALL = [
  9, 6, 4, 7, 12,
  5, 3, 2, 3, 8,
  4, 1, 1, 2, 6,
  7, 2, 3, 4, 11,
  21, 8, 5, 9, 15,
];

/** 1 = the AI answer named the business at that point. Irregular, like real data. */
export const AI_NAMED = [
  0, 0, 1, 0, 0,
  0, 1, 1, 0, 0,
  1, 0, 1, 1, 0,
  0, 0, 0, 1, 0,
  0, 0, 0, 0, 0,
];

/** The real 5×5, 1-mile grid the app builds around Mt. Juliet, TN (36.2001, −86.5186), with each point's ZIP code. */
export const GRID_LATS = [36.229046, 36.214573, 36.2001, 36.185627, 36.171154];
export const GRID_LNGS = [-86.554471, -86.536535, -86.5186, -86.500665, -86.482729];
export const GRID_ZIPS = [
  '37121', '37121', '37121', '37121', '37121',
  '37121', '37121', '37121', '37121', '37122',
  '37121', '37121', '37121', '37122', '37122',
  '37121', '37121', '37122', '37122', '37122',
  '37076', '37121', '37122', '37122', '37122',
];

export function rankStyle(r: number) {
  if (r <= 3) return { bg: '#3ddc97', ink: '#04130c' };
  if (r <= 10) return { bg: '#f5c451', ink: '#1a1300' };
  if (r <= 20) return { bg: '#ff8a4c', ink: '#1f0b00' };
  return { bg: '#2a3442', ink: '#9aa7b8' };
}
