/**
 * The grid sizes a new scan can use right now. 11×11 is switched off for the moment; add 11
 * back here to offer it again. Older scans of any size still open, re-run and
 * repeat on schedule: only starting a new one is limited.
 *
 * Kept in its own file with no imports, so the New scan page (which runs in the browser) can
 * read it without pulling in the server-side grid code and its ZIP code database.
 */
export const OFFERED_GRID_SIZES: readonly number[] = [3, 5, 7, 9];
