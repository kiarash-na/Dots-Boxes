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
          <button
            onClick={onNewGame}
            className="border border-[#E4E7EE] px-3 py-1.5 text-[12px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]"
          >
            New game
          </button>
          <p className="mt-2 text-[11px] tabular-nums text-[#8A91A1]">{claimed} / 81 boxes</p>
        </div>
      </div>
    </div>
  );
}
