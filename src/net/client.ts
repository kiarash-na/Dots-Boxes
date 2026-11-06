// ─── Online client — typed wrapper around the lobby WebSocket ───────────────
// PartySocket handles reconnects with backoff. Every connection carries this
// tab's secret token, so after a drop the server can hand back a held match
// seat: `welcome.resumed` says whether it did. A non-resumed `welcome` means
// the server treats us as brand new.

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
import type { ClientMessage, ServerMessage } from '../shared/protocol';

// 'replaced': this tab's session was taken over by another tab — no reconnects.
export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'replaced';

const DEFAULT_HOST = 'localhost:8787';

export class OnlineClient {
  private socket: PartySocket;
  private messageHandlers = new Set<(msg: ServerMessage) => void>();
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();

  constructor(host?: string) {
    this.socket = new PartySocket({
      host: host ?? (import.meta.env.VITE_WS_HOST as string | undefined) ?? DEFAULT_HOST,
      party: 'lobby', // kebab-case of the Durable Object binding name
      room: 'global', // one global lobby: everyone sees everyone
      query: { token: sessionToken() },
    });
    this.socket.addEventListener('open', () => this.emitStatus('open'));
    this.socket.addEventListener('close', (ev) => {
      if (ev.code === 4409) {
        this.socket.close(); // another tab owns this session now — stop retrying
        this.emitStatus('replaced');
      } else {
        this.emitStatus('closed');
      }
    });
    this.socket.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        this.messageHandlers.forEach((h) => h(msg));
      } catch {
        // malformed server frame — ignore
      }
    });
  }

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

  close() {
    this.socket.close();
  }
}
