// ─── Dots & Boxes — bot strategies ────────────────────────────────────────
// Pure functions over GameState. All strategies are O(edges × boxes) worst
// case — microseconds on this board, no search tree.

import {
  BOXES,
  DOTS,
  adjacentBoxes,
  applyMove,
  boxIndex,
  hIndex,
  vIndex,
} from './engine';
import type { Edge, GameState } from './engine';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Array<{ key: Difficulty; label: string; blurb: string }> = [
  { key: 'easy', label: 'Easy', blurb: 'Plays at random' },
  { key: 'medium', label: 'Medium', blurb: 'Takes boxes, avoids gifts' },
  { key: 'hard', label: 'Hard', blurb: 'Thinks about chains' },
];

export function chooseMove(s: GameState, d: Difficulty): Edge {
  const free = freeEdges(s);
  if (d === 'easy') return pick(free);

  const captures = captureMoves(s);
  if (captures.length > 0) return pick(captures); // always take a box

  const safe = free.filter((e) => !givesAwayBox(s, e));
  if (safe.length > 0) return pick(safe); // don't hand over a 3rd side

  if (d === 'medium') return pick(free); // forced: random sacrifice
  return minChainSacrifice(s, free); // hard: open the smallest chain
}

function freeEdges(s: GameState): Edge[] {
  const out: Edge[] = [];
  for (let r = 0; r < DOTS; r++)
    for (let c = 0; c < BOXES; c++)
      if (s.h[hIndex(r, c)] === -1) out.push({ orientation: 'h', row: r, col: c });
  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < DOTS; c++)
      if (s.v[vIndex(r, c)] === -1) out.push({ orientation: 'v', row: r, col: c });
  return out;
}

function sideCount(s: GameState, br: number, bc: number): number {
  return (
    (s.h[hIndex(br, bc)] !== -1 ? 1 : 0) +
    (s.h[hIndex(br + 1, bc)] !== -1 ? 1 : 0) +
    (s.v[vIndex(br, bc)] !== -1 ? 1 : 0) +
    (s.v[vIndex(br, bc + 1)] !== -1 ? 1 : 0)
  );
}

/** Free edges that complete at least one box right now. */
function captureMoves(s: GameState): Edge[] {
  return freeEdges(s).filter((e) =>
    adjacentBoxes(e).some(
      ([br, bc]) => s.boxes[boxIndex(br, bc)] === -1 && sideCount(s, br, bc) === 3
    )
  );
}

/** Would playing e leave an adjacent unclaimed box with exactly 3 sides? */
function givesAwayBox(s: GameState, e: Edge): boolean {
  return adjacentBoxes(e).some(
    ([br, bc]) => s.boxes[boxIndex(br, bc)] === -1 && sideCount(s, br, bc) === 2
  );
}

/**
 * Hard's endgame: when every move opens a chain, open the shortest one.
 * Simulate the candidate, then greedily let the opponent sweep captures
 * (the extra-turn rule inside applyMove does the chaining) and count losses.
 */
function minChainSacrifice(s: GameState, candidates: Edge[]): Edge {
  let best: Edge[] = [];
  let bestCost = Infinity;
  for (const e of candidates) {
    let sim = applyMove(s, e)!.next; // no captures here — filtered earlier
    let cost = 0;
    for (;;) {
      const caps = captureMoves(sim);
      if (caps.length === 0) break;
      const r = applyMove(sim, caps[0])!;
      cost += r.completedBoxes.length;
      sim = r.next;
      if (sim.over) break;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = [e];
    } else if (cost === bestCost) {
      best.push(e);
    }
  }
  return pick(best);
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
