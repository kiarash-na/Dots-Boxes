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
/** Direct match requests: at most CHALLENGE_MAX per CHALLENGE_WINDOW_MS … */
export const CHALLENGE_MAX = 3;
export const CHALLENGE_WINDOW_MS = 60_000;
/** … and no re-challenging the same player within this long after a no. */
export const CHALLENGE_COOLDOWN_MS = 30_000;

export type ClientMessage =
  | { t: 'enqueue' } // join the matchmaking queue
  | { t: 'dequeue' } // leave the queue (declines a pending offer)
  | { t: 'offer_response'; accept: boolean }
  | { t: 'move'; edge: Edge }
  | { t: 'sync' } // request a full state resend (desync recovery)
  | { t: 'rematch' } // request / accept a rematch after game over
  | { t: 'leave_match' } // resign / walk away from a match
  | { t: 'challenge'; tag: string }; // ask a specific lobby player for a match

// ─── Server → Client ────────────────────────────────────────────────────────

export type PlayerStatus = 'idle' | 'queued' | 'playing';

/** Public identity: a self-chosen letter plus a random 4-digit tag. */
export interface PublicPlayer {
  initial: string; // one letter, A–Z
  tag: string; // 4 digits, unique among online players
}

/** "K #4821" — for toasts and plain-text labels. */
export const playerLabel = (p: PublicPlayer) => `${p.initial} #${p.tag}`;

export interface LobbyPlayer extends PublicPlayer {
  status: PlayerStatus;
}

/** 'queue': found by matchmaking. 'challenge': a direct request between two players. */
export type OfferKind = 'queue' | 'challenge';

export type ServerMessage =
  // Sent on every (re)connect. `resumed`: your held match seat was restored —
  // a `match_start` with the current board follows; keep your match UI.
  | { t: 'welcome'; id: string; me: PublicPlayer; resumed: boolean }
  | { t: 'lobby'; players: LobbyPlayer[] } // full snapshot, broadcast on change
  | { t: 'queue'; position: number | null; size: number } // your place in line
  // Match found — accept? For a challenge, `fromMe` says you sent it (already accepted).
  | { t: 'offer'; opponent: PublicPlayer; expiresInMs: number; kind: OfferKind; fromMe: boolean }
  | { t: 'offer_pending' } // you accepted; waiting on the opponent
  | { t: 'offer_cancelled'; reason: 'declined' | 'expired' } // back to the queue
  // `turnMs`: time left for the player to move, null while paused / over.
  | { t: 'match_start'; side: PlayerId; opponent: PublicPlayer; state: NetState; turnMs: number | null }
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
  | { t: 'rematch_requested'; by: PublicPlayer } // opponent wants a rematch
  | { t: 'challenge_failed'; reason: 'unavailable' | 'busy' | 'rate_limited' | 'cooldown' }
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
