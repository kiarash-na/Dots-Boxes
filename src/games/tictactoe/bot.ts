// ─── Tic-tac-toe — bot strategies ──────────────────────────────────────────
// Easy plays at random, medium wins or blocks when it sees it, hard searches
// the whole game tree (memoised: under 6,000 positions) and never loses.

import type { Difficulty } from '../../game/bot';
import type { PlayerId } from '../../game/engine';
import { LINES, applyMove, freeCells } from './engine';
import type { Cell, TttState } from './engine';

export const TTT_DIFFICULTIES: Array<{ key: Difficulty; label: string; blurb: string }> = [
  { key: 'easy', label: 'Easy', blurb: 'Plays at random' },
  { key: 'medium', label: 'Medium', blurb: 'Wins and blocks when it can' },
  { key: 'hard', label: 'Hard', blurb: 'Never loses' },
];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Empty cells that would complete a line for `p`. */
function finishers(cells: readonly Cell[], p: PlayerId): number[] {
  const out = new Set<number>();
  for (const line of LINES) {
    const mine = line.filter((i) => cells[i] === p).length;
    const empty = line.filter((i) => cells[i] === -1);
    if (mine === 2 && empty.length === 1) out.add(empty[0]);
  }
  return [...out];
}

const memo = new Map<string, number>();

/** Best achievable score for the player to move: >0 win, 0 draw, <0 loss. */
function negamax(s: TttState): number {
  if (s.over) {
    // The winner (if any) is the player who just moved — the opponent of
    // `current`. Prefer quick wins and slow losses.
    return s.winner === null ? 0 : -(10 - s.turn);
  }
  const key = s.cells.join('') + s.current;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = -Infinity;
  for (const c of freeCells(s)) best = Math.max(best, -negamax(applyMove(s, c)!));
  memo.set(key, best);
  return best;
}

export function chooseCell(s: TttState, d: Difficulty): number {
  const free = freeCells(s);
  if (d === 'easy') return pick(free);

  if (d === 'medium') {
    const win = finishers(s.cells, s.current);
    if (win.length > 0) return pick(win);
    const block = finishers(s.cells, (1 - s.current) as PlayerId);
    if (block.length > 0) return pick(block);
    if (s.cells[4] === -1 && Math.random() < 0.5) return 4;
    return pick(free); // no lookahead: forks catch it out
  }

  // hard: any move with the best minimax value (random among equals for variety)
  let best = -Infinity;
  let bestCells: number[] = [];
  for (const c of free) {
    const v = -negamax(applyMove(s, c)!);
    if (v > best) {
      best = v;
      bestCells = [c];
    } else if (v === best) {
      bestCells.push(c);
    }
  }
  return pick(bestCells);
}
