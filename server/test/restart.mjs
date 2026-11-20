// Restart test: live matches survive a server restart (deploy, runtime
// update, eviction) — the Lobby Durable Object loses its memory but not its
// storage. This script runs its OWN `wrangler dev` (it has to kill it), with
// a throwaway state directory, so it does not touch your dev server:
//
//   cd server && node test/restart.mjs
//
// Port 8791 by default (RESTART_PORT=… to change). It plays part of two
// matches — one with both players connected, one where a player had already
// dropped — kills wrangler mid-match, starts it again on the same storage and
// checks every player gets `welcome.resumed=true`, the same identity, side
// and board, and that play continues. SMOKE_SLOW=1 also checks that a match
// whose seats ran out while the server was down is dropped (takes ~2 min).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.RESTART_PORT ?? 8791);
const HTTP = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/parties/lobby/global`;
const ORIGIN = 'http://localhost:3000';
const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = mkdtempSync(join(tmpdir(), 'dots-restart-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

// ── the server under test ───────────────────────────────────────────────────

let wrangler = null;
let wranglerLog = '';

async function startServer() {
  wranglerLog = '';
  wrangler = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(PORT), '--persist-to', STATE_DIR],
    { cwd: SERVER_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  wrangler.stdout.on('data', (d) => (wranglerLog += d));
  wrangler.stderr.on('data', (d) => (wranglerLog += d));
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${HTTP}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`wrangler did not start:\n${wranglerLog}`);
}

/** Kill wrangler (and its workerd) — every socket dies, memory is gone. */
async function stopServer() {
  const p = wrangler;
  wrangler = null;
  if (!p || p.exitCode !== null) return;
  const exited = new Promise((r) => p.once('exit', r));
  try {
    process.kill(-p.pid, 'SIGTERM'); // the whole process group
  } catch {
    // already gone
  }
  await Promise.race([exited, sleep(10000)]);
  try {
    process.kill(-p.pid, 'SIGKILL');
  } catch {
    // exited cleanly
  }
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`${HTTP}/health`);
    } catch {
      return; // port is free
    }
    await sleep(250);
  }
}

// ── a minimal client (same shape as smoke.mjs) ──────────────────────────────

class TestClient {
  constructor(tag, token, initial = 'R') {
    this.tag = tag;
    this.backlog = [];
    this.waiters = [];
    const q = new URLSearchParams({ token, initial });
    this.ws = new WebSocket(`${WS_URL}?${q}`, { headers: { Origin: ORIGIN } });
    this.opened = new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.closed = new Promise((res) => this.ws.addEventListener('close', res, { once: true }));
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const i = this.waiters.findIndex((w) => w.type === msg.t);
      if (i !== -1) {
        const [w] = this.waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(msg);
      } else {
        this.backlog.push(msg);
      }
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  waitFor(type, timeoutMs = 8000) {
    const i = this.backlog.findIndex((m) => m.t === type);
    if (i !== -1) return Promise.resolve(this.backlog.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.tag}: timeout waiting for "${type}"`)),
        timeoutMs
      );
      this.waiters.push({ type, resolve, timer });
    });
  }
  close() {
    this.ws.close();
  }
}

/** Two fresh token-carrying players, matched with each other. */
async function tokenMatch(tagA, tagB) {
  const tA = crypto.randomUUID();
  const tB = crypto.randomUUID();
  const x = new TestClient(tagA, tA, 'R');
  const y = new TestClient(tagB, tB, 'S');
  const [wx, wy] = await Promise.all([x.waitFor('welcome'), y.waitFor('welcome')]);
  x.send({ t: 'enqueue' });
  y.send({ t: 'enqueue' });
  await Promise.all([x.waitFor('offer'), y.waitFor('offer')]);
  x.send({ t: 'offer_response', accept: true });
  y.send({ t: 'offer_response', accept: true });
  const [mx, my] = await Promise.all([x.waitFor('match_start'), y.waitFor('match_start')]);
  return { x, y, tA, tB, wx, wy, mx, my };
}

// First free line on a wire-format board.
function firstFree(state) {
  const h = state.h.indexOf(-1);
  if (h !== -1) return { orientation: 'h', row: Math.floor(h / 9), col: h % 9 };
  const v = state.v.indexOf(-1);
  return { orientation: 'v', row: Math.floor(v / 10), col: v % 10 };
}

/** Play `n` moves (whoever's turn it is), return the authoritative board. */
async function play({ x, y, mx }, n) {
  for (let i = 0; i < n; i++) {
    x.send({ t: 'sync' });
    const { state } = await x.waitFor('state');
    const mover = state.current === mx.side ? x : y;
    mover.send({ t: 'move', edge: firstFree(state) });
    await Promise.all([x.waitFor('move_applied'), y.waitFor('move_applied')]);
  }
  x.send({ t: 'sync' });
  return (await x.waitFor('state')).state;
}

const sameBoard = (a, b) =>
  JSON.stringify([a.h, a.v, a.boxes, a.current, a.turn, a.over]) ===
  JSON.stringify([b.h, b.v, b.boxes, b.current, b.turn, b.over]);

/** Reconnect with a token and check the seat comes back as it was. */
async function comeBack(label, token, was, board) {
  const c = new TestClient(label, token, 'Z'); // a different letter: identity is the server's
  const w = await c.waitFor('welcome', 15000);
  assert(w.resumed === true, `${label}: welcome.resumed=true after the restart`);
  assert(
    w.me.initial === was.welcome.me.initial && w.me.tag === was.welcome.me.tag,
    `${label}: same identity (${w.me.initial} #${w.me.tag})`
  );
  const ms = await c.waitFor('match_start');
  assert(ms.side === was.start.side, `${label}: same side`);
  assert(sameBoard(ms.state, board), `${label}: same board (turn ${ms.state.turn})`);
  return { c, w, ms };
}

// ── the test ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`starting wrangler on :${PORT} (state in ${STATE_DIR})`);
  await startServer();

  console.log('— before the restart —');
  const live = await tokenMatch('A', 'B'); // both connected when the server dies
  const liveBoard = await play(live, 5);
  assert(liveBoard.turn === 5, 'match A/B in progress (5 lines drawn)');

  const half = await tokenMatch('C', 'D'); // C had already dropped
  const halfBoard = await play(half, 2);
  half.x.close();
  await half.y.waitFor('opponent_away');
  const cDroppedAt = Date.now();
  assert(halfBoard.turn === 2, 'match C/D in progress, C dropped before the restart');
  await sleep(4000); // so a hold wrongly restarted at restore time would show

  console.log('— restart the server mid-match —');
  await stopServer();
  await Promise.all([live.x.closed, live.y.closed, half.y.closed]);
  assert(true, 'server killed: every socket closed');
  await startServer();

  console.log('— both players come back to the same game —');
  const a = await comeBack('A', live.tA, { welcome: live.wx, start: live.mx }, liveBoard);
  assert(a.ms.turnMs === null, 'A: clock paused while B is still away');
  const awayB = await a.c.waitFor('opponent_away');
  assert(awayB.graceMs > 60000 && awayB.graceMs <= 90000, `A: told B's seat is held (${awayB.graceMs}ms)`);
  a.c.send({ t: 'move', edge: firstFree(liveBoard) });
  const paused = await a.c.waitFor('move_rejected');
  assert(paused.reason === 'opponent_away', 'A: no moves until B is back');

  const b = await comeBack('B', live.tB, { welcome: live.wy, start: live.my }, liveBoard);
  assert(typeof b.ms.turnMs === 'number', 'B: both back, turn clock running');
  const backB = await a.c.waitFor('opponent_back');
  assert(typeof backB.turnMs === 'number', 'A: told B is back');

  const mover = liveBoard.current === live.mx.side ? a.c : b.c;
  mover.send({ t: 'move', edge: firstFree(liveBoard) });
  const [ma, mb] = await Promise.all([a.c.waitFor('move_applied'), b.c.waitFor('move_applied')]);
  assert(ma.turn === 6 && mb.turn === 6, 'play continues after the restart (turn 6)');

  const newcomer = new TestClient('N', crypto.randomUUID(), 'R');
  const wn = await newcomer.waitFor('welcome');
  const held = [live.wx, live.wy, half.wx, half.wy].map((w) => w.me.tag);
  assert(wn.resumed === false && !held.includes(wn.me.tag), `a new player gets a fresh, unused tag (${wn.me.tag})`);
  newcomer.close();

  console.log('— a seat that was already held keeps its original deadline —');
  const d = await comeBack('D', half.tB, { welcome: half.wy, start: half.my }, halfBoard);
  const awayC = await d.c.waitFor('opponent_away');
  const left = 90000 - (Date.now() - cDroppedAt);
  assert(
    awayC.graceMs <= left + 500,
    `D: C's hold was not restarted (${awayC.graceMs}ms left, at most ~${left}ms)`
  );
  const c = await comeBack('C', half.tA, { welcome: half.wx, start: half.mx }, halfBoard);
  await d.c.waitFor('opponent_back');
  assert(true, 'C back in time: D told the game continues');

  if (process.env.SMOKE_SLOW) {
    console.log('— a match whose seats expired while the server was down is dropped —');
    // Both connected, turn clock running: the latest the old server can have
    // died is the turn deadline (≤30s away), plus the 90s grace.
    await play({ x: a.c, y: b.c, mx: live.mx }, 1);
    await stopServer();
    console.log('  (server down for 125s)');
    await sleep(125000);
    await startServer();
    const late = new TestClient('A-late', live.tA);
    const wl = await late.waitFor('welcome', 15000);
    assert(wl.resumed === false, 'late reconnect after the hold ran out starts fresh');
    late.close();
  }

  for (const cl of [a.c, b.c, d.c, c.c]) cl.close();
}

let crashed = false;
try {
  await main();
} catch (err) {
  crashed = true;
  console.error('restart test crashed:', err);
  if (wranglerLog) console.error(wranglerLog.split('\n').slice(-30).join('\n'));
} finally {
  await stopServer();
  rmSync(STATE_DIR, { recursive: true, force: true });
}
console.log(!crashed && failures === 0 ? '\nALL PASS' : `\n${crashed ? 'CRASHED' : `${failures} FAILURE(S)`}`);
process.exit(!crashed && failures === 0 ? 0 : 1);
