import { useCountdown } from '../../hooks/useCountdown';

interface OpponentAwayProps {
  opponentName: string;
  deadline: number; // epoch ms when the held seat is released
}

/** Banner while the opponent is disconnected and their seat is being held. */
export default function OpponentAway({ opponentName, deadline }: OpponentAwayProps) {
  const secs = Math.ceil(useCountdown(deadline) / 1000);
  return (
    <div className="mt-4 flex items-center gap-2.5 border border-[#F5E3C0] bg-[#FFF9F0] px-4 py-2.5 text-[13px] font-semibold text-[#8A6100]">
      <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#F5A623]" />
      <span>
        {opponentName} lost connection — game paused. Waiting{' '}
        <span className="tabular-nums">{secs}s</span> for them to come back.
      </span>
    </div>
  );
}
