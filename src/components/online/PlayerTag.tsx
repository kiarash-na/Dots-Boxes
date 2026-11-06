import type { PublicPlayer } from '../../shared/protocol';

/** "K #4821" — big letter, small tag subtitle. */
export default function PlayerTag({ player, className = '' }: { player: PublicPlayer; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className="font-extrabold">{player.initial}</span>
      <span className="text-[0.7em] font-semibold tabular-nums text-[#8A91A1]">#{player.tag}</span>
    </span>
  );
}
