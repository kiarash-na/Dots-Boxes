import { useState } from 'react';
import { makeInitials } from '../game/engine';

interface StartScreenProps {
  onStart: (redName: string, blueName: string) => void;
}

export default function StartScreen({ onStart }: StartScreenProps) {
  const [redName, setRedName] = useState('');
  const [blueName, setBlueName] = useState('');

  const ready = redName.trim().length > 0 && blueName.trim().length > 0;

  const submit = () => {
    if (ready) onStart(redName.trim(), blueName.trim());
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      {/* Wordmark */}
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-[#10131A]" />
        <span className="inline-block h-3 w-3 rounded-full bg-[#10131A]" />
        <span className="ml-1 h-[3px] w-8 rounded-full bg-[#FF1E1E]" />
      </div>
      <h1 className="text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10131A]">
        Dot in the Box
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#5A6070]">
        Two players. One hundred dots. Take turns drawing lines between dots —
        close a square and it's yours, marked with your initials. Most squares
        wins.
      </p>

      {/* Players */}
      <div className="mt-10 space-y-5">
        <div>
          <label
            htmlFor="player-red"
            className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#FF1E1E]"
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF1E1E]" />
            Player one — Red
          </label>
          <input
            id="player-red"
            value={redName}
            onChange={(e) => setRedName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Ada Lovelace"
            maxLength={24}
            autoFocus
            className="w-full border-b-2 border-[#E4E7EE] bg-transparent py-2.5 text-[20px] font-semibold tracking-[-0.01em] text-[#10131A] outline-none transition-colors placeholder:font-normal placeholder:text-[#B8BECC] focus:border-[#FF1E1E]"
          />
          {redName.trim() && (
            <p className="mt-1 text-[12px] text-[#8A91A1]">
              Boxes marked as{' '}
              <span className="font-bold text-[#FF1E1E]">{makeInitials(redName)}</span>
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="player-blue"
            className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#004EFF]"
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#004EFF]" />
            Player two — Blue
          </label>
          <input
            id="player-blue"
            value={blueName}
            onChange={(e) => setBlueName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Alan Turing"
            maxLength={24}
            className="w-full border-b-2 border-[#E4E7EE] bg-transparent py-2.5 text-[20px] font-semibold tracking-[-0.01em] text-[#10131A] outline-none transition-colors placeholder:font-normal placeholder:text-[#B8BECC] focus:border-[#004EFF]"
          />
          {blueName.trim() && (
            <p className="mt-1 text-[12px] text-[#8A91A1]">
              Boxes marked as{' '}
              <span className="font-bold text-[#004EFF]">{makeInitials(blueName)}</span>
            </p>
          )}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!ready}
        className="group mt-12 flex w-full items-center justify-between bg-[#10131A] px-6 py-4 text-left text-[16px] font-bold tracking-[-0.01em] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
      >
        Start game
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF1E1E] transition-transform group-hover:scale-125" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#004EFF] transition-transform group-hover:scale-125" />
        </span>
      </button>

      <p className="mt-4 text-center text-[12px] text-[#8A91A1]">
        10 × 10 dots · 81 boxes · strict alternating turns
      </p>
    </div>
  );
}
