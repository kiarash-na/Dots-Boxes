import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { BLUE, RED } from '../game/engine';

// The home page leads with Dots & Boxes; other mini games are listed here.
const GAMES = [
  {
    to: '/tic-tac-toe',
    title: 'Tic-tac-toe',
    description: 'Three in a row on a 3 × 3 grid',
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <g stroke="#3A4050" strokeWidth="1.6" strokeLinecap="round">
          <line x1="9.3" y1="2" x2="9.3" y2="24" />
          <line x1="16.7" y1="2" x2="16.7" y2="24" />
          <line x1="2" y1="9.3" x2="24" y2="9.3" />
          <line x1="2" y1="16.7" x2="24" y2="16.7" />
        </g>
        <g stroke={RED.color} strokeWidth="2.2" strokeLinecap="round">
          <line x1="3.2" y1="3.2" x2="7.4" y2="7.4" />
          <line x1="7.4" y1="3.2" x2="3.2" y2="7.4" />
          <line x1="18.6" y1="18.6" x2="22.8" y2="22.8" />
          <line x1="22.8" y1="18.6" x2="18.6" y2="22.8" />
        </g>
        <circle cx="13" cy="13" r="2.3" fill="none" stroke={BLUE.color} strokeWidth="2.2" />
      </svg>
    ),
  },
] as const;

export default function MoreGames() {
  return (
    <section className="mt-10" aria-labelledby="more-games">
      <h2
        id="more-games"
        className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8A91A1]"
      >
        More games
      </h2>
      <div className="space-y-2">
        {GAMES.map((g) => (
          <Link
            key={g.to}
            to={g.to}
            className="group flex items-center gap-4 border border-[#E4E7EE] bg-white px-5 py-3.5 transition-colors hover:border-[#10131A]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#10131A]">
              <span className="flex h-[30px] w-[30px] items-center justify-center bg-white">{g.icon}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-bold tracking-[-0.01em] text-[#10131A]">{g.title}</span>
              <span className="block text-[13px] text-[#8A91A1]">{g.description}</span>
            </span>
            <ArrowRight
              size={17}
              strokeWidth={2.4}
              className="ml-auto shrink-0 text-[#B8BECC] transition-all group-hover:translate-x-0.5 group-hover:text-[#10131A]"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
