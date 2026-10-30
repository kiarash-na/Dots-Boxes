// ─── GameState ↔ wire format ────────────────────────────────────────────────

import { BOXES, DOTS } from '../game/engine';
import type { GameState, PlayerId } from '../game/engine';
import type { NetState } from './protocol';

export function serializeState(s: GameState): NetState {
  return {
    h: Array.from(s.h),
    v: Array.from(s.v),
    boxes: Array.from(s.boxes),
    current: s.current,
    turn: s.turn,
    over: s.over,
  };
}

/** Rebuild a GameState from the wire. Throws on malformed shapes. */
export function deserializeState(n: NetState): GameState {
  if (
    n.h.length !== DOTS * BOXES ||
    n.v.length !== BOXES * DOTS ||
    n.boxes.length !== BOXES * BOXES ||
    (n.current !== 0 && n.current !== 1)
  ) {
    throw new Error('Malformed game state');
  }
  return {
    h: Int8Array.from(n.h),
    v: Int8Array.from(n.v),
    boxes: Int8Array.from(n.boxes),
    current: n.current as PlayerId,
    turn: n.turn,
    over: n.over,
  };
}
