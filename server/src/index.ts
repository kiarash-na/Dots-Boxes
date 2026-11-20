// ─── Worker entry: origin allowlist, health check, partyserver routing ──────

import { routePartykitRequest } from 'partyserver';
import { Lobby } from './lobby';

export { Lobby };

export interface Env {
  Lobby: DurableObjectNamespace<Lobby>;
  ALLOWED_ORIGINS?: string;
}

const LOCAL_ORIGINS = [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    // Browsers always send Origin on WebSocket handshakes; only our own
    // frontends (and localhost in dev) may connect.
    const origin = request.headers.get('Origin');
    if (origin) {
      const extra = (env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed = LOCAL_ORIGINS.some((re) => re.test(origin)) || extra.includes(origin);
      if (!allowed) return new Response('Forbidden origin', { status: 403 });
    }

    // Every socket must get its own connection id, so the server picks it.
    // partysocket sends a `_pk` id and reuses it on every reconnect: a retry
    // that arrives before the server has noticed the old socket died would
    // share that socket's id, and the lobby would close the new connection
    // as the "stale" one — the player could never get back into their game.
    if (url.searchParams.has('_pk')) {
      url.searchParams.delete('_pk');
      request = new Request(url, request);
    }

    return (
      (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
