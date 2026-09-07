// ─── Dots & Boxes — game engine ───────────────────────────────────────────
// 10×10 dots → 9×9 = 81 boxes. Horizontal edges: 10 rows × 9, vertical: 9 × 10.

export const DOTS = 10;
export const BOXES = DOTS - 1; // 9

export type PlayerId = 0 | 1;

export interface Player {
  name: string;
  initials: string;
  color: string;
  soft: string; // translucent fill for captured boxes
}

export const RED: Player = {
  name: 'Red',
  initials: 'R',
  color: '#FF1E1E',
  soft: 'rgba(255, 30, 30, 0.10)',
};

export const BLUE: Player = {
  name: 'Blue',
  initials: 'B',
  color: '#004EFF',
  soft: 'rgba(0, 78, 255, 0.10)',
};

export function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface Edge {
  orientation: 'h' | 'v';
  row: number;
  col: number;
}

export interface MoveResult {
  next: GameState;
  completedBoxes: number[]; // box indices captured by this move
}

export interface GameState {
  // h[r][c]: edge between dot (r,c) and (r,c+1) — owner or -1
  h: Int8Array; // length DOTS * BOXES = 90
  // v[r][c]: edge between dot (r,c) and (r+1,c) — owner or -1
  v: Int8Array; // length BOXES * DOTS = 90
  // owner of box (r,c) → boxes[r*BOXES + c], -1 if unclaimed
  boxes: Int8Array; // length BOXES * BOXES = 81
  current: PlayerId;
  turn: number; // lines drawn so far
  over: boolean;
}

export function newGame(): GameState {
  return {
    h: new Int8Array(DOTS * BOXES).fill(-1),
    v: new Int8Array(BOXES * DOTS).fill(-1),
    boxes: new Int8Array(BOXES * BOXES).fill(-1),
    current: 0,
    turn: 0,
    over: false,
  };
}

export const hIndex = (r: number, c: number) => r * BOXES + c;
export const vIndex = (r: number, c: number) => r * DOTS + c;
export const boxIndex = (r: number, c: number) => r * BOXES + c;

export function edgeOwner(s: GameState, e: Edge): number {
  return e.orientation === 'h' ? s.h[hIndex(e.row, e.col)] : s.v[vIndex(e.row, e.col)];
}

export function isBoxComplete(s: GameState, br: number, bc: number): boolean {
  return (
    s.h[hIndex(br, bc)] !== -1 &&
    s.h[hIndex(br + 1, bc)] !== -1 &&
    s.v[vIndex(br, bc)] !== -1 &&
    s.v[vIndex(br, bc + 1)] !== -1
  );
}

/** Boxes adjacent to an edge (0–2 candidates). */
function adjacentBoxes(e: Edge): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (e.orientation === 'h') {
    if (e.row > 0) out.push([e.row - 1, e.col]); // box above
    if (e.row < BOXES) out.push([e.row, e.col]); // box below
  } else {
    if (e.col > 0) out.push([e.row, e.col - 1]); // box left
    if (e.col < BOXES) out.push([e.row, e.col]); // box right
  }
  return out;
}

/** Apply a move. Classic rule: capturing a box grants an extra turn. */
export function applyMove(s: GameState, e: Edge): MoveResult | null {
  if (s.over || edgeOwner(s, e) !== -1) return null;

  const h = Int8Array.from(s.h);
  const v = Int8Array.from(s.v);
  const boxes = Int8Array.from(s.boxes);

  if (e.orientation === 'h') h[hIndex(e.row, e.col)] = s.current;
  else v[vIndex(e.row, e.col)] = s.current;

  const completedBoxes: number[] = [];
  const probe: GameState = { h, v, boxes, current: s.current, turn: s.turn, over: s.over };
  for (const [br, bc] of adjacentBoxes(e)) {
    const bi = boxIndex(br, bc);
    if (boxes[bi] === -1 && isBoxComplete(probe, br, bc)) {
      boxes[bi] = s.current;
      completedBoxes.push(bi);
    }
  }

  const turn = s.turn + 1;
  const totalEdges = DOTS * BOXES * 2;
  return {
    next: {
      h,
      v,
      boxes,
      current: (completedBoxes.length > 0 ? s.current : 1 - s.current) as PlayerId,
      turn,
      over: turn >= totalEdges,
    },
    completedBoxes,
  };
}

export function scores(s: GameState): [number, number] {
  let a = 0;
  let b = 0;
  for (let i = 0; i < s.boxes.length; i++) {
    if (s.boxes[i] === 0) a++;
    else if (s.boxes[i] === 1) b++;
  }
  return [a, b];
}
