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

    return (
      (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
