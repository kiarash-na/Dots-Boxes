# Dots & Boxes

A two-player **Dots and Boxes** game for the browser — offline, vs a bot, and
**online** with live matchmaking. Take turns drawing lines between adjacent
dots on a 10×10 grid — close a square to claim it with your initials. Most
boxes wins.

- 10 × 10 dots · 81 boxes
- Classic rule: closing a box grants an extra turn
- Local two-player: enter two names, share one screen
- Bot opponent with three difficulties
- **Tic-tac-toe** (from *More games* on the home page): local two-player or
  vs a bot (easy / medium / unbeatable hard), played as a scored series where
  the first move alternates every round
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
  side and identity. If both players drop at once, each gets their own 90
  seconds. After 90 seconds the remaining player chooses to close, find
  another player, or continue the same game against the robot.
- **Server restarts:** a deploy or runtime restart wipes the Durable Object's
  memory, so live matches (board, seats, identities, rematch votes, absolute
  deadlines) are written to Durable Object storage on every change and
  restored on start-up. Every socket is gone after a restart, so restored
  seats are held for 90 seconds like any dropped player's; a match whose hold
  already ran out while the server was down is discarded.
- **Heartbeat:** the client pings every 20s and reconnects on its own when it
  hears nothing for ~45s, so a socket that died silently (laptop sleep,
  network switch) doesn't sit "open" while the seat hold runs out.
- **Seat lost anyway:** if the server can't give a player their seat back,
  the last board stays on screen and they get the same choice — close, find
  another player, or finish that game against the robot.

Anti-abuse measures:

- Server-authoritative move validation (right player, right turn, free edge)
- zod schema validation of every incoming message; 8 malformed messages → kick
- Rate limit: 100 messages / 10s per connection
- Origin allowlist on the WebSocket handshake (`ALLOWED_ORIGINS`)
- No logins, no chat, no free-text anywhere — a single A–Z letter is the only input
- Challenge rate limits (3/min per sender, 30s per-target cooldown)

Testing the server (from `server/`): with `npm run dev` running,
`node test/smoke.mjs` covers matches, challenges, reconnects, the heartbeat and
abuse cases. `node test/restart.mjs` needs no running server: it starts its
own `wrangler dev` (port 8791, throwaway storage), kills and restarts it
mid-match, and checks both players get their game back.

## Project structure

```
src/
├── game/engine.ts        Pure game logic: state, moves, scoring (no React)
├── game/bot.ts           Bot strategies (easy / medium / hard)
├── games/tictactoe/      Tic-tac-toe: engine, minimax bot, SVG board
├── shared/               Protocol + state (de)serialization, used by client AND server
├── net/client.ts         Typed WebSocket client (auto-reconnect)
├── hooks/useBotGame.ts   Casual bot game while waiting in the queue
├── pages/Home.tsx        Offline / bot game screen
├── pages/Online.tsx      Online lobby, queue, matchmaking, live matches
├── pages/TicTacToe.tsx   Tic-tac-toe start screen and series
├── components/
│   ├── online/           Lobby panel, match-offer dialog
│   ├── StartScreen.tsx   Mode picker + player-name entry
│   ├── MoreGames.tsx     Links to the other mini games on the home page
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
