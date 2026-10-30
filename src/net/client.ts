// ─── Online client — typed wrapper around the lobby WebSocket ───────────────
// PartySocket handles reconnects with backoff. A reconnect is a brand-new
// connection on the server, which replies with a fresh `welcome`; consumers
// should treat `welcome` as "reset all online state".

import { PartySocket } from 'partysocket';
import type { Edge } from '../game/engine';
import type { ClientMessage, ServerMessage } from '../shared/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

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
    });
    this.socket.addEventListener('open', () => this.emitStatus('open'));
    this.socket.addEventListener('close', () => this.emitStatus('closed'));
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
