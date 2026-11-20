import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Bot, Globe, Users } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Difficulty } from '../game/bot';
import { BLUE, RED } from '../game/engine';
import type { Player, PlayerId } from '../game/engine';
import TicTacToeBoard from '../games/tictactoe/TicTacToeBoard';
import { TTT_DIFFICULTIES, chooseCell } from '../games/tictactoe/bot';
import { applyMove, newGame } from '../games/tictactoe/engine';
import type { TttState } from '../games/tictactoe/engine';

const MARK = ['X', 'O'] as const;

/** A series of rounds between the same two players; who starts alternates. */
interface Session {
  game: TttState;
  wins: [number, number];
  draws: number;
  round: number;
}

const freshSession = (): Session => ({ game: newGame(0), wins: [0, 0], draws: 0, round: 1 });

function play(s: Session, cell: number): Session {
  const game = applyMove(s.game, cell);
  if (!game) return s;
  if (!game.over) return { ...s, game };
  if (game.winner === null) return { ...s, game, draws: s.draws + 1 };
  const wins: [number, number] = [...s.wins];
  wins[game.winner]++;
  return { ...s, game, wins };
}

const nextRound = (s: Session): Session => ({
  ...s,
  game: newGame((s.round % 2) as PlayerId), // round 1: X starts, round 2: O, …
  round: s.round + 1,
});

export default function TicTacToe() {
  const [players, setPlayers] = useState<[Player, Player] | null>(null);
  const [bot, setBot] = useState<{ side: PlayerId; difficulty: Difficulty } | null>(null);
  const [session, setSession] = useState<Session>(freshSession);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Tic-tac-toe · Dots & Boxes';
    return () => {
      document.title = prev;
    };
  }, []);

  const start = useCallback((xName: string, oName: string, botDifficulty?: Difficulty) => {
    setPlayers([
      { ...RED, name: xName, initials: 'X' },
      { ...BLUE, name: oName, initials: 'O' },
    ]);
    setBot(botDifficulty ? { side: 1, difficulty: botDifficulty } : null);
    setSession(freshSession());
  }, []);

  const quit = useCallback(() => {
    setPlayers(null);
    setBot(null);
    setSession(freshSession());
  }, []);

  const move = useCallback(
    (cell: number) => {
      setSession((s) => (bot && s.game.current === bot.side ? s : play(s, cell)));
    },
    [bot]
  );

  const { game } = session;
  const botTurn = bot !== null && !game.over && game.current === bot.side;

  // Bot driver: a short pause so its move reads as a move.
  useEffect(() => {
    if (!botTurn || !bot) return;
    const t = setTimeout(
      () => {
        setSession((s) =>
          s.game.over || s.game.current !== bot.side ? s : play(s, chooseCell(s.game, bot.difficulty))
        );
      },
      420 + Math.random() * 280
    );
    return () => clearTimeout(t);
  }, [botTurn, bot, session]);

  if (!players) {
    return (
      <main className="min-h-screen bg-white">
        <TicTacToeStart onStart={start} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col px-5 py-6 sm:py-10">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-[17px] font-extrabold tracking-[-0.03em] text-[#10131A]">Tic-tac-toe</h1>
          <MiniMarks />
        </header>

        <SeriesBoard
          session={session}
          players={players}
          bot={bot}
          onQuit={quit}
          onChangeDifficulty={(d) => setBot((b) => (b ? { ...b, difficulty: d } : b))}
        />

        <div className="mt-6 flex-1">
          <TicTacToeBoard state={game} players={players} onMove={move} locked={botTurn} />
          <RoundOver
            session={session}
            players={players}
            onNextRound={() => setSession(nextRound)}
            onQuit={quit}
          />
        </div>

        <footer className="pt-4 text-center text-[11px] text-[#B8BECC]">
          Three in a row wins · who goes first alternates every round
        </footer>
      </div>
    </main>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

function MiniMarks() {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden>
      <g stroke={RED.color} strokeWidth="2.6" strokeLinecap="round">
        <line x1="2" y1="2" x2="12" y2="12" />
        <line x1="12" y1="2" x2="2" y2="12" />
      </g>
      <circle cx="26" cy="7" r="5.2" fill="none" stroke={BLUE.color} strokeWidth="2.6" />
    </svg>
  );
}

function SeriesBoard({
  session,
  players,
  bot,
  onQuit,
  onChangeDifficulty,
}: {
  session: Session;
  players: [Player, Player];
  bot: { side: PlayerId; difficulty: Difficulty } | null;
  onQuit: () => void;
  onChangeDifficulty: (d: Difficulty) => void;
}) {
  const { game, wins, draws, round } = session;
  return (
    <div className="w-full">
      <div className="flex items-stretch justify-between gap-6">
        {([0, 1] as const).map((i) => {
          const p = players[i];
          const active = !game.over && game.current === i;
          return (
            <div key={p.color} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-extrabold leading-none" style={{ color: p.color }}>
                  {MARK[i]}
                </span>
                <span
                  className="truncate text-[12px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: p.color }}
                >
                  {p.name}
                </span>
              </div>
              <div
                className="mt-1 text-[52px] font-extrabold leading-none tracking-[-0.04em] text-[#10131A] transition-opacity"
                style={{ fontVariantNumeric: 'tabular-nums', opacity: active || game.over ? 1 : 0.28 }}
              >
                {wins[i]}
              </div>
              <div className="mt-2 h-[3px] w-full" style={{ background: active ? p.color : '#EEF0F5' }} />
              {active && (
                <p className="mt-2 text-[12px] font-semibold" style={{ color: p.color }}>
                  {bot && i === bot.side ? '· thinking…' : bot ? '· your turn' : `· ${p.name}'s turn`}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-col items-end justify-start pt-1">
          <ConfirmDialog
            trigger={
              <button className="border border-[#E4E7EE] px-3 py-1.5 text-[12px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]">
                New game
              </button>
            }
            title="Start over?"
            description="This series ends and you'll return to the tic-tac-toe start screen."
            actionLabel="Yes, start over"
            onConfirm={onQuit}
          />
          <p className="mt-2 text-[11px] tabular-nums text-[#8A91A1]">
            Round {round} · {draws} {draws === 1 ? 'draw' : 'draws'}
          </p>
        </div>
      </div>

      {bot && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A91A1]">Bot</span>
          {TTT_DIFFICULTIES.map(({ key, label }) =>
            bot.difficulty === key ? (
              <button
                key={key}
                disabled
                className="border border-[#10131A] px-3 py-1.5 text-[11px] font-semibold text-[#10131A]"
              >
                {label}
              </button>
            ) : (
              <button
                key={key}
                onClick={() => onChangeDifficulty(key)}
                className="border border-[#E4E7EE] px-3 py-1.5 text-[11px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]"
              >
                {label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function RoundOver({
  session,
  players,
  onNextRound,
  onQuit,
}: {
  session: Session;
  players: [Player, Player];
  onNextRound: () => void;
  onQuit: () => void;
}) {
  const { game, wins, draws, round } = session;
  if (!game.over) return null;
  const winner = game.winner === null ? null : players[game.winner];
  const next = (round % 2) as PlayerId;

  // Sits under the board (not over it) so the winning line stays visible;
  // appears once the strike-through has drawn.
  return (
    <div className="gameover-in mx-auto mt-6 w-full max-w-[460px] bg-white p-6 shadow-[0_24px_60px_-24px_rgba(16,19,26,0.35)] ring-1 ring-[#EEF0F5] [animation-delay:0.45s] [animation-fill-mode:both]">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[12px] font-bold uppercase tracking-[0.16em]"
            style={{ color: winner ? winner.color : '#8A91A1' }}
          >
            Round {round}
            {winner && ` · ${MARK[game.winner!]} wins`}
          </p>
          <p className="mt-1 truncate text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[#10131A]">
            {winner ? winner.name : "It's a draw"}
          </p>
        </div>
        <p className="shrink-0 pb-1 text-[15px] tabular-nums text-[#5A6070]">
          <span className="font-bold" style={{ color: players[0].color }}>
            {wins[0]}
          </span>
          {' – '}
          <span className="font-bold" style={{ color: players[1].color }}>
            {wins[1]}
          </span>
          {draws > 0 && <span className="text-[#8A91A1]">{` · ${draws} ${draws === 1 ? 'draw' : 'draws'}`}</span>}
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={onNextRound}
          autoFocus
          className="flex-1 bg-[#10131A] px-6 py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Next round
        </button>
        <button
          onClick={onQuit}
          className="border border-[#E4E7EE] px-4 py-3 text-[13px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]"
        >
          New players
        </button>
      </div>
      <p className="mt-3 text-[12px] text-[#8A91A1]">
        Next round:{' '}
        <span className="font-bold" style={{ color: players[next].color }}>
          {MARK[next]}
        </span>{' '}
        ({players[next].name}) goes first
      </p>
    </div>
  );
}

// ── start screen ──────────────────────────────────────────────────────────

const MODES = [
  { key: 'offline', icon: Users, title: 'Play offline', description: 'With someone next to you', soon: false },
  { key: 'bot', icon: Bot, title: 'Play against a bot', description: 'Easy, medium, or unbeatable', soon: false },
  { key: 'online', icon: Globe, title: 'Play online', description: 'With a random player', soon: true },
] as const;

const inputClass =
  'w-full border-b-2 border-[#E4E7EE] bg-transparent py-2.5 text-[20px] font-semibold tracking-[-0.01em] text-[#10131A] outline-none transition-colors placeholder:font-normal placeholder:text-[#B8BECC]';

function TicTacToeStart({ onStart }: { onStart: (x: string, o: string, bot?: Difficulty) => void }) {
  const [mode, setMode] = useState<'menu' | 'offline' | 'bot'>('menu');
  const [xName, setXName] = useState('');
  const [oName, setOName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const ready = mode === 'bot' ? xName.trim().length > 0 : xName.trim().length > 0 && oName.trim().length > 0;
  const submit = () => {
    if (!ready) return;
    if (mode === 'bot') onStart(xName.trim(), 'Bot', difficulty);
    else onStart(xName.trim(), oName.trim());
  };

  const back =
    mode === 'menu' ? (
      <Link
        to="/"
        className="mb-8 flex w-fit items-center gap-1.5 text-[13px] font-bold text-[#8A91A1] transition-colors hover:text-[#10131A]"
      >
        <ArrowLeft size={15} strokeWidth={2.5} />
        All games
      </Link>
    ) : (
      <button
        onClick={() => setMode('menu')}
        className="mb-8 flex w-fit items-center gap-1.5 text-[13px] font-bold text-[#8A91A1] transition-colors hover:text-[#10131A]"
      >
        <ArrowLeft size={15} strokeWidth={2.5} />
        All modes
      </button>
    );

  if (mode === 'menu') {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        {back}
        <MiniMarks />
        <h1 className="mt-3 text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10131A]">
          Tic-tac-toe
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#5A6070]">
          Take turns marking the grid — three in a row wins. Play a series and keep score.
        </p>

        <div className="mt-10 space-y-3">
          {MODES.map(({ key, icon: Icon, title, description, soon }) => (
            <button
              key={key}
              onClick={() => key !== 'online' && setMode(key)}
              disabled={soon}
              className="group relative flex w-full items-center gap-4 border border-[#E4E7EE] bg-white px-5 py-4 text-left transition-colors enabled:hover:border-[#10131A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#10131A] text-white">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-bold tracking-[-0.01em] text-[#10131A]">{title}</span>
                <span className="block text-[13px] text-[#8A91A1]">{description}</span>
              </span>
              {soon ? (
                <span className="ml-auto shrink-0 bg-[#F1F3F8] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A91A1]">
                  Coming soon
                </span>
              ) : (
                <span className="ml-auto shrink-0 transition-transform group-hover:scale-110">
                  <MiniMarks />
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-[#8A91A1]">3 × 3 grid · three in a row wins</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      {back}
      <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10131A]">
        {mode === 'bot' ? 'Play against a bot' : 'Play offline'}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[#5A6070]">
        {mode === 'bot'
          ? 'You play X and move first. Enter your name to start.'
          : 'Two players, one screen. Enter your names to start.'}
      </p>

      <div className="mt-10 space-y-5">
        <div>
          <label
            htmlFor="ttt-x"
            className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#FF1E1E]"
          >
            <span className="text-[13px] font-extrabold">X</span>
            {mode === 'bot' ? 'You — Red' : 'Player one — Red'}
          </label>
          <input
            id="ttt-x"
            value={xName}
            onChange={(e) => setXName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Ada Lovelace"
            maxLength={24}
            autoFocus
            className={`${inputClass} focus:border-[#FF1E1E]`}
          />
        </div>

        {mode === 'offline' ? (
          <div>
            <label
              htmlFor="ttt-o"
              className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#004EFF]"
            >
              <span className="text-[13px] font-extrabold">O</span>
              Player two — Blue
            </label>
            <input
              id="ttt-o"
              value={oName}
              onChange={(e) => setOName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="e.g. Alan Turing"
              maxLength={24}
              className={`${inputClass} focus:border-[#004EFF]`}
            />
          </div>
        ) : (
          <div className="pt-3">
            <p className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#004EFF]">
              <span className="text-[13px] font-extrabold">O</span>
              Bot — Blue
            </p>
            <div className="mt-3 space-y-2">
              {TTT_DIFFICULTIES.map(({ key, label, blurb }) => (
                <button
                  key={key}
                  onClick={() => setDifficulty(key)}
                  className={`flex w-full items-baseline justify-between border px-4 py-3 text-left transition-colors ${
                    difficulty === key ? 'border-[#10131A]' : 'border-[#E4E7EE] hover:border-[#10131A]'
                  }`}
                >
                  <span className="text-[15px] font-bold tracking-[-0.01em] text-[#10131A]">{label}</span>
                  <span className="text-[12px] text-[#8A91A1]">{blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={!ready}
        className="group mt-12 flex w-full items-center justify-between bg-[#10131A] px-6 py-4 text-left text-[16px] font-bold tracking-[-0.01em] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
      >
        Start game
        <span className="transition-transform group-hover:scale-110">
          <MiniMarks />
        </span>
      </button>

      <p className="mt-4 text-center text-[12px] text-[#8A91A1]">
        {mode === 'bot' ? "You can change the bot's difficulty between moves" : 'Who goes first alternates every round'}
      </p>
    </div>
  );
}
