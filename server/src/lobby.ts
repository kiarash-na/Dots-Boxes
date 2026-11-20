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
// Restarts: every deploy, runtime update or eviction restarts this object and
// wipes its memory, so live matches are written through to Durable Object
// storage on every change and restored in onStart(). All sockets are gone
// after a restart, so restored seats start "away" and are held like any
// dropped player's — whoever comes back in time gets their game back.
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
import type {
  LobbyPlayer,
  NetState,
  OfferKind,
  PublicPlayer,
  ServerMessage,
} from '../../src/shared/protocol';
import { deserializeState, serializeState } from '../../src/shared/state';
import { parseInitial, randomTag } from './names';

const OFFER_TTL_MS = 15_000; // match offer expires if not answered
const OFFER_COOLDOWN_MS = 20_000; // declining/ignoring pauses your next offer
const RATE_WINDOW_MS = 10_000; // message budget window …
const RATE_MAX_MESSAGES = 100; // … per window, per connection (humans peak ~5/s)
const MAX_MESSAGE_BYTES = 2048; // every legit message is well under 200 bytes
const MAX_STRIKES = 8; // malformed messages before the connection is dropped
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;
const MATCH_KEY = 'match:'; // storage key prefix: one record per live match

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
  awayUntil: number | null; // while disconnected: epoch ms the held seat is released
  awayTimer: ReturnType<typeof setTimeout> | null; // fires at awayUntil
}

interface Match {
  id: string;
  seats: [Seat, Seat]; // seats[0] plays Red (side 0)
  state: GameState;
  rematchVotes: Set<string>; // tokens (or ids) of players who want a rematch
  turnTimer: ReturnType<typeof setTimeout> | null;
  turnDeadline: number | null; // epoch ms, null when paused / over
}

/** A match as written to storage — enough to resume it after a restart. */
interface StoredMatch {
  v: 1;
  id: string;
  // Index = side (0 plays Red). Only matches where both seats carry a token
  // are stored: nobody else could ever claim a seat back.
  seats: [StoredSeat, StoredSeat];
  state: NetState;
  rematchVotes: string[]; // tokens
  turnDeadline: number | null; // absolute epoch ms
  savedAt: number;
}

interface StoredSeat {
  token: string;
  me: PublicPlayer;
  awayUntil: number | null; // absolute epoch ms
}

const voteKey = (s: Seat) => s.token ?? s.id;
const isAway = (s: Seat) => s.awayUntil !== null;

/** Rebuild a stored seat, or null if the record is not one we wrote. */
function parseStoredSeat(raw: unknown): StoredSeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<StoredSeat>;
  if (typeof s.token !== 'string' || !TOKEN_RE.test(s.token)) return null;
  if (!s.me || typeof s.me.initial !== 'string' || !/^[A-Z?]$/.test(s.me.initial)) return null;
  if (typeof s.me.tag !== 'string' || !/^\d{4}$/.test(s.me.tag)) return null;
  if (s.awayUntil !== null && typeof s.awayUntil !== 'number') return null;
  return { token: s.token, me: { initial: s.me.initial, tag: s.me.tag }, awayUntil: s.awayUntil };
}

export class Lobby extends Server {
  clients = new Map<string, ClientInfo>();
  queue: string[] = []; // FIFO connection ids
  offers = new Map<string, PendingOffer>();
  matches = new Map<string, Match>();
  cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  // ── small helpers ────────────────────────────────────────────────────────

  /**
   * Never throws. Sending to a socket we already closed (its close handshake
   * may never finish) throws in workerd; uncaught, that aborted whatever
   * handler was running — including every new player's connect.
   */
  private sendRaw(conn: Connection | undefined, raw: string) {
    try {
      conn?.send(raw);
    } catch {
      // closed or closing — nothing to deliver
    }
  }

  private sendTo(id: string, msg: ServerMessage) {
    this.sendRaw(this.getConnection(id), JSON.stringify(msg));
  }

  private closeQuietly(conn: Connection | undefined, code: number, reason: string) {
    try {
      conn?.close(code, reason);
    } catch {
      // already closed
    }
  }

  /** Disconnect a client and forget it now, not when its close completes. */
  private kick(conn: Connection, code: number, reason: string) {
    this.dropClient(conn.id);
    this.closeQuietly(conn, code, reason);
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
    if (++c.strikes >= MAX_STRIKES) this.kick(conn, 4400, 'Too many invalid messages');
  }

  // ── persistence: live matches survive restarts ──────────────────────────
  // Write-through on every change; writes are cheap and never awaited (the
  // runtime holds outgoing messages until they are durable). Only matches
  // live in storage: presence, the queue and offers are rebuilt as players
  // reconnect.

  private saveMatch(m: Match) {
    if (this.matches.get(m.id) !== m) return; // already over
    const [a, b] = m.seats;
    if (!a.token || !b.token) return; // no token, no resume — nothing worth keeping
    const record: StoredMatch = {
      v: 1,
      id: m.id,
      seats: [
        { token: a.token, me: a.me, awayUntil: a.awayUntil },
        { token: b.token, me: b.me, awayUntil: b.awayUntil },
      ],
      state: serializeState(m.state),
      rematchVotes: [...m.rematchVotes],
      turnDeadline: m.turnDeadline,
      savedAt: Date.now(),
    };
    this.ctx.storage
      .put(MATCH_KEY + m.id, record)
      .catch((err) => console.error('lobby: saving match failed', err));
  }

  private forgetMatch(id: string) {
    this.ctx.storage
      .delete(MATCH_KEY + id)
      .catch((err) => console.error('lobby: deleting match failed', err));
  }

  /**
   * Runs once per start, before any connection is accepted. It must never
   * throw: a failing onStart would refuse every player's connect.
   */
  async onStart() {
    try {
      const now = Date.now();
      const records = await this.ctx.storage.list({ prefix: MATCH_KEY });
      const dead: string[] = [];
      for (const [key, raw] of records) {
        const m = this.reviveMatch(key, raw, now);
        if (!m) {
          dead.push(key);
          continue;
        }
        this.matches.set(m.id, m);
        this.saveMatch(m); // pin the new hold deadlines
      }
      for (let i = 0; i < dead.length; i += 128) {
        await this.ctx.storage.delete(dead.slice(i, i + 128));
      }
      if (records.size) {
        console.log(`lobby: restored ${this.matches.size} match(es), dropped ${dead.length}`);
      }
    } catch (err) {
      console.error('lobby: restoring matches failed', err);
    }
  }

  /**
   * Turn a stored record back into a live match with both seats held, or
   * null when it is malformed or no seat could still be claimed in time.
   */
  private reviveMatch(key: string, raw: unknown, now: number): Match | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<StoredMatch>;
    if (r.v !== 1 || typeof r.id !== 'string' || key !== MATCH_KEY + r.id) return null;
    if (!Array.isArray(r.seats) || r.seats.length !== 2) return null;
    const seats = r.seats.map(parseStoredSeat);
    if (!seats[0] || !seats[1] || seats[0].token === seats[1].token) return null;
    let state: GameState;
    try {
      state = deserializeState(r.state as NetState);
    } catch {
      return null;
    }

    // When did the previous instance die? Not after any deadline it had
    // pending: at each one it would have written a newer record (a timed-out
    // turn is auto-played, an expired seat ends the match). So a seat that
    // was connected lost its socket by `lastAlive` at the latest, and is held
    // for the usual grace from then. If any seat's hold already ran out —
    // the object sat evicted for a while — the match would have ended: drop it.
    const deadlines = [r.turnDeadline, seats[0].awayUntil, seats[1].awayUntil].filter(
      (t): t is number => typeof t === 'number'
    );
    const lastAlive = Math.min(now, ...deadlines);
    const holds = seats.map((s) => s!.awayUntil ?? lastAlive + RECONNECT_GRACE_MS);
    if (holds.some((t) => t <= now)) return null;

    const tokens = new Set(seats.map((s) => s!.token));
    const m: Match = {
      id: r.id,
      seats: [0, 1].map((i) => ({
        id: `restored:${i}`, // never a real connection id
        token: seats[i]!.token,
        me: seats[i]!.me,
        awayUntil: null,
        awayTimer: null,
      })) as [Seat, Seat],
      state,
      rematchVotes: new Set(
        (Array.isArray(r.rematchVotes) ? r.rematchVotes : []).filter((t) => tokens.has(t))
      ),
      turnTimer: null,
      turnDeadline: null, // paused until both players are back
    };
    m.seats.forEach((s, i) => this.holdSeatUntil(m, s, holds[i]));
    return m;
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
        if (old !== conn) this.closeQuietly(old, 4409, 'Replaced by a newer connection');
      }
    }

    const seat = token ? this.findAwaySeat(token) : null;
    let me: PublicPlayer;
    if (seat) {
      me = seat.match.seats[seat.side].me; // same identity as before the drop
    } else {
      // Held seats (including ones restored after a restart) keep their tags.
      const taken = new Set([...this.clients.values()].map((c) => c.me.tag));
      for (const m of this.matches.values()) for (const s of m.seats) taken.add(s.me.tag);
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
    this.sendTo(conn.id, { t: 'welcome', id: conn.id, me, resumed: !!seat });
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
    if (!c) return this.closeQuietly(conn, 4401, 'Unknown connection');

    // Rate limit: a real player sends a handful of messages per game.
    const now = Date.now();
    if (now - c.windowStart > RATE_WINDOW_MS) {
      c.windowStart = now;
      c.windowCount = 0;
    }
    if (++c.windowCount > RATE_MAX_MESSAGES) return this.kick(conn, 4429, 'Rate limited');

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
        return this.playMove(c, msg.edge);
      case 'sync':
        return this.resync(c);
      case 'rematch':
        return this.rematch(c);
      case 'leave_match':
        if (c.matchId) this.endMatch(c.matchId, c.id, 'opponent_left');
        return;
      case 'challenge':
        return this.challenge(c, msg.tag);
      case 'ping':
        // Heartbeat: lets the client spot a silently dead socket. Counts
        // toward the rate limit above, and deliberately touches nothing else.
        return this.sendTo(c.id, { t: 'pong' });
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
        { id: a, token: ca.token, me: ca.me, awayUntil: null, awayTimer: null },
        { id: b, token: cb.token, me: cb.me, awayUntil: null, awayTimer: null },
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
    this.saveMatch(match);
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
    for (const s of m.seats) if (!isAway(s)) this.sendRaw(this.getConnection(s.id), raw);
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
    if (m.state.over || m.seats.some(isAway)) return;
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
      const side = m.seats.findIndex((s) => isAway(s) && s.token === token);
      if (side !== -1) return { match: m, side: side as PlayerId };
    }
    return null;
  }

  /** Mark `seat` away and release it (ending the match) at `until`. */
  private holdSeatUntil(m: Match, seat: Seat, until: number) {
    if (seat.awayTimer) clearTimeout(seat.awayTimer);
    seat.awayUntil = until;
    seat.awayTimer = setTimeout(
      () => {
        seat.awayTimer = null;
        this.endMatch(m.id, seat.id, 'opponent_disconnected');
      },
      Math.max(0, until - Date.now())
    );
  }

  /** Player dropped: keep their seat for RECONNECT_GRACE_MS, pause the clock. */
  private holdSeat(m: Match, id: string) {
    const side = this.sideOf(m, id);
    if (side === -1) return;
    this.holdSeatUntil(m, m.seats[side], Date.now() + RECONNECT_GRACE_MS);
    this.stopTurnTimer(m);
    const other = m.seats[1 - side];
    // If both dropped (one flaky network, a blip on the server's side), both
    // seats are held — each player gets their own grace period to come back.
    if (!isAway(other)) {
      this.sendTo(other.id, { t: 'opponent_away', graceMs: RECONNECT_GRACE_MS });
    }
    this.saveMatch(m);
  }

  /** The same player is back in time: give them their seat and continue. */
  private resumeSeat(id: string, m: Match, side: PlayerId) {
    const seat = m.seats[side];
    if (seat.awayTimer) clearTimeout(seat.awayTimer);
    seat.awayTimer = null;
    seat.awayUntil = null;
    seat.id = id;
    const c = this.clients.get(id);
    if (c) {
      c.status = 'playing';
      c.matchId = m.id;
    }
    const other = m.seats[1 - side];
    this.startTurnTimer(m);
    this.saveMatch(m);
    this.seat(id, m, other.me, side);
    if (m.rematchVotes.has(voteKey(other))) {
      this.sendTo(id, { t: 'rematch_requested', by: other.me });
    }
    if (other.awayUntil !== null) {
      // The opponent is still gone too (e.g. after a server restart): the
      // returning player waits for them, clock paused.
      this.sendTo(id, { t: 'opponent_away', graceMs: Math.max(0, other.awayUntil - Date.now()) });
    } else {
      this.sendTo(other.id, { t: 'opponent_back', turnMs: this.turnMsLeft(m) });
    }
  }

  private playMove(c: ClientInfo, edge: Edge) {
    const m = c.matchId ? this.matches.get(c.matchId) : undefined;
    if (!m || m.state.over) return;
    const side = this.sideOf(m, c.id);
    if (side === -1) return;
    if (m.seats.some(isAway)) {
      this.sendTo(c.id, { t: 'move_rejected', reason: 'opponent_away' });
      return;
    }
    if (m.state.current !== side) {
      this.sendTo(c.id, { t: 'move_rejected', reason: 'not_your_turn' });
      return;
    }
    if (!this.commitMove(m, edge, false)) {
      this.sendTo(c.id, { t: 'move_rejected', reason: 'edge_taken' });
    }
  }

  /** Apply a validated move, restart the clock and broadcast it. */
  private commitMove(m: Match, edge: Edge, auto: boolean): boolean {
    const result = applyMove(m.state, edge);
    if (!result) return false;
    m.state = result.next;
    this.startTurnTimer(m);
    this.saveMatch(m);
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
      this.saveMatch(m);
      if (!isAway(other)) this.sendTo(other.id, { t: 'rematch_requested', by: c.me });
      return;
    }
    // Both agreed: fresh board, colors swapped.
    m.state = newGame();
    m.rematchVotes.clear();
    m.seats.reverse();
    this.startTurnTimer(m);
    this.saveMatch(m);
    m.seats.forEach((s, i) => this.seat(s.id, m, m.seats[1 - i].me, i as PlayerId));
  }

  /** A match is torn down; the remaining player is told why and goes idle. */
  private endMatch(matchId: string, leaverId: string, reason: 'opponent_left' | 'opponent_disconnected') {
    const m = this.matches.get(matchId);
    if (!m) return;
    this.matches.delete(matchId);
    this.forgetMatch(matchId);
    this.stopTurnTimer(m);
    for (const s of m.seats) {
      if (s.awayTimer) clearTimeout(s.awayTimer);
      const wasAway = isAway(s);
      s.awayTimer = null;
      s.awayUntil = null;
      const c = this.clients.get(s.id);
      if (!c || c.matchId !== matchId) continue;
      c.matchId = null;
      c.status = 'idle';
      if (s.id !== leaverId && !wasAway) this.sendTo(s.id, { t: 'match_ended', reason });
    }
    this.broadcastLobby();
  }
}
