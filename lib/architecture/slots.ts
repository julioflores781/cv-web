/** The six node positions of the design, in % of the plane (0 top, then clockwise). */
export const POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [50, 12],
  [82.9, 31],
  [82.9, 69],
  [50, 88],
  [17.1, 69],
  [17.1, 31],
];

/** Positions used by N ports (1..6), clockwise so that Tab follows the visual reading order. */
export const SLOTS: Readonly<Record<number, readonly number[]>> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [1, 2, 4, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

/** More ports than this do not fit the plane: they go in a list under it. */
export const MAX_RADIAL = 6;
