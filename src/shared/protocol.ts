// ─── Online protocol — messages between browser client and lobby server ────
// Pure types, zero dependencies: this file is imported by the Vite client AND
// the Cloudflare server, so it must not pull any package (module resolution
// differs between the two environments). The runtime validation of
// ClientMessage lives in server/src/schema.ts (zod), where zod resolves from
// the server's own node_modules.

import type { Edge, PlayerId } from '../game/engine';

/** Time limit for each move in an online match. */
export const TURN_MS = 30_000;
/** How long a dropped player's seat is held before the match is abandoned. */
export const RECONNECT_GRACE_MS = 90_000;

export type ClientMessage =
  | { t: 'enqueue' } // join the matchmaking queue
  | { t: 'dequeue' } // leave the queue (declines a pending offer)
  | { t: 'offer_response'; accept: boolean }
  | { t: 'move'; edge: Edge }
  | { t: 'sync' } // request a full state resend (desync recovery)
  | { t: 'rematch' } // request / accept a rematch after game over
  | { t: 'leave_match' }; // resign / walk away from a match

// ─── Server → Client ────────────────────────────────────────────────────────

export type PlayerStatus = 'idle' | 'queued' | 'playing';

export interface LobbyPlayer {
  name: string;
  status: PlayerStatus;
}

export type ServerMessage =
  // Sent on every (re)connect. `resumed`: your held match seat was restored —
  // a `match_start` with the current board follows; keep your match UI.
  | { t: 'welcome'; id: string; name: string; resumed: boolean }
  | { t: 'lobby'; players: LobbyPlayer[] } // full snapshot, broadcast on change
  | { t: 'queue'; position: number | null; size: number } // your place in line
  | { t: 'offer'; opponentName: string; expiresInMs: number } // match found — accept?
  | { t: 'offer_pending' } // you accepted; waiting on the opponent
  | { t: 'offer_cancelled'; reason: 'declined' | 'expired' } // back to the queue
  // `turnMs`: time left for the player to move, null while paused / over.
  | { t: 'match_start'; side: PlayerId; opponentName: string; state: NetState; turnMs: number | null }
  | {
      t: 'move_applied';
      edge: Edge;
      current: PlayerId;
      turn: number;
      over: boolean;
      auto: boolean; // true: played by the server because the turn timed out
      turnMs: number | null;
    }
  | { t: 'move_rejected'; reason: string }
  | { t: 'state'; state: NetState; turnMs: number | null } // answer to 'sync'
  | { t: 'opponent_away'; graceMs: number } // opponent dropped; seat held, clock paused
  | { t: 'opponent_back'; turnMs: number | null } // opponent reconnected in time
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
