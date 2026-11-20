import { Bot, Unplug, Users, WifiOff, X } from 'lucide-react';
import type { PublicPlayer } from '../../shared/protocol';
import Matchup from './Matchup';

/**
 * Why the match can't go on: the opponent left, the opponent never came back,
 * or *our* connection dropped and the server couldn't give us our seat back.
 */
export type GoneReason = 'opponent_left' | 'opponent_disconnected' | 'connection_lost';

interface OpponentGoneProps {
  me: PublicPlayer | null;
  opponent: PublicPlayer;
  reason: GoneReason;
  gameOver: boolean; // the board was already finished — the bot starts fresh
  onClose: () => void;
  onFindPlayer: () => void;
  onPlayBot: () => void;
}

const COPY: Record<GoneReason, { title: string; body: string }> = {
  opponent_left: {
    title: 'Opponent left',
    body: 'They left the match. What would you like to do?',
  },
  opponent_disconnected: {
    title: 'Opponent didn’t come back',
    body: 'They were disconnected for too long. What would you like to do?',
  },
  connection_lost: {
    title: 'Connection lost',
    body: 'You were disconnected and this match couldn’t be resumed. Your last board is kept — what would you like to do?',
  },
};

/** The match is over for good: close, find another player, or let a bot take over. */
export default function OpponentGone({
  me,
  opponent,
  reason,
  gameOver,
  onClose,
  onFindPlayer,
  onPlayBot,
}: OpponentGoneProps) {
  const copy = COPY[reason];
  const Icon = reason === 'connection_lost' ? WifiOff : Unplug;
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#10131A]/30 p-4 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opponent-gone-title"
        className="gameover-in w-full max-w-sm bg-white p-6 shadow-[0_24px_60px_-24px_rgba(16,19,26,0.45)] ring-1 ring-[#EEF0F5]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#10131A] text-white">
            <Icon size={20} strokeWidth={2.2} />
          </span>
          <p
            id="opponent-gone-title"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8A91A1]"
          >
            {copy.title}
          </p>
        </div>

        <Matchup me={me} opponent={opponent} className="mt-4" />

        <p className="mt-4 text-[14px] leading-relaxed text-[#5A6070]">{copy.body}</p>

        <div className="mt-5 space-y-2">
          <button
            onClick={onPlayBot}
            className="flex w-full items-center justify-center gap-2 bg-[#10131A] px-4 py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <Bot size={17} strokeWidth={2.2} />
            {gameOver ? 'Play the robot' : 'Continue with the robot'}
          </button>
          <button
            onClick={onFindPlayer}
            className="flex w-full items-center justify-center gap-2 border border-[#E4E7EE] px-4 py-3 text-[14px] font-semibold text-[#10131A] transition-colors hover:border-[#10131A]"
          >
            <Users size={16} strokeWidth={2.2} />
            Find another player
          </button>
          <button
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-[#5A6070] transition-colors hover:text-[#10131A]"
          >
            <X size={15} strokeWidth={2.2} />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
