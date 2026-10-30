import ConfirmDialog from './ConfirmDialog';
import { DIFFICULTIES } from '../game/bot';
import type { Difficulty } from '../game/bot';
import { scores } from '../game/engine';
import type { GameState, Player, PlayerId } from '../game/engine';

interface ScoreboardProps {
  state: GameState;
  players: [Player, Player];
  onNewGame: () => void;
  botDifficulty?: Difficulty | null;
  onChangeDifficulty?: (d: Difficulty) => void;
  /** Online play: which side is the local player — turn label reads "your/their turn". */
  selfSide?: PlayerId | null;
  newGameLabel?: string;
  newGameConfirmTitle?: string;
  newGameConfirmDescription?: string;
  newGameConfirmAction?: string;
}

export default function Scoreboard({
  state,
  players,
  onNewGame,
  botDifficulty = null,
  onChangeDifficulty,
  selfSide = null,
  newGameLabel = 'New game',
  newGameConfirmTitle = 'Start a new game?',
  newGameConfirmDescription = "The current game will be lost and you'll return to the start screen.",
  newGameConfirmAction = 'Yes, new game',
}: ScoreboardProps) {
  const [a, b] = scores(state);
  const claimed = a + b;
  const showDifficulty = botDifficulty != null && onChangeDifficulty;

  return (
    <div className="w-full">
      <div className="flex items-stretch justify-between gap-6">
        {[0, 1].map((i) => {
          const p = players[i];
          const active = !state.over && state.current === i;
          const botThinking = active && botDifficulty != null && i === 1;
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
                  {botThinking
                    ? '· thinking…'
                    : selfSide === null || i === selfSide
                      ? '· your turn'
                      : '· their turn'}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-col items-end justify-start pt-1">
          <ConfirmDialog
            trigger={
              <button className="border border-[#E4E7EE] px-3 py-1.5 text-[12px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]">
                {newGameLabel}
              </button>
            }
            title={newGameConfirmTitle}
            description={newGameConfirmDescription}
            actionLabel={newGameConfirmAction}
            onConfirm={onNewGame}
          />
          <p className="mt-2 text-[11px] tabular-nums text-[#8A91A1]">{claimed} / 81 boxes</p>
        </div>
      </div>

      {showDifficulty && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A91A1]">
            Bot
          </span>
          {DIFFICULTIES.map(({ key, label }) => {
            const active = botDifficulty === key;
            const btn = (
              <button
                key={key}
                disabled={active}
                className={`border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? 'border-[#10131A] text-[#10131A]'
                    : 'border-[#E4E7EE] text-[#5A6070] hover:border-[#10131A] hover:text-[#10131A]'
                }`}
              >
                {label}
              </button>
            );
            if (active) return btn;
            return (
              <ConfirmDialog
                key={key}
                trigger={btn}
                title={`Switch to ${label}?`}
                description="The bot's strength changes from its next move. The current game continues."
                actionLabel="Yes, switch"
                onConfirm={() => onChangeDifficulty(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
