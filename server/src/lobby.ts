// ─── Lobby — one global Durable Object: presence, FIFO queue, matches ──────
//
// The server is the single authority over every online game. It runs the same
// engine as the client: clients *request* moves, the server validates (right
// player, right turn, free in-bounds edge) and broadcasts the accepted move.
// Nothing a client sends is ever trusted or relayed verbatim to others.
//
// Reconnects: each browser tab sends a secret `token` in the WebSocket URL.
// When a player drops mid-match their seat is held for RECONNECT_GRACE_MS; a
// new connection with the same token takes the seat back and the game simply
// continues. Turns are limited to TURN_MS — on timeout the server plays a
// random legal move for the idle player.
//
// Identity: players pick a single letter; the server adds a random 4-digit
// tag. Besides the FIFO queue, a player may challenge a specific lobby player
// by tag — rate limited per sender and per target.

import { Server } from 'partyserver';
import type { Connection, ConnectionContext } from 'partyserver';
import { chooseMove } from '../../src/game/bot';
import { applyMove, newGame } from '../../src/game/engine';
import type { Edge, GameState, PlayerId } from '../../src/game/engine';
import { clientMessageSchema } from './schema';
import {
  CHALLENGE_COOLDOWN_MS,
  CHALLENGE_MAX,
  CHALLENGE_WINDOW_MS,
  RECONNECT_GRACE_MS,
  TURN_MS,
} from '../../src/shared/protocol';
import type { LobbyPlayer, OfferKind, PublicPlayer, ServerMessage } from '../../src/shared/protocol';
import { serializeState } from '../../src/shared/state';
import { parseInitial, randomTag } from './names';

const OFFER_TTL_MS = 15_000; // match offer expires if not answered
const OFFER_COOLDOWN_MS = 20_000; // declining/ignoring pauses your next offer
const RATE_WINDOW_MS = 10_000; // message budget window …
const RATE_MAX_MESSAGES = 100; // … per window, per connection (humans peak ~5/s)
const MAX_MESSAGE_BYTES = 2048; // every legit message is well under 200 bytes
const MAX_STRIKES = 8; // malformed messages before the connection is dropped
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;

type ClientStatus = 'idle' | 'queued' | 'offered' | 'playing';

interface ClientInfo {
  id: string;
  token: string | null; // reconnect secret from the URL (null: no resume)
  me: PublicPlayer;
  status: ClientStatus;
  cooldownUntil: number; // no offers before this time (decline/timeout penalty)
  matchId: string | null;
  offerId: string | null;
  windowStart: number; // rate-limit window
  windowCount: number;
  strikes: number;
  challengesSent: number[]; // timestamps, for the per-sender challenge budget
  challengeBlocks: Map<string, number>; // target tag → no re-challenge before
}

interface PendingOffer {
  id: string;
  kind: OfferKind;
  players: [string, string]; // for a challenge, players[0] is the challenger
  prevStatus: [ClientStatus, ClientStatus]; // restored when a challenge falls through
  accepted: Set<string>;
  timer: ReturnType<typeof setTimeout>;
}

interface Seat {
  id: string; // connection id (stale while the player is away)
  token: string | null;
  me: PublicPlayer;
  away: ReturnType<typeof setTimeout> | null; // grace timer while disconnected
}

interface Match {
  id: string;
  seats: [Seat, Seat]; // seats[0] plays Red (side 0)
  state: GameState;
  rematchVotes: Set<string>; // tokens (or ids) of players who want a rematch
  turnTimer: ReturnType<typeof setTimeout> | null;
  turnDeadline: number | null; // epoch ms, null when paused / over
}

const voteKey = (s: Seat) => s.token ?? s.id;

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
      ...c.me,
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

  onConnect(conn: Connection, ctx: ConnectionContext) {
    let token: string | null = null;
    try {
      const t = new URL(ctx.request.url).searchParams.get('token');
      if (t && TOKEN_RE.test(t)) token = t;
    } catch {
      // no / malformed URL — treat as a fresh, non-resumable client
    }

    if (token) {
      // Same tab reconnecting before the server noticed the old socket died
      // (or a duplicated tab): the newest connection wins.
      const stale = [...this.clients.values()].find((c) => c.token === token);
      if (stale) {
        const old = this.getConnection(stale.id);
        this.dropClient(stale.id);
        old?.close(4409, 'Replaced by a newer connection');
      }
    }

    const seat = token ? this.findAwaySeat(token) : null;
    let me: PublicPlayer;
    if (seat) {
      me = seat.match.seats[seat.side].me; // same identity as before the drop
    } else {
      const taken = new Set([...this.clients.values()].map((c) => c.me.tag));
      for (const m of this.matches.values()) for (const s of m.seats) if (s.away) taken.add(s.me.tag);
      let initial: string | null = null;
      try {
        initial = new URL(ctx.request.url).searchParams.get('initial');
      } catch {
        // fall through to the placeholder
      }
      me = { initial: parseInitial(initial), tag: randomTag(taken) };
    }
    this.clients.set(conn.id, {
      id: conn.id,
      token,
      me,
      status: 'idle',
      cooldownUntil: 0,
      matchId: null,
      offerId: null,
      windowStart: Date.now(),
      windowCount: 0,
      strikes: 0,
      challengesSent: [],
      challengeBlocks: new Map(),
    });
    conn.send(
      JSON.stringify({ t: 'welcome', id: conn.id, me, resumed: !!seat } satisfies ServerMessage)
    );
    if (seat) this.resumeSeat(conn.id, seat.match, seat.side);
    this.broadcastLobby();
    this.sendQueuePositions();
  }

  onClose(conn: Connection) {
    if (!this.clients.has(conn.id)) return;
    this.dropClient(conn.id);
  }

  /** A connection is gone: hold its match seat (if resumable), clean up the rest. */
  private dropClient(id: string) {
    const c = this.clients.get(id);
    if (!c) return;
    if (c.offerId) this.resolveOffer(c.offerId, id, true);
    if (c.matchId) {
      const m = this.matches.get(c.matchId);
      if (m && c.token) this.holdSeat(m, id);
      else this.endMatch(c.matchId, id, 'opponent_disconnected');
    }
    this.removeFromQueue(id);
    this.clients.delete(id);
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
      case 'challenge':
        return this.challenge(c, msg.tag);
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

  private createOffer(a: string, b: string, kind: OfferKind = 'queue') {
    const ca = this.clients.get(a);
    const cb = this.clients.get(b);
    if (!ca || !cb) return;
    const id = crypto.randomUUID();
    const prevStatus: [ClientStatus, ClientStatus] = [ca.status, cb.status];
    ca.status = 'offered';
    ca.offerId = id;
    cb.status = 'offered';
    cb.offerId = id;
    const timer = setTimeout(() => this.resolveOffer(id, null, false), OFFER_TTL_MS);
    // A challenger has implicitly accepted their own request.
    const accepted = new Set<string>(kind === 'challenge' ? [a] : []);
    this.offers.set(id, { id, kind, players: [a, b], prevStatus, accepted, timer });
    const base = { t: 'offer', expiresInMs: OFFER_TTL_MS, kind } as const;
    this.sendTo(a, { ...base, opponent: cb.me, fromMe: kind === 'challenge' });
    this.sendTo(b, { ...base, opponent: ca.me, fromMe: false });
  }

  /** Direct match request to the lobby player with `tag`. */
  private challenge(c: ClientInfo, tag: string) {
    const now = Date.now();
    const target = [...this.clients.values()].find((x) => x.me.tag === tag);
    if (!target || target.id === c.id) {
      return this.sendTo(c.id, { t: 'challenge_failed', reason: 'unavailable' });
    }
    if (c.status === 'playing' || c.status === 'offered') {
      return this.sendTo(c.id, { t: 'challenge_failed', reason: 'busy' });
    }
    if (target.status === 'playing' || target.status === 'offered') {
      return this.sendTo(c.id, { t: 'challenge_failed', reason: 'busy' });
    }
    if ((c.challengeBlocks.get(tag) ?? 0) > now) {
      return this.sendTo(c.id, { t: 'challenge_failed', reason: 'cooldown' });
    }
    c.challengesSent = c.challengesSent.filter((t) => now - t < CHALLENGE_WINDOW_MS);
    if (c.challengesSent.length >= CHALLENGE_MAX) {
      return this.sendTo(c.id, { t: 'challenge_failed', reason: 'rate_limited' });
    }
    c.challengesSent.push(now);
    this.createOffer(c.id, target.id, 'challenge');
    this.broadcastLobby();
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

    if (offer.kind === 'challenge') return this.resolveChallenge(offer, declinerId);

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

  /**
   * A challenge fell through: nobody is penalised in the queue — both go back
   * to what they were doing. The challenger can't re-ask that player for a bit.
   */
  private resolveChallenge(offer: PendingOffer, declinerId: string | null) {
    const [challengerId, targetId] = offer.players;
    offer.players.forEach((id, i) => {
      const c = this.clients.get(id);
      if (!c) return;
      c.offerId = null;
      c.status = offer.prevStatus[i] === 'queued' && this.queue.includes(id) ? 'queued' : 'idle';
      if (id === declinerId) return; // they chose this — their client already knows
      this.sendTo(id, { t: 'offer_cancelled', reason: declinerId === null ? 'expired' : 'declined' });
    });
    const challenger = this.clients.get(challengerId);
    const target = this.clients.get(targetId);
    if (challenger && target && declinerId !== challengerId) {
      challenger.challengeBlocks.set(target.me.tag, Date.now() + CHALLENGE_COOLDOWN_MS);
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
      seats: [
        { id: a, token: ca.token, me: ca.me, away: null },
        { id: b, token: cb.token, me: cb.me, away: null },
      ],
      state: newGame(),
      rematchVotes: new Set(),
      turnTimer: null,
      turnDeadline: null,
    };
    this.matches.set(match.id, match);
    this.removeFromQueue(a);
    this.removeFromQueue(b);

    this.startTurnTimer(match);
    this.seat(a, match, cb.me, 0);
    this.seat(b, match, ca.me, 1);
    this.broadcastLobby();
    this.sendQueuePositions();
  }

  private seat(id: string, match: Match, opponent: PublicPlayer, side: PlayerId) {
    const c = this.clients.get(id);
    if (!c) return;
    c.status = 'playing';
    c.offerId = null;
    c.matchId = match.id;
    this.sendTo(id, {
      t: 'match_start',
      side,
      opponent,
      state: serializeState(match.state),
      turnMs: this.turnMsLeft(match),
    });
  }

  private sideOf(m: Match, id: string): PlayerId | -1 {
    return m.seats[0].id === id ? 0 : m.seats[1].id === id ? 1 : -1;
  }

  /** Send to both seats (no-op for a seat whose player is away). */
  private sendMatch(m: Match, msg: ServerMessage) {
    const raw = JSON.stringify(msg);
    for (const s of m.seats) if (!s.away) this.getConnection(s.id)?.send(raw);
  }

  // ── turn timer ───────────────────────────────────────────────────────────

  private turnMsLeft(m: Match): number | null {
    return m.turnDeadline === null ? null : Math.max(0, m.turnDeadline - Date.now());
  }

  private stopTurnTimer(m: Match) {
    if (m.turnTimer) clearTimeout(m.turnTimer);
    m.turnTimer = null;
    m.turnDeadline = null;
  }

  /** (Re)start the clock for whoever moves now. Paused while a player is away. */
  private startTurnTimer(m: Match) {
    this.stopTurnTimer(m);
    if (m.state.over || m.seats.some((s) => s.away)) return;
    m.turnDeadline = Date.now() + TURN_MS;
    m.turnTimer = setTimeout(() => {
      m.turnTimer = null;
      if (this.matches.get(m.id) !== m || m.state.over) return;
      this.commitMove(m, chooseMove(m.state, 'easy'), true);
    }, TURN_MS);
  }

  // ── reconnects ───────────────────────────────────────────────────────────

  private findAwaySeat(token: string): { match: Match; side: PlayerId } | null {
    for (const m of this.matches.values()) {
      const side = m.seats.findIndex((s) => s.away && s.token === token);
      if (side !== -1) return { match: m, side: side as PlayerId };
    }
    return null;
  }

  /** Player dropped: keep their seat for RECONNECT_GRACE_MS, pause the clock. */
  private holdSeat(m: Match, id: string) {
    const side = this.sideOf(m, id);
    if (side === -1) return;
    const seat = m.seats[side];
    if (seat.away) clearTimeout(seat.away);
    seat.away = setTimeout(() => {
      seat.away = null;
      this.endMatch(m.id, seat.id, 'opponent_disconnected');
    }, RECONNECT_GRACE_MS);
    this.stopTurnTimer(m);
    const other = m.seats[1 - side];
    if (!other.away) {
      this.sendTo(other.id, { t: 'opponent_away', graceMs: RECONNECT_GRACE_MS });
    } else {
      // Both players are gone — nobody is left to wait; drop the match.
      this.endMatch(m.id, id, 'opponent_disconnected');
    }
  }

  /** The same player is back in time: give them their seat and continue. */
  private resumeSeat(id: string, m: Match, side: PlayerId) {
    const seat = m.seats[side];
    if (seat.away) clearTimeout(seat.away);
    seat.away = null;
    seat.id = id;
    const c = this.clients.get(id);
    if (c) {
      c.status = 'playing';
      c.matchId = m.id;
    }
    const other = m.seats[1 - side];
    this.startTurnTimer(m);
    this.seat(id, m, other.me, side);
    if (m.rematchVotes.has(voteKey(other))) {
      this.sendTo(id, { t: 'rematch_requested', by: other.me });
    }
    this.sendTo(other.id, { t: 'opponent_back', turnMs: this.turnMsLeft(m) });
  }

  private playMove(conn: Connection, c: ClientInfo, edge: Edge) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (!m || m.state.over) return;
    const side = this.sideOf(m, c.id);
    if (side === -1) return;
    if (m.seats.some((s) => s.away)) {
      conn.send(JSON.stringify({ t: 'move_rejected', reason: 'opponent_away' } satisfies ServerMessage));
      return;
    }
    if (m.state.current !== side) {
      conn.send(JSON.stringify({ t: 'move_rejected', reason: 'not_your_turn' } satisfies ServerMessage));
      return;
    }
    if (!this.commitMove(m, edge, false)) {
      conn.send(JSON.stringify({ t: 'move_rejected', reason: 'edge_taken' } satisfies ServerMessage));
    }
  }

  /** Apply a validated move, restart the clock and broadcast it. */
  private commitMove(m: Match, edge: Edge, auto: boolean): boolean {
    const result = applyMove(m.state, edge);
    if (!result) return false;
    m.state = result.next;
    this.startTurnTimer(m);
    this.sendMatch(m, {
      t: 'move_applied',
      edge,
      current: m.state.current,
      turn: m.state.turn,
      over: m.state.over,
      auto,
      turnMs: this.turnMsLeft(m),
    });
    return true;
  }

  private resync(c: ClientInfo) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (m) {
      this.sendTo(c.id, { t: 'state', state: serializeState(m.state), turnMs: this.turnMsLeft(m) });
    }
  }

  private rematch(c: ClientInfo) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (!m || !m.state.over) return;
    const side = this.sideOf(m, c.id);
    if (side === -1) return;
    m.rematchVotes.add(voteKey(m.seats[side]));
    const other = m.seats[1 - side];
    if (m.rematchVotes.size < 2) {
      if (!other.away) this.sendTo(other.id, { t: 'rematch_requested', by: c.me });
      return;
    }
    // Both agreed: fresh board, colors swapped.
    m.state = newGame();
    m.rematchVotes.clear();
    m.seats.reverse();
    this.startTurnTimer(m);
    m.seats.forEach((s, i) => this.seat(s.id, m, m.seats[1 - i].me, i as PlayerId));
  }

  /** A match is torn down; the remaining player is told why and goes idle. */
  private endMatch(matchId: string, leaverId: string, reason: 'opponent_left' | 'opponent_disconnected') {
    const m = this.matches.get(matchId);
    if (!m) return;
    this.matches.delete(matchId);
    this.stopTurnTimer(m);
    for (const s of m.seats) {
      if (s.away) clearTimeout(s.away);
      const wasAway = s.away !== null;
      s.away = null;
      const c = this.clients.get(s.id);
      if (!c || c.matchId !== matchId) continue;
      c.matchId = null;
      c.status = 'idle';
      if (s.id !== leaverId && !wasAway) this.sendTo(s.id, { t: 'match_ended', reason });
    }
    this.broadcastLobby();
  }
}
