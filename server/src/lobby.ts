// ─── Lobby — one global Durable Object: presence, FIFO queue, matches ──────
//
// The server is the single authority over every online game. It runs the same
// engine as the client: clients *request* moves, the server validates (right
// player, right turn, free in-bounds edge) and broadcasts the accepted move.
// Nothing a client sends is ever trusted or relayed verbatim to others.

import { Server } from 'partyserver';
import type { Connection } from 'partyserver';
import { applyMove, newGame } from '../../src/game/engine';
import type { GameState, PlayerId } from '../../src/game/engine';
import { clientMessageSchema } from './schema';
import type { LobbyPlayer, ServerMessage } from '../../src/shared/protocol';
import { serializeState } from '../../src/shared/state';
import { randomName } from './names';

const OFFER_TTL_MS = 15_000; // match offer expires if not answered
const OFFER_COOLDOWN_MS = 20_000; // declining/ignoring pauses your next offer
const RATE_WINDOW_MS = 10_000; // message budget window …
const RATE_MAX_MESSAGES = 100; // … per window, per connection (humans peak ~5/s)
const MAX_MESSAGE_BYTES = 2048; // every legit message is well under 200 bytes
const MAX_STRIKES = 8; // malformed messages before the connection is dropped

type ClientStatus = 'idle' | 'queued' | 'offered' | 'playing';

interface ClientInfo {
  id: string;
  name: string;
  status: ClientStatus;
  cooldownUntil: number; // no offers before this time (decline/timeout penalty)
  matchId: string | null;
  offerId: string | null;
  windowStart: number; // rate-limit window
  windowCount: number;
  strikes: number;
}

interface PendingOffer {
  id: string;
  players: [string, string];
  accepted: Set<string>;
  timer: ReturnType<typeof setTimeout>;
}

interface Match {
  id: string;
  players: [string, string]; // players[0] plays Red (side 0)
  state: GameState;
  rematchVotes: Set<string>;
}

export class Lobby extends Server {
  clients = new Map<string, ClientInfo>();
  queue: string[] = []; // FIFO connection ids
  offers = new Map<string, PendingOffer>();
  matches = new Map<string, Match>();
  cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  // ── small helpers ────────────────────────────────────────────────────────

  private sendTo(id: string, msg: ServerMessage) {
    this.getConnection(id)?.send(JSON.stringify(msg));
  }

  private broadcastLobby() {
    const players: LobbyPlayer[] = [...this.clients.values()].map((c) => ({
      name: c.name,
      status:
        c.status === 'playing' ? 'playing' : c.status === 'idle' ? 'idle' : 'queued',
    }));
    this.broadcast(JSON.stringify({ t: 'lobby', players } satisfies ServerMessage));
  }

  private sendQueuePositions() {
    const size = this.queue.length;
    for (const c of this.clients.values()) {
      const idx = this.queue.indexOf(c.id);
      this.sendTo(c.id, { t: 'queue', position: idx === -1 ? null : idx + 1, size });
    }
  }

  private removeFromQueue(id: string) {
    const i = this.queue.indexOf(id);
    if (i !== -1) this.queue.splice(i, 1);
  }

  private strike(c: ClientInfo, conn: Connection) {
    if (++c.strikes >= MAX_STRIKES) conn.close(4400, 'Too many invalid messages');
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  onConnect(conn: Connection) {
    const taken = new Set([...this.clients.values()].map((c) => c.name));
    const name = randomName(taken);
    this.clients.set(conn.id, {
      id: conn.id,
      name,
      status: 'idle',
      cooldownUntil: 0,
      matchId: null,
      offerId: null,
      windowStart: Date.now(),
      windowCount: 0,
      strikes: 0,
    });
    conn.send(JSON.stringify({ t: 'welcome', id: conn.id, name } satisfies ServerMessage));
    this.broadcastLobby();
    this.sendQueuePositions();
  }

  onClose(conn: Connection) {
    const c = this.clients.get(conn.id);
    if (!c) return;
    if (c.offerId) this.resolveOffer(c.offerId, conn.id, true);
    if (c.matchId) this.endMatch(c.matchId, conn.id, 'opponent_disconnected');
    this.removeFromQueue(conn.id);
    this.clients.delete(conn.id);
    this.broadcastLobby();
    this.sendQueuePositions();
    this.matchmake();
  }

  onError(conn: Connection) {
    this.onClose(conn);
  }

  // ── messages ─────────────────────────────────────────────────────────────

  onMessage(conn: Connection, raw: string) {
    const c = this.clients.get(conn.id);
    if (!c) return conn.close(4401, 'Unknown connection');

    // Rate limit: a real player sends a handful of messages per game.
    const now = Date.now();
    if (now - c.windowStart > RATE_WINDOW_MS) {
      c.windowStart = now;
      c.windowCount = 0;
    }
    if (++c.windowCount > RATE_MAX_MESSAGES) return conn.close(4429, 'Rate limited');

    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
      return this.strike(c, conn);
    }

    let msg;
    try {
      msg = clientMessageSchema.parse(JSON.parse(raw));
    } catch {
      return this.strike(c, conn);
    }

    switch (msg.t) {
      case 'enqueue':
        return this.enqueue(c);
      case 'dequeue':
        return this.dequeue(c);
      case 'offer_response':
        return this.answerOffer(c, msg.accept);
      case 'move':
        return this.playMove(conn, c, msg.edge);
      case 'sync':
        return this.resync(c);
      case 'rematch':
        return this.rematch(c);
      case 'leave_match':
        if (c.matchId) this.endMatch(c.matchId, c.id, 'opponent_left');
        return;
    }
  }

  // ── queue ────────────────────────────────────────────────────────────────

  private enqueue(c: ClientInfo) {
    if (c.status !== 'idle') return; // already queued / playing — ignore
    c.status = 'queued';
    this.queue.push(c.id);
    this.broadcastLobby();
    this.sendQueuePositions();
    this.matchmake();
  }

  private dequeue(c: ClientInfo) {
    // Leaving the queue while an offer is open counts as declining it.
    if (c.offerId) this.resolveOffer(c.offerId, c.id, false);
    if (c.status === 'queued' || c.status === 'offered') c.status = 'idle';
    this.removeFromQueue(c.id);
    this.broadcastLobby();
    this.sendQueuePositions();
  }

  /** Pair up eligible players, front of the queue first. */
  private matchmake() {
    const now = Date.now();
    let nextWake = Infinity;

    const eligible = this.queue.filter((id) => {
      const c = this.clients.get(id);
      if (!c || c.status !== 'queued') return false;
      if (c.cooldownUntil > now) {
        nextWake = Math.min(nextWake, c.cooldownUntil);
        return false;
      }
      return true;
    });

    for (let i = 0; i + 1 < eligible.length; i += 2) {
      this.createOffer(eligible[i], eligible[i + 1]);
    }

    // Wake up when the next cooldown expires so those players get offers.
    if (nextWake !== Infinity) {
      if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
      this.cooldownTimer = setTimeout(() => this.matchmake(), nextWake - now + 50);
    }
  }

  // ── offers ───────────────────────────────────────────────────────────────

  private createOffer(a: string, b: string) {
    const ca = this.clients.get(a);
    const cb = this.clients.get(b);
    if (!ca || !cb) return;
    const id = crypto.randomUUID();
    ca.status = 'offered';
    ca.offerId = id;
    cb.status = 'offered';
    cb.offerId = id;
    const timer = setTimeout(() => this.resolveOffer(id, null, false), OFFER_TTL_MS);
    this.offers.set(id, { id, players: [a, b], accepted: new Set(), timer });
    this.sendTo(a, { t: 'offer', opponentName: cb.name, expiresInMs: OFFER_TTL_MS });
    this.sendTo(b, { t: 'offer', opponentName: ca.name, expiresInMs: OFFER_TTL_MS });
  }

  private answerOffer(c: ClientInfo, accept: boolean) {
    if (!c.offerId) return;
    const offer = this.offers.get(c.offerId);
    if (!offer) {
      c.offerId = null;
      return;
    }
    if (!accept) return this.resolveOffer(offer.id, c.id, false);
    offer.accepted.add(c.id);
    if (offer.accepted.size === 2) return this.startMatch(offer);
    this.sendTo(c.id, { t: 'offer_pending' });
  }

  /**
   * An offer ends without a match. Whoever declined or failed to answer keeps
   * their place at the *back* of the queue plus a short cooldown; a player who
   * accepted goes back to the front and is told the offer fell through.
   */
  private resolveOffer(offerId: string, declinerId: string | null, declinerGone: boolean) {
    const offer = this.offers.get(offerId);
    if (!offer) return;
    clearTimeout(offer.timer);
    this.offers.delete(offerId);

    for (const id of offer.players) {
      const c = this.clients.get(id);
      if (!c) continue;
      c.offerId = null;
      const isDecliner = declinerId === id || (declinerId === null && !offer.accepted.has(id));
      if (isDecliner) {
        if (declinerGone) continue; // closing connection — onClose removes it
        c.status = 'queued';
        c.cooldownUntil = Date.now() + OFFER_COOLDOWN_MS;
        this.removeFromQueue(id);
        this.queue.push(id);
        // On timeout the non-responder still has the offer dialog open —
        // tell them it lapsed so their client can close it.
        if (declinerId === null) this.sendTo(id, { t: 'offer_cancelled', reason: 'expired' });
      } else {
        c.status = 'queued';
        c.cooldownUntil = 0;
        this.removeFromQueue(id);
        this.queue.unshift(id);
        this.sendTo(id, {
          t: 'offer_cancelled',
          reason: declinerId === null ? 'expired' : 'declined',
        });
      }
    }
    this.broadcastLobby();
    this.sendQueuePositions();
    this.matchmake();
  }

  // ── matches ──────────────────────────────────────────────────────────────

  private startMatch(offer: PendingOffer) {
    clearTimeout(offer.timer);
    this.offers.delete(offer.id);
    const [a, b] = offer.players;
    const ca = this.clients.get(a);
    const cb = this.clients.get(b);
    if (!ca || !cb) return; // someone vanished mid-handshake; onClose cleans up

    const match: Match = {
      id: crypto.randomUUID(),
      players: [a, b],
      state: newGame(),
      rematchVotes: new Set(),
    };
    this.matches.set(match.id, match);
    this.removeFromQueue(a);
    this.removeFromQueue(b);

    this.seat(a, match, cb.name, 0);
    this.seat(b, match, ca.name, 1);
    this.broadcastLobby();
    this.sendQueuePositions();
  }

  private seat(id: string, match: Match, opponentName: string, side: PlayerId) {
    const c = this.clients.get(id);
    if (!c) return;
    c.status = 'playing';
    c.offerId = null;
    c.matchId = match.id;
    this.sendTo(id, { t: 'match_start', side, opponentName, state: serializeState(match.state) });
  }

  private playMove(conn: Connection, c: ClientInfo, edge: Parameters<typeof applyMove>[1]) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (!m || m.state.over) return;
    const side = m.players[0] === c.id ? 0 : m.players[1] === c.id ? 1 : -1;
    if (side === -1) return;
    if (m.state.current !== side) {
      conn.send(JSON.stringify({ t: 'move_rejected', reason: 'not_your_turn' } satisfies ServerMessage));
      return;
    }
    const result = applyMove(m.state, edge);
    if (!result) {
      conn.send(JSON.stringify({ t: 'move_rejected', reason: 'edge_taken' } satisfies ServerMessage));
      return;
    }
    m.state = result.next;
    const msg = JSON.stringify({
      t: 'move_applied',
      edge,
      current: m.state.current,
      turn: m.state.turn,
      over: m.state.over,
    } satisfies ServerMessage);
    for (const id of m.players) this.getConnection(id)?.send(msg);
  }

  private resync(c: ClientInfo) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (m) this.sendTo(c.id, { t: 'state', state: serializeState(m.state) });
  }

  private rematch(c: ClientInfo) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (!m || !m.state.over) return;
    m.rematchVotes.add(c.id);
    const otherId = m.players.find((id) => id !== c.id);
    if (m.rematchVotes.size < 2) {
      if (otherId) this.sendTo(otherId, { t: 'rematch_requested', byName: c.name });
      return;
    }
    // Both agreed: fresh board, colors swapped.
    m.state = newGame();
    m.rematchVotes.clear();
    m.players.reverse();
    m.players.forEach((id, i) => {
      const opp = this.clients.get(m.players[1 - i]);
      this.sendTo(id, {
        t: 'match_start',
        side: i as PlayerId,
        opponentName: opp?.name ?? 'Opponent',
        state: serializeState(m.state),
      });
    });
  }

  /** A match is torn down; the remaining player is told why and goes idle. */
  private endMatch(matchId: string, leaverId: string, reason: 'opponent_left' | 'opponent_disconnected') {
    const m = this.matches.get(matchId);
    if (!m) return;
    this.matches.delete(matchId);
    for (const id of m.players) {
      const c = this.clients.get(id);
      if (!c) continue;
      c.matchId = null;
      c.status = 'idle';
      if (id !== leaverId) this.sendTo(id, { t: 'match_ended', reason });
    }
    this.broadcastLobby();
  }
}
