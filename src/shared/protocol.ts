// ─── Online protocol — messages between browser client and lobby server ────
// Client→Server messages are validated on the server with the zod schemas
// below (the security boundary). Server→Client messages are plain types: the
// server is authoritative and clients may trust its payloads.

import { z } from 'zod';
import { BOXES, DOTS } from '../game/engine';
import type { Edge, PlayerId } from '../game/engine';

// Edge coordinates bounded by the board: horizontal edges live in a
// DOTS × BOXES grid, vertical edges in a BOXES × DOTS grid.
export const edgeSchema = z.discriminatedUnion('orientation', [
  z.object({
    orientation: z.literal('h'),
    row: z.number().int().min(0).max(DOTS - 1),
    col: z.number().int().min(0).max(BOXES - 1),
  }),
  z.object({
    orientation: z.literal('v'),
    row: z.number().int().min(0).max(BOXES - 1),
    col: z.number().int().min(0).max(DOTS - 1),
  }),
]);

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('enqueue') }), // join the matchmaking queue
  z.object({ t: z.literal('dequeue') }), // leave the queue (declines a pending offer)
  z.object({ t: z.literal('offer_response'), accept: z.boolean() }),
  z.object({ t: z.literal('move'), edge: edgeSchema }),
  z.object({ t: z.literal('sync') }), // request a full state resend (desync recovery)
  z.object({ t: z.literal('rematch') }), // request / accept a rematch after game over
  z.object({ t: z.literal('leave_match') }), // resign / walk away from a match
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ─── Server → Client ────────────────────────────────────────────────────────

export type PlayerStatus = 'idle' | 'queued' | 'playing';

export interface LobbyPlayer {
  name: string;
  status: PlayerStatus;
}

export type ServerMessage =
  | { t: 'welcome'; id: string; name: string } // sent on every (re)connect
  | { t: 'lobby'; players: LobbyPlayer[] } // full snapshot, broadcast on change
  | { t: 'queue'; position: number | null; size: number } // your place in line
  | { t: 'offer'; opponentName: string; expiresInMs: number } // match found — accept?
  | { t: 'offer_pending' } // you accepted; waiting on the opponent
  | { t: 'offer_cancelled'; reason: 'declined' | 'expired' } // back to the queue
  | { t: 'match_start'; side: PlayerId; opponentName: string; state: NetState }
  | { t: 'move_applied'; edge: Edge; current: PlayerId; turn: number; over: boolean }
  | { t: 'move_rejected'; reason: string }
  | { t: 'state'; state: NetState } // answer to 'sync'
  | { t: 'rematch_requested'; byName: string } // opponent wants a rematch
  | { t: 'match_ended'; reason: 'opponent_left' | 'opponent_disconnected' };

/** Serializable form of GameState (Int8Arrays → plain number arrays). */
export interface NetState {
  h: number[];
  v: number[];
  boxes: number[];
  current: PlayerId;
  turn: number;
  over: boolean;
}
