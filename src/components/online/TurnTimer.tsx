import { TURN_MS } from '../../shared/protocol';
import { useCountdown } from '../../hooks/useCountdown';

interface TurnTimerProps {
  deadline: number; // epoch ms when the current turn times out
  mine: boolean; // is it the local player's turn?
  color: string; // color of the player to move
}

/** Per-move clock for online matches; on timeout the server plays a random line. */
export default function TurnTimer({ deadline, mine, color }: TurnTimerProps) {
  const left = useCountdown(deadline);
  const secs = Math.ceil(left / 1000);
  const urgent = secs <= 10;

  return (
    <div className="mt-4" aria-live="polite">
      <div className="flex items-center justify-between text-[12px] font-semibold">
        <span style={{ color }}>{mine ? 'Your move' : 'Their move'}</span>
        <span
          className={`tabular-nums ${urgent ? 'text-[#B91C1C]' : 'text-[#8A91A1]'}`}
          title="A random line is drawn when time runs out"
        >
          {secs}s
        </span>
      </div>
      <div className="mt-1.5 h-[3px] w-full overflow-hidden bg-[#EEF0F5]">
        <div
          className="h-full transition-[width] duration-300 ease-linear"
          style={{
            width: `${Math.min(100, (left / TURN_MS) * 100)}%`,
            background: urgent ? '#FF1E1E' : color,
          }}
        />
      </div>
    </div>
  );
}
