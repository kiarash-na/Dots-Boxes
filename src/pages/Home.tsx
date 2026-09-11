import { useCallback, useEffect, useState } from 'react';
import Board from '../components/Board';
import GameOver from '../components/GameOver';
import Scoreboard from '../components/Scoreboard';
import StartScreen from '../components/StartScreen';
import { chooseMove } from '../game/bot';
import type { Difficulty } from '../game/bot';
import { BLUE, RED, applyMove, makeInitials, newGame } from '../game/engine';
import type { Edge, GameState, Player } from '../game/engine';

export default function Home() {
  const [players, setPlayers] = useState<[Player, Player] | null>(null);
  const [state, setState] = useState<GameState>(newGame);
  const [bot, setBot] = useState<{ side: 1; difficulty: Difficulty } | null>(null);

  const start = useCallback((redName: string, blueName: string, botDifficulty?: Difficulty) => {
    setPlayers([
      { ...RED, name: redName, initials: makeInitials(redName) },
      { ...BLUE, name: blueName, initials: makeInitials(blueName) },
    ]);
    setBot(botDifficulty ? { side: 1, difficulty: botDifficulty } : null);
    setState(newGame());
  }, []);

  const setDifficulty = useCallback((d: Difficulty) => {
    setBot((b) => (b ? { ...b, difficulty: d } : b));
  }, []);

  const move = useCallback(
    (e: Edge) => {
      setState((s) =>
        bot && s.current === bot.side ? s : (applyMove(s, e)?.next ?? s)
      );
    },
    [bot]
  );

  const rematch = useCallback(() => setState(newGame()), []);
  const newPlayers = useCallback(() => {
    setPlayers(null);
    setBot(null);
    setState(newGame());
  }, []);

  const botTurn = bot !== null && !state.over && state.current === bot.side;

  // Bot driver: one move per timer so capture chains play out visibly.
  useEffect(() => {
    if (!botTurn || !bot) return;
    const t = setTimeout(
      () => {
        setState((s) =>
          s.over || s.current !== bot.side
            ? s
            : (applyMove(s, chooseMove(s, bot.difficulty))?.next ?? s)
        );
      },
      450 + Math.random() * 300
    );
    return () => clearTimeout(t);
  }, [botTurn, bot, state]);

  if (!players) {
    return (
      <main className="min-h-screen bg-white">
        <StartScreen onStart={start} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col px-5 py-6 sm:py-10">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-[17px] font-extrabold tracking-[-0.03em] text-[#10131A]">
            Dots &amp; Boxes
          </h1>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#FF1E1E]" />
            <span className="inline-block h-2 w-2 rounded-full bg-[#004EFF]" />
          </div>
        </header>

        <Scoreboard
          state={state}
          players={players}
          onNewGame={newPlayers}
          botDifficulty={bot?.difficulty ?? null}
          onChangeDifficulty={setDifficulty}
        />

        <div className="relative mt-6 flex-1">
          <Board state={state} players={players} onMove={move} locked={botTurn} />
          <GameOver
            state={state}
            players={players}
            onRematch={rematch}
            onNewPlayers={newPlayers}
          />
        </div>

        <footer className="pt-4 text-center text-[11px] text-[#B8BECC]">
          Click between two adjacent dots to draw a line · close a square to claim it and go again
        </footer>
      </div>
    </main>
  );
}
