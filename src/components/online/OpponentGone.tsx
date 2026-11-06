import { Bot, Unplug, Users, X } from 'lucide-react';

interface OpponentGoneProps {
  opponentName: string;
  reason: 'opponent_left' | 'opponent_disconnected';
  gameOver: boolean; // the board was already finished — the bot starts fresh
  onClose: () => void;
  onFindPlayer: () => void;
  onPlayBot: () => void;
}

/** The opponent is gone for good: close, find another player, or let a bot take over. */
export default function OpponentGone({
  opponentName,
  reason,
  gameOver,
  onClose,
  onFindPlayer,
  onPlayBot,
}: OpponentGoneProps) {
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
            <Unplug size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8A91A1]">
              {reason === 'opponent_left' ? 'Opponent left' : 'Opponent didn’t come back'}
            </p>
            <p
              id="opponent-gone-title"
              className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[#10131A]"
            >
              {opponentName}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed text-[#5A6070]">
          {reason === 'opponent_left'
            ? 'They left the match. What would you like to do?'
            : 'They were disconnected for too long. What would you like to do?'}
        </p>

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
