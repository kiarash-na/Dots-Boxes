import { scores } from '../game/engine';
import type { GameState, Player } from '../game/engine';

interface GameOverProps {
  state: GameState;
  players: [Player, Player];
  onRematch: () => void;
  onNewPlayers: () => void;
  rematchLabel?: string;
  rematchDisabled?: boolean;
  secondaryLabel?: string;
}

export default function GameOver({
  state,
  players,
  onRematch,
  onNewPlayers,
  rematchLabel = 'Rematch',
  rematchDisabled = false,
  secondaryLabel = 'New players',
}: GameOverProps) {
  if (!state.over) return null;

  const [a, b] = scores(state);
  const winner = a === b ? null : players[a > b ? 0 : 1];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 backdrop-blur-[2px]">
      <div className="gameover-in mx-6 w-full max-w-xs bg-white p-8 text-center shadow-[0_24px_60px_-24px_rgba(16,19,26,0.35)] ring-1 ring-[#EEF0F5]">
        {winner ? (
          <>
            <p
              className="text-[12px] font-bold uppercase tracking-[0.16em]"
              style={{ color: winner.color }}
            >
              Winner
            </p>
            <p className="mt-2 text-[34px] font-extrabold leading-tight tracking-[-0.03em] text-[#10131A]">
              {winner.name}
            </p>
            <p className="mt-3 text-[15px] tabular-nums text-[#5A6070]">
              <span className="font-bold" style={{ color: players[0].color }}>{a}</span>
              {' – '}
              <span className="font-bold" style={{ color: players[1].color }}>{b}</span>
              {' boxes'}
            </p>
          </>
        ) : (
          <>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8A91A1]">
              It's a tie
            </p>
            <p className="mt-2 text-[34px] font-extrabold leading-tight tracking-[-0.03em] text-[#10131A]">
              {a} – {b}
            </p>
            <p className="mt-3 text-[15px] text-[#5A6070]">Perfectly matched.</p>
          </>
        )}

        <div className="mt-7 space-y-2">
          <button
            onClick={onRematch}
            disabled={rematchDisabled}
            className="w-full bg-[#10131A] px-6 py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rematchLabel}
          </button>
          <button
            onClick={onNewPlayers}
            className="w-full px-6 py-3 text-[13px] font-semibold text-[#5A6070] transition-colors hover:text-[#10131A]"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
