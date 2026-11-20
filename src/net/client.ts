// ─── Online client — typed wrapper around the lobby WebSocket ───────────────
// PartySocket handles reconnects with backoff. Every connection carries this
// tab's secret token, so after a drop the server can hand back a held match
// seat: `welcome.resumed` says whether it did. A non-resumed `welcome` means
// the server treats us as brand new.
//
// Heartbeat: a socket can die without the browser noticing (laptop sleep,
// network switch) — it still looks open, so PartySocket never reconnects and
// the server's seat hold runs out. We ping every HEARTBEAT_MS and force a
// reconnect when nothing has arrived for HEARTBEAT_TIMEOUT_MS and a ping
// went unanswered.

const TOKEN_KEY = 'dots-boxes:online-token';

/** Per-tab reconnect secret (survives reloads, not shared across tabs). */
function sessionToken(): string {
  const fresh = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  try {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved && /^[A-Za-z0-9-]{16,64}$/.test(saved)) return saved;
    const t = fresh();
    sessionStorage.setItem(TOKEN_KEY, t);
    return t;
  } catch {
    return fresh(); // storage blocked: still resumes within this page
  }
}

import { PartySocket } from 'partysocket';
import type { Edge } from '../game/engine';
import { HEARTBEAT_MS, HEARTBEAT_TIMEOUT_MS } from '../shared/protocol';
import type { ClientMessage, ServerMessage } from '../shared/protocol';

// 'replaced': this tab's session was taken over by another tab — no reconnects.
export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'replaced';

const DEFAULT_HOST = 'localhost:8787';
const HEARTBEAT_TICK_MS = 5_000;
/** A ping must have gone unanswered at least this long before we give up. */
const PONG_WAIT_MS = 10_000;

export class OnlineClient {
  private socket: PartySocket;
  private messageHandlers = new Set<(msg: ServerMessage) => void>();
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private heartbeat: ReturnType<typeof setInterval>;
  private lastReceived = Date.now(); // anything from the server, pongs included
  private lastPing = 0;
  private unansweredSince: number | null = null; // first ping since lastReceived

  constructor(initial: string, host?: string) {
    this.socket = new PartySocket({
      host: host ?? (import.meta.env.VITE_WS_HOST as string | undefined) ?? DEFAULT_HOST,
      party: 'lobby', // kebab-case of the Durable Object binding name
      room: 'global', // one global lobby: everyone sees everyone
      query: { token: sessionToken(), initial },
    });
    this.socket.addEventListener('open', () => {
      this.heard();
      this.lastPing = Date.now();
      this.emitStatus('open');
    });
    this.socket.addEventListener('close', (ev) => {
      if (ev.code === 4409) {
        this.socket.close(); // another tab owns this session now — stop retrying
        this.emitStatus('replaced');
      } else {
        this.emitStatus('closed');
      }
    });
    this.socket.addEventListener('message', (ev) => {
      this.heard();
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.t === 'pong') return; // heartbeat only — nothing for the UI
        this.messageHandlers.forEach((h) => h(msg));
      } catch {
        // malformed server frame — ignore
      }
    });
    this.heartbeat = setInterval(this.checkHeartbeat, HEARTBEAT_TICK_MS);
  }

  private heard() {
    this.lastReceived = Date.now();
    this.unansweredSince = null;
  }

  private checkHeartbeat = () => {
    if (this.socket.readyState !== WebSocket.OPEN) return; // PartySocket is on it
    const now = Date.now();
    // Silence alone is no proof: a throttled background tab may simply not
    // have pinged in a while. Reconnect only if a ping also went unanswered.
    if (
      now - this.lastReceived >= HEARTBEAT_TIMEOUT_MS &&
      this.unansweredSince !== null &&
      now - this.unansweredSince >= PONG_WAIT_MS
    ) {
      this.unansweredSince = null;
      this.socket.reconnect(); // the server hands our held seat back
      return;
    }
    if (now - this.lastPing >= HEARTBEAT_MS) {
      this.lastPing = now;
      this.unansweredSince ??= now;
      this.sendMsg({ t: 'ping' });
    }
  };

  onMessage(h: (msg: ServerMessage) => void): () => void {
    this.messageHandlers.add(h);
    return () => this.messageHandlers.delete(h);
  }

  onStatus(h: (s: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }

  private emitStatus(s: ConnectionStatus) {
    this.statusHandlers.forEach((h) => h(s));
  }

  private sendMsg(msg: ClientMessage) {
    this.socket.send(JSON.stringify(msg));
  }

  enqueue() {
    this.sendMsg({ t: 'enqueue' });
  }
  dequeue() {
    this.sendMsg({ t: 'dequeue' });
  }
  answerOffer(accept: boolean) {
    this.sendMsg({ t: 'offer_response', accept });
  }
  move(edge: Edge) {
    this.sendMsg({ t: 'move', edge });
  }
  requestSync() {
    this.sendMsg({ t: 'sync' });
  }
  rematch() {
    this.sendMsg({ t: 'rematch' });
  }
  leaveMatch() {
    this.sendMsg({ t: 'leave_match' });
  }
  challenge(tag: string) {
    this.sendMsg({ t: 'challenge', tag });
  }

  close() {
    clearInterval(this.heartbeat);
    this.socket.close();
  }
}
