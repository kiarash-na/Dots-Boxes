import { playerLabel } from '../../shared/protocol';
import type { PublicPlayer } from '../../shared/protocol';
import PlayerTag from './PlayerTag';

interface MatchupProps {
  me: PublicPlayer | null; // null only before the server has said who we are
  opponent: PublicPlayer;
  className?: string;
}

/**
 * "You (K #4821) vs L #1234". Dialogs cover the page header — the only other
 * place that shows your own identity — so they show it here instead.
 */
export default function Matchup({ me, opponent, className = '' }: MatchupProps) {
  const tag = 'text-[22px] leading-tight tracking-[-0.02em] text-[#10131A]';
  const caption = 'text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A91A1]';
  return (
    <div className={className}>
      <p className="sr-only">
        {me ? `You (${playerLabel(me)})` : 'You'} vs {playerLabel(opponent)}
      </p>
      <div
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] border border-[#EEF0F5]"
      >
        <div className="min-w-0 bg-[#F6F8FC] px-3.5 py-2.5">
          <p className={caption}>You</p>
          {me ? (
            <PlayerTag player={me} className={tag} />
          ) : (
            <span className={`${tag} font-extrabold text-[#B8BECC]`}>…</span>
          )}
        </div>
        <span className="flex items-center px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#B8BECC]">
          vs
        </span>
        <div className="min-w-0 px-3.5 py-2.5 text-right">
          <p className={caption}>Opponent</p>
          <PlayerTag player={opponent} className={tag} />
        </div>
      </div>
    </div>
  );
}
