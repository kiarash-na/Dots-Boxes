import { useState } from 'react';
import { ArrowLeft, Bot, Globe, Users } from 'lucide-react';
import { DIFFICULTIES } from '../game/bot';
import type { Difficulty } from '../game/bot';
import { makeInitials } from '../game/engine';

interface StartScreenProps {
  onStart: (redName: string, blueName: string, botDifficulty?: Difficulty) => void;
}

const MODES = [
  {
    key: 'offline',
    icon: Users,
    title: 'Play offline',
    description: 'With someone next to you',
    comingSoon: false,
  },
  {
    key: 'online',
    icon: Globe,
    title: 'Play online',
    description: 'With a random player',
    comingSoon: true,
  },
  {
    key: 'bot',
    icon: Bot,
    title: 'Play against a bot',
    description: 'Test your skills vs AI',
    comingSoon: false,
  },
] as const;

export default function StartScreen({ onStart }: StartScreenProps) {
  const [mode, setMode] = useState<'menu' | 'offline' | 'bot'>('menu');
  const [redName, setRedName] = useState('');
  const [blueName, setBlueName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const ready = redName.trim().length > 0 && blueName.trim().length > 0;
  const botReady = redName.trim().length > 0;

  const submit = () => {
    if (ready) onStart(redName.trim(), blueName.trim());
  };

  const submitBot = () => {
    if (botReady) onStart(redName.trim(), 'Bot', difficulty);
  };

  if (mode === 'menu') {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        {/* Wordmark */}
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[#10131A]" />
          <span className="inline-block h-3 w-3 rounded-full bg-[#10131A]" />
          <span className="ml-1 h-[3px] w-8 rounded-full bg-[#FF1E1E]" />
        </div>
        <h1 className="text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10131A]">
          Dots &amp; Boxes
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#5A6070]">
          Take turns drawing lines — close a square and it's yours. Most squares
          wins.
        </p>

        {/* Mode picker */}
        <div className="mt-10 space-y-3">
          {MODES.map(({ key, icon: Icon, title, description, comingSoon }) => (
            <button
              key={key}
              onClick={() => !comingSoon && setMode(key)}
              disabled={comingSoon}
              className="group relative flex w-full items-center gap-4 border border-[#E4E7EE] bg-white px-5 py-4 text-left transition-colors enabled:hover:border-[#10131A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#10131A] text-white">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-bold tracking-[-0.01em] text-[#10131A]">
                  {title}
                </span>
                <span className="block text-[13px] text-[#8A91A1]">
                  {description}
                </span>
              </span>
              {comingSoon ? (
                <span className="ml-auto shrink-0 bg-[#F1F3F8] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A91A1]">
                  Coming soon
                </span>
              ) : (
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF1E1E] transition-transform group-hover:scale-125" />
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#004EFF] transition-transform group-hover:scale-125" />
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-[#8A91A1]">
          10 × 10 dots · 81 boxes · close a box to go again
        </p>
      </div>
    );
  }

  if (mode === 'bot') {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        {/* Back to mode picker */}
        <button
          onClick={() => setMode('menu')}
          className="mb-8 flex w-fit items-center gap-1.5 text-[13px] font-bold text-[#8A91A1] transition-colors hover:text-[#10131A]"
        >
          <ArrowLeft size={15} strokeWidth={2.5} />
          All modes
        </button>

        <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10131A]">
          Play against a bot
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#5A6070]">
          You play Red and move first. Enter your name to start.
        </p>

        {/* Player */}
        <div className="mt-10">
          <label
            htmlFor="player-red"
            className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#FF1E1E]"
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF1E1E]" />
            You — Red
          </label>
          <input
            id="player-red"
            value={redName}
            onChange={(e) => setRedName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitBot()}
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

        {/* Difficulty picker */}
        <div className="mt-8">
          <p className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#004EFF]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#004EFF]" />
            Bot — Blue
          </p>
          <div className="mt-3 space-y-2">
            {DIFFICULTIES.map(({ key, label, blurb }) => (
              <button
                key={key}
                onClick={() => setDifficulty(key)}
                className={`flex w-full items-baseline justify-between border px-4 py-3 text-left transition-colors ${
                  difficulty === key
                    ? 'border-[#10131A]'
                    : 'border-[#E4E7EE] hover:border-[#10131A]'
                }`}
              >
                <span className="text-[15px] font-bold tracking-[-0.01em] text-[#10131A]">
                  {label}
                </span>
                <span className="text-[12px] text-[#8A91A1]">{blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={submitBot}
          disabled={!botReady}
          className="group mt-12 flex w-full items-center justify-between bg-[#10131A] px-6 py-4 text-left text-[16px] font-bold tracking-[-0.01em] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          Start game
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF1E1E] transition-transform group-hover:scale-125" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#004EFF] transition-transform group-hover:scale-125" />
          </span>
        </button>

        <p className="mt-4 text-center text-[12px] text-[#8A91A1]">
          You can change the bot's difficulty mid-game
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      {/* Back to mode picker */}
      <button
        onClick={() => setMode('menu')}
        className="mb-8 flex w-fit items-center gap-1.5 text-[13px] font-bold text-[#8A91A1] transition-colors hover:text-[#10131A]"
      >
        <ArrowLeft size={15} strokeWidth={2.5} />
        All modes
      </button>

      <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#10131A]">
        Play offline
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[#5A6070]">
        Two players, one screen. Enter your names to start.
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
        10 × 10 dots · 81 boxes · close a box to go again
      </p>
    </div>
  );
}
