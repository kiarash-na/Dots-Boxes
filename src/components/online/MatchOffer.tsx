import { Swords } from 'lucide-react';
import type { OfferKind, PublicPlayer } from '../../shared/protocol';
import PlayerTag from './PlayerTag';

interface MatchOfferProps {
  opponent: PublicPlayer;
  expiresInMs: number;
  kind: OfferKind;
  fromMe: boolean; // you sent this challenge
  pending: boolean; // you accepted — waiting for the opponent
  onAccept: () => void;
  onDecline: () => void;
}

export default function MatchOffer({
  opponent,
  expiresInMs,
  kind,
  fromMe,
  pending,
  onAccept,
  onDecline,
}: MatchOfferProps) {
  const challenge = kind === 'challenge';
  const label = `${opponent.initial} #${opponent.tag}`;
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#10131A]/30 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="gameover-in w-full max-w-sm bg-white p-6 shadow-[0_24px_60px_-24px_rgba(16,19,26,0.45)] ring-1 ring-[#EEF0F5]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#10131A] text-white">
            <Swords size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8A91A1]">
              {challenge ? (fromMe ? 'Challenge sent' : 'You are challenged') : 'Opponent found'}
            </p>
            <PlayerTag player={opponent} className="text-[22px] tracking-[-0.02em] text-[#10131A]" />
          </div>
        </div>

        {fromMe || pending ? (
          <>
            <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-[#5A6070]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#F5A623]" />
              Waiting for {label} to accept…
            </p>
            {fromMe && (
              <button
                onClick={onDecline}
                className="mt-4 w-full border border-[#E4E7EE] px-4 py-2.5 text-[13px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]"
              >
                Cancel request
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mt-4 text-[14px] leading-relaxed text-[#5A6070]">
              {challenge
                ? `${label} wants to play you. Accept to start the match now.`
                : "A real player is ready. Join now, or keep waiting in line (you'll go to the back)."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={onAccept}
                className="flex-1 bg-[#10131A] px-4 py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
              >
                {challenge ? 'Accept' : 'Join match'}
              </button>
              <button
                onClick={onDecline}
                className="border border-[#E4E7EE] px-4 py-3 text-[13px] font-semibold text-[#5A6070] transition-colors hover:border-[#10131A] hover:text-[#10131A]"
              >
                {challenge ? 'Decline' : 'Keep waiting'}
              </button>
            </div>
          </>
        )}

        {/* countdown */}
        <div className="mt-4 h-[3px] w-full overflow-hidden bg-[#EEF0F5]">
          <div
            key={label}
            className="offer-countdown h-full bg-[#F5A623]"
            style={{ animationDuration: `${expiresInMs}ms` }}
          />
        </div>
      </div>
    </div>
  );
}
