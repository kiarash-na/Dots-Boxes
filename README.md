# Dots & Boxes

A two-player **Dots and Boxes** game for the browser. Take turns drawing lines
between adjacent dots on a 10×10 grid — close a square to claim it with your
initials. Most boxes wins.

- 10 × 10 dots · 81 boxes
- Classic rule: closing a box grants an extra turn
- Local two-player: enter two names, share one screen
- SVG board with hover previews and capture animations

## Tech stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) build tooling
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) component library
- [react-router](https://reactrouter.com) for routing

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:3000
```

## Scripts

| Command           | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Start the dev server with HMR         |
| `npm run build`   | Type-check and build to `dist/`       |
| `npm run preview` | Serve the production build locally    |
| `npm run lint`    | Run ESLint                            |

## Project structure

```
src/
├── game/engine.ts        Pure game logic: state, moves, scoring (no React)
├── pages/Home.tsx        Game screen container
├── components/
│   ├── StartScreen.tsx   Player-name entry
│   ├── Board.tsx         Interactive SVG board
│   ├── Scoreboard.tsx    Live scores and turn indicator
│   ├── GameOver.tsx      Winner panel with rematch
│   └── ui/               shadcn/ui component library
├── App.tsx               Routes
└── main.tsx              Entry point
```

## Deployment (Vercel)

The repo is ready to import into Vercel:

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repo.
2. Vercel auto-detects Vite — keep the defaults (`npm run build`, output `dist`).
3. Deploy.

`vercel.json` includes an SPA rewrite so client-side routes resolve to
`index.html` on refresh or deep link.
