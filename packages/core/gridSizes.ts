/**
 * The grid sizes a new scan can use right now. 11×11 is switched off for the moment; add 11
 * back here to offer it again. Older scans of any size still open, re-run and
 * repeat on schedule: only starting a new one is limited.
 *
 * Kept in its own file with no imports, so the New scan page (which runs in the browser) can
 * read it without pulling in the server-side grid code and its ZIP code database.
 */
export const OFFERED_GRID_SIZES: readonly number[] = [3, 5, 7, 9];

/**
 * Points the customer chose to leave out of a grid (water, empty land), as "row_col" keys.
 * Only whole points inside the grid count, the centre can never be skipped, and anything
 * else in the list is ignored.
 */
export function skippedPoints(input: unknown, gridSize: number): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(input)) return out;
  const mid = (gridSize - 1) / 2;
  for (const v of input.slice(0, 200)) {
    const m = typeof v === 'string' ? /^(\d{1,2})_(\d{1,2})$/.exec(v) : null;
    if (!m) continue;
    const r = Number(m[1]), c = Number(m[2]);
    if (r >= gridSize || c >= gridSize || (r === mid && c === mid)) continue;
    out.add(r + '_' + c);
  }
  return out;
}

export type GridShape = 'square' | 'custom' | 'round';

/**
 * A grid shape is the square grid with some points left out, as "row_col" keys:
 *  - custom: only the middle `rows` × `cols` points stay (a wide or tall rectangle);
 *  - round: the corners are trimmed off, leaving a rough circle.
 * Rows and columns are odd and no larger than the grid, so the business stays at the centre.
 */
export function shapeSkips(shape: GridShape, gridSize: number, rows = gridSize, cols = gridSize): string[] {
  if (shape === 'square') return [];
  const mid = (gridSize - 1) / 2;
  const odd = (v: number) => { const n = Math.max(1, Math.min(gridSize, Math.floor(v))); return n % 2 ? n : n - 1; };
  const halfR = (odd(rows) - 1) / 2, halfC = (odd(cols) - 1) / 2;
  const out: string[] = [];
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) {
      const dy = r - mid, dx = c - mid;
      const gone = shape === 'custom' ? Math.abs(dy) > halfR || Math.abs(dx) > halfC : (dx * dx + dy * dy) / (mid * mid) > 1.3;
      if (gone && !(dy === 0 && dx === 0)) out.push(r + '_' + c);
    }
  return out;
}
