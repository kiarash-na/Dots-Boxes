import { useState } from 'react';

interface InitialPickerProps {
  initial?: string | null;
  onPick: (initial: string) => void;
}

/** Online identity: one letter, chosen by the player. The server adds a random 4-digit tag. */
export default function InitialPicker({ initial = null, onPick }: InitialPickerProps) {
  const [value, setValue] = useState(initial ?? '');
  const valid = /^[A-Z]$/.test(value);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onPick(value);
      }}
      className="mx-auto flex min-h-[320px] w-full max-w-sm flex-col items-center justify-center border border-dashed border-[#E4E7EE] px-6 py-16 text-center"
    >
      <h2 className="text-[24px] font-extrabold tracking-[-0.03em] text-[#10131A]">
        Pick your letter
      </h2>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[#8A91A1]">
        One letter is all other players see — plus a random 4-digit number so people with the
        same letter can be told apart.
      </p>
      <input
        autoFocus
        aria-label="Your initial (one letter)"
        value={value}
        maxLength={1}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(e) => {
          const letter = e.target.value.replace(/[^a-z]/gi, '').slice(-1).toUpperCase();
          setValue(letter);
        }}
        className="mt-6 h-20 w-20 border-2 border-[#10131A] text-center text-[44px] font-extrabold uppercase text-[#10131A] outline-none focus:border-[#004EFF]"
      />
      <button
        type="submit"
        disabled={!valid}
        className="mt-6 bg-[#10131A] px-8 py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
      >
        Go online
      </button>
    </form>
  );
}
