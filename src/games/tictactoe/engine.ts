// ─── Tic-tac-toe — game engine ─────────────────────────────────────────────
// 3×3 cells indexed 0–8 row by row. Red plays X, Blue plays O. Pure functions
// over plain data (no React), like the Dots & Boxes engine — so a server can
// run the same rules later.

import type { PlayerId } from '../../game/engine';

export const SIZE = 3;

/** Owner of a cell, or -1 when empty. */
export type Cell = PlayerId | -1;

export type Line = readonly [number, number, number];

export interface TttState {
  cells: Cell[]; // length 9
  current: PlayerId; // whose turn it is
  turn: number; // marks placed so far
  over: boolean;
  winner: PlayerId | null; // null while playing, or on a draw
  line: Line | null; // the three winning cells
}

export const LINES: readonly Line[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function newGame(first: PlayerId = 0): TttState {
  return {
    cells: Array<Cell>(SIZE * SIZE).fill(-1),
    current: first,
    turn: 0,
    over: false,
    winner: null,
    line: null,
  };
}

export function findWin(cells: readonly Cell[]): { winner: PlayerId; line: Line } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const owner = cells[a];
    if (owner !== -1 && owner === cells[b] && owner === cells[c]) return { winner: owner, line };
  }
  return null;
}

/** Place the current player's mark. Returns null for an illegal move. */
export function applyMove(s: TttState, cell: number): TttState | null {
  if (s.over || !Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return null;
  if (s.cells[cell] !== -1) return null;

  const cells = s.cells.slice();
  cells[cell] = s.current;
  const win = findWin(cells);
  const turn = s.turn + 1;
  return {
    cells,
    current: (1 - s.current) as PlayerId,
    turn,
    over: win !== null || turn === SIZE * SIZE,
    winner: win?.winner ?? null,
    line: win?.line ?? null,
  };
}

export function freeCells(s: TttState): number[] {
  const out: number[] = [];
  s.cells.forEach((c, i) => c === -1 && out.push(i));
  return out;
}
