// End-to-end smoke test for the lobby server. Run `npm run dev` (wrangler)
// in server/ first, then: `node test/smoke.mjs`
// Exercises: welcome/names, lobby broadcast, FIFO queue, match offers,
// authoritative moves, wrong-turn rejection, full game, rematch + side swap,
// leaving, offer decline order, malformed-message kicks, origin allowlist.

const URL = process.env.SMOKE_URL ?? 'ws://localhost:8787/parties/lobby/global';
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:3000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

class TestClient {
  constructor(tag, origin = ORIGIN) {
    this.tag = tag;
    this.backlog = [];
    this.waiters = [];
    this.ws = new WebSocket(URL, { headers: { Origin: origin } });
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
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
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

// Track a board locally: which edges are taken and whose turn it is.
function makeBoard() {
  return { h: new Set(), v: new Set(), current: 0, over: false };
}
function mark(board, edge, current, over) {
  board[edge.orientation].add(`${edge.row},${edge.col}`);
  board.current = current;
  board.over = over;
}
function firstFree(board) {
  for (let r = 0; r <= 9; r++)
    for (let c = 0; c <= 8; c++)
      if (!board.h.has(`${r},${c}`)) return { orientation: 'h', row: r, col: c };
  for (let r = 0; r <= 8; r++)
    for (let c = 0; c <= 9; c++)
      if (!board.v.has(`${r},${c}`)) return { orientation: 'v', row: r, col: c };
  return null;
}

async function main() {
  console.log('— connect & lobby —');
  const a = new TestClient('A');
  const b = new TestClient('B');
  await Promise.all([a.opened, b.opened]);
  const [wa, wb] = await Promise.all([a.waitFor('welcome'), b.waitFor('welcome')]);
  assert(wa.name && wb.name, 'both clients got random names');
  assert(wa.name !== wb.name, `names are unique (${wa.name} / ${wb.name})`);

  // Snapshots arrive on every join; wait for one that shows both players.
  let la = await a.waitFor('lobby');
  for (let i = 0; i < 10 && la.players.length < 2; i++) la = await a.waitFor('lobby');
  assert(la.players.length >= 2, 'lobby lists both players');
  assert(la.players.some((p) => p.name === wa.name), 'lobby contains A');

  console.log('— queue & offer —');
  a.send({ t: 'enqueue' });
  b.send({ t: 'enqueue' });
  const [qa, qb] = await Promise.all([a.waitFor('queue'), b.waitFor('queue')]);
  // Both may get several queue updates; final positions must be 1 and 2.
  const [oa, ob] = await Promise.all([a.waitFor('offer'), b.waitFor('offer')]);
  assert(oa.opponentName === wb.name, 'A offered B by name');
  assert(ob.opponentName === wa.name, 'B offered A by name');
  void qa;
  void qb;

  console.log('— decline path —');
  a.send({ t: 'offer_response', accept: true });
  await a.waitFor('offer_pending');
  b.send({ t: 'offer_response', accept: false });
  const oc = await a.waitFor('offer_cancelled');
  assert(oc.reason === 'declined', 'accepter told the offer was declined');

  // Next offer should pair them again after B's cooldown (20s) — too slow for
  // a test, so just verify positions: A front, B back. Queue messages may be
  // stale in the backlog, so read until we see the post-decline ordering.
  let posA = await a.waitFor('queue');
  for (let i = 0; i < 10 && posA.position !== 1; i++) posA = await a.waitFor('queue');
  assert(posA.position === 1, 'declined-against player back at front of queue');

  console.log('— accept & match start —');
  const [oa2, ob2] = await Promise.all([a.waitFor('offer', 30000), b.waitFor('offer', 30000)]);
  void oa2;
  void ob2;
  a.send({ t: 'offer_response', accept: true });
  b.send({ t: 'offer_response', accept: true });
  const [msA, msB] = await Promise.all([a.waitFor('match_start'), b.waitFor('match_start')]);
  assert(msA.side !== msB.side, 'players got opposite sides');
  assert(msA.state.h.length === 90 && msA.state.boxes.length === 81, 'initial state on the wire');

  console.log('— wrong turn rejected —');
  const notCurrent = msA.side === 0 ? b : a; // Red (side 0) moves first
  notCurrent.send({ t: 'move', edge: { orientation: 'h', row: 0, col: 0 } });
  const rej = await notCurrent.waitFor('move_rejected');
  assert(rej.reason === 'not_your_turn', 'server rejected a move on the wrong turn');

  console.log('— full game to completion —');
  const boardA = makeBoard();
  const boardB = makeBoard();
  const playLoop = async (client, board, me) => {
    for (;;) {
      const m = await client.waitFor('move_applied', 15000);
      mark(board, m.edge, m.current, m.over);
      if (m.over) return m;
      if (m.current === me) {
        const edge = firstFree(board);
        await sleep(150); // stay comfortably under the server's rate limit
        client.send({ t: 'move', edge });
      }
    }
  };
  // Kick off: side 0 moves first.
  const starter = msA.side === 0 ? a : b;
  starter.send({ t: 'move', edge: firstFree(msA.side === 0 ? boardA : boardB) });
  const [endA, endB] = await Promise.all([
    playLoop(a, boardA, msA.side),
    playLoop(b, boardB, msB.side),
  ]);
  assert(endA.over && endB.over, 'game played to completion (180 edges)');
  assert(endA.turn === 180, `server counted all edges (turn=${endA.turn})`);

  console.log('— rematch with swapped colors —');
  a.send({ t: 'rematch' });
  const rr = await b.waitFor('rematch_requested');
  assert(rr.byName === wa.name, 'opponent notified of rematch request');
  b.send({ t: 'rematch' });
  const [rsA, rsB] = await Promise.all([a.waitFor('match_start'), b.waitFor('match_start')]);
  assert(rsA.side === 1 - msA.side && rsB.side === 1 - msB.side, 'sides swapped on rematch');
  assert(rsA.state.turn === 0, 'fresh board on rematch');

  console.log('— leave match —');
  a.send({ t: 'leave_match' });
  const me2 = await b.waitFor('match_ended');
  assert(me2.reason === 'opponent_left', 'remaining player notified');

  console.log('— offer expiry notifies both non-responders —');
  const e = new TestClient('E');
  const f = new TestClient('F');
  await Promise.all([e.opened, f.opened]);
  await Promise.all([e.waitFor('welcome'), f.waitFor('welcome')]);
  e.send({ t: 'enqueue' });
  f.send({ t: 'enqueue' });
  await Promise.all([e.waitFor('offer'), f.waitFor('offer')]);
  // Neither responds — the offer lapses after OFFER_TTL_MS (15s).
  const [exE, exF] = await Promise.all([
    e.waitFor('offer_cancelled', 20000),
    f.waitFor('offer_cancelled', 20000),
  ]);
  assert(exE.reason === 'expired' && exF.reason === 'expired', 'both told the offer expired');
  e.close();
  f.close();

  console.log('— abuse: malformed messages get you kicked —');
  const evil = new TestClient('EVIL');
  await evil.opened;
  await evil.waitFor('welcome');
  for (let i = 0; i < 10; i++) evil.send('this is not json');
  const closeEv = await evil.closed;
  assert(closeEv.code === 4400, `kicked with 4400 (got ${closeEv.code})`);

  console.log('— abuse: disallowed origin rejected —');
  let originBlocked = false;
  try {
    const bad = new TestClient('BADORIGIN', 'https://evil.example.com');
    await bad.opened;
  } catch {
    originBlocked = true;
  }
  assert(originBlocked, 'handshake from evil.example.com refused');

  a.close();
  b.close();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
