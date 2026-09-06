import { useCallback, useState } from 'react';
import Board from '../components/Board';
import GameOver from '../components/GameOver';
import Scoreboard from '../components/Scoreboard';
import StartScreen from '../components/StartScreen';
import { BLUE, RED, applyMove, makeInitials, newGame } from '../game/engine';
import type { Edge, GameState, Player } from '../game/engine';

export default function Home() {
  const [players, setPlayers] = useState<[Player, Player] | null>(null);
  const [state, setState] = useState<GameState>(newGame);

  const start = useCallback((redName: string, blueName: string) => {
    setPlayers([
      { ...RED, name: redName, initials: makeInitials(redName) },
      { ...BLUE, name: blueName, initials: makeInitials(blueName) },
    ]);
    setState(newGame());
  }, []);

  const move = useCallback((e: Edge) => {
    setState((s) => applyMove(s, e)?.next ?? s);
  }, []);

  const rematch = useCallback(() => setState(newGame()), []);
  const newPlayers = useCallback(() => {
    setPlayers(null);
    setState(newGame());
  }, []);

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
            Dot in the Box
          </h1>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#FF1E1E]" />
            <span className="inline-block h-2 w-2 rounded-full bg-[#004EFF]" />
          </div>
        </header>

        <Scoreboard state={state} players={players} onNewGame={newPlayers} />

        <div className="relative mt-6 flex-1">
          <Board state={state} players={players} onMove={move} />
          <GameOver
            state={state}
            players={players}
            onRematch={rematch}
            onNewPlayers={newPlayers}
          />
        </div>

        <footer className="pt-4 text-center text-[11px] text-[#B8BECC]">
          Click between two adjacent dots to draw a line · close a square to claim it
        </footer>
      </div>
    </main>
  );
}
