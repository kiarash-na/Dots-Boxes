# Dots & Boxes

A two-player **Dots and Boxes** game for the browser — offline, vs a bot, and
**online** with live matchmaking. Take turns drawing lines between adjacent
dots on a 10×10 grid — close a square to claim it with your initials. Most
boxes wins.

- 10 × 10 dots · 81 boxes
- Classic rule: closing a box grants an extra turn
- Local two-player: enter two names, share one screen
- Bot opponent with three difficulties
- Online: no accounts — pick a single letter (plus a random 4-digit tag), a
  live lobby, first-come-first-served queue or direct challenges, 30-second
  turns, reconnect within 90 seconds to resume, and a bot game to keep you
  busy while you wait

## Tech stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) build tooling
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) component library
- [react-router](https://reactrouter.com) for routing
- Online mode: [partyserver](https://github.com/cloudflare/partykit) (open
  source, MIT) on Cloudflare Workers + Durable Objects, with
  [partysocket](https://github.com/cloudflare/partykit) in the browser

## Getting started

```bash
npm install
npm run dev      # frontend on http://localhost:3000
```

For online mode, also run the realtime server locally (no Cloudflare account
or config needed — everything is defaulted for local dev):

```bash
cd server
npm install
npm run dev      # WebSocket server on http://localhost:8787
```

Open http://localhost:3000 in two browser windows (one can be incognito),
pick **Play online** in both, and accept the match offer when it pops up.

## Scripts

| Command           | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Start the dev server with HMR         |
| `npm run build`   | Type-check and build to `dist/`       |
| `npm run preview` | Serve the production build locally    |
| `npm run lint`    | Run ESLint                            |

Server (`cd server` first):

| Command                  | What it does                                    |
| ------------------------ | ----------------------------------------------- |
| `npm run dev`            | Local dev server (wrangler) on port 8787        |
| `npm run typecheck`      | Type-check the server                           |
| `node test/smoke.mjs`    | E2E test: full match, challenges, reconnects, turn timeout, abuse cases (`SMOKE_SLOW=1` also waits out the 90s grace period) |
| `npm run deploy`         | Deploy to Cloudflare (needs `npx wrangler login`) |

## How online mode works

One global lobby lives in a single Durable Object. The server is the **single
authority**: it assigns random 4-digit tags, holds the FIFO queue, sends match
offers (both players must accept within 15s; declining sends you to the back
of the line with a short cooldown), and validates every move with the same
`game/engine.ts` the client uses — clients request moves, the server accepts
or rejects them. No client message is ever relayed verbatim to anyone.

- **Identity:** each player picks one letter (A–Z); the server adds a random
  4-digit tag (`K #4821`) so players with the same letter can be told apart.
- **Direct challenges:** click *Challenge* next to any idle or queued player in
  the lobby. Limited to 3 requests a minute, and you can't re-ask the same
  player for 30s after they decline or ignore you. A declined challenge never
  costs anyone their place in the queue.
- **Turn clock:** each move has a 30-second limit; when it runs out the server
  draws a random line for that player.
- **Reconnects:** every tab sends a secret token with its connection. If a
  player drops mid-match, their seat is held for 90 seconds (the clock pauses);
  coming back in time — even after a page reload — restores the same board,
  side and identity. After 90 seconds the remaining player chooses to close,
  find another player, or continue the same game against the robot.

Anti-abuse measures:

- Server-authoritative move validation (right player, right turn, free edge)
- zod schema validation of every incoming message; 8 malformed messages → kick
- Rate limit: 100 messages / 10s per connection
- Origin allowlist on the WebSocket handshake (`ALLOWED_ORIGINS`)
- No logins, no chat, no free-text anywhere — a single A–Z letter is the only input
- Challenge rate limits (3/min per sender, 30s per-target cooldown)

## Project structure

```
src/
├── game/engine.ts        Pure game logic: state, moves, scoring (no React)
├── game/bot.ts           Bot strategies (easy / medium / hard)
├── shared/               Protocol + state (de)serialization, used by client AND server
├── net/client.ts         Typed WebSocket client (auto-reconnect)
├── hooks/useBotGame.ts   Casual bot game while waiting in the queue
├── pages/Home.tsx        Offline / bot game screen
├── pages/Online.tsx      Online lobby, queue, matchmaking, live matches
├── components/
│   ├── online/           Lobby panel, match-offer dialog
│   ├── StartScreen.tsx   Mode picker + player-name entry
│   ├── Board.tsx         Interactive SVG board
│   ├── Scoreboard.tsx    Live scores and turn indicator
│   ├── GameOver.tsx      Winner panel with rematch
│   └── ui/               shadcn/ui component library
├── App.tsx               Routes
└── main.tsx              Entry point

server/
├── src/index.ts          Worker entry: origin allowlist, routing
├── src/lobby.ts          The Lobby Durable Object (presence, queue, matches)
├── src/names.ts          Letter validation + random 4-digit tags
├── wrangler.jsonc        Cloudflare config
└── test/smoke.mjs        E2E smoke test
```

## Deployment

### Realtime server (Cloudflare)

1. Create a free [Cloudflare](https://cloudflare.com) account, then
   `cd server && npx wrangler login`.
2. In `server/wrangler.jsonc`, set `ALLOWED_ORIGINS` to your frontend's
   origin (comma-separated if several).
3. `npm run deploy` — note the printed URL
   (`https://dots-boxes-server.<your-subdomain>.workers.dev`).

The free Workers plan (which includes Durable Objects) is more than enough —
no paid plan needed.

### Frontend (Vercel)

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repo.
2. Add an environment variable: **`VITE_WS_HOST`** =
   `dots-boxes-server.<your-subdomain>.workers.dev` (host only — no `https://`,
   no trailing slash; the client picks `wss://` automatically).
3. Deploy. (`npm run build`, output `dist` — auto-detected.)

`vercel.json` includes an SPA rewrite so client-side routes resolve to
`index.html` on refresh or deep link.

| Variable          | Where                    | Value                                        |
| ----------------- | ------------------------ | -------------------------------------------- |
| `VITE_WS_HOST`    | Vercel project env vars  | Your workers.dev host (no protocol)          |
| `ALLOWED_ORIGINS` | `server/wrangler.jsonc`  | Your Vercel origin, e.g. `https://….vercel.app` |

Locally neither is needed: the client defaults to `localhost:8787` and the
server allows all localhost origins.
