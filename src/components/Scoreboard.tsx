import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { scores } from '../game/engine';
import type { GameState, Player } from '../game/engine';

interface ScoreboardProps {
  state: GameState;
  players: [Player, Player];
  onNewGame: () => void;
}

export default function Scoreboard({ state, players, onNewGame }: ScoreboardProps) {
  const [a, b] = scores(state);
  const claimed = a + b;

  return (
    <div className="w-full">
      <div className="flex items-stretch justify-between gap-6">
        {[0, 1].map((i) => {
          const p = players[i];
          const active = !state.over && state.current === i;
          return (
            <div key={p.color} className="flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: p.color }}
                />
                <span
                  className="truncate text-[12px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: p.color }}
                >
                  {p.name}
                </span>
              </div>
              <div
                className="mt-1 text-[52px] font-extrabold leading-none tracking-[-0.04em] text-[#10131A] transition-opacity"
                style={{ fontVariantNumeric: 'tabular-nums', opacity: active || state.over ? 1 : 0.28 }}
              >
                {i === 0 ? a : b}
              </div>
              <div className="mt-2 h-[3px] w-full bg-[#EEF0F5]">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    background: p.color,
                    width: `${((i === 0 ? a : b) / 81) * 100}%`,
                  }}
                />
              </div>
              {active && (
                <p className="mt-2 text-[12px] font-semibold" style={{ color: p.color }}>
                  · your turn
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-col items-end justify-start pt-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="border border-[#E4E7EE] px-3 py-1.5 text-[12px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]">
                New game
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-xs rounded-none border-[#EEF0F5] p-8 text-center shadow-[0_24px_60px_-24px_rgba(16,19,26,0.35)]">
              <AlertDialogHeader className="text-center sm:text-center">
                <AlertDialogTitle className="text-[20px] font-extrabold tracking-[-0.03em] text-[#10131A]">
                  Start a new game?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[13px] text-[#5A6070]">
                  The current game will be lost and you'll return to the start screen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-2 flex-col gap-2 sm:flex-col">
                <AlertDialogAction
                  onClick={onNewGame}
                  className="w-full rounded-none bg-[#10131A] px-6 py-3 text-[15px] font-bold text-white hover:bg-[#10131A] hover:opacity-90"
                >
                  Yes, new game
                </AlertDialogAction>
                <AlertDialogCancel className="mt-0 w-full rounded-none border-0 px-6 py-3 text-[13px] font-semibold text-[#5A6070] shadow-none hover:bg-transparent hover:text-[#10131A]">
                  Cancel
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="mt-2 text-[11px] tabular-nums text-[#8A91A1]">{claimed} / 81 boxes</p>
        </div>
      </div>
    </div>
  );
}
