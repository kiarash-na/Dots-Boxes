import { useState } from 'react';
import type { Player } from '../../game/engine';
import { SIZE } from './engine';
import type { TttState } from './engine';

// Same visual language as the Dots & Boxes board: a lattice of dark dots,
// marks drawn in the players' colors with a short draw-on animation.
const CELL = 110;
const MARGIN = 26;
const VIEW = MARGIN * 2 + SIZE * CELL;
const INSET = 30; // gap between a cell's edge and its mark

const cellX = (i: number) => MARGIN + (i % SIZE) * CELL;
const cellY = (i: number) => MARGIN + Math.floor(i / SIZE) * CELL;
const center = (i: number) => ({ x: cellX(i) + CELL / 2, y: cellY(i) + CELL / 2 });

interface TicTacToeBoardProps {
  state: TttState;
  players: [Player, Player];
  onMove: (cell: number) => void;
  locked?: boolean; // bot's turn — input and previews suppressed
}

function Mark({
  cell,
  side,
  color,
  ghost = false,
  dim = false,
}: {
  cell: number;
  side: 0 | 1;
  color: string;
  ghost?: boolean; // hover preview
  dim?: boolean; // not part of the winning line
}) {
  const opacity = ghost ? 0.25 : dim ? 0.28 : 1;
  const x = cellX(cell);
  const y = cellY(cell);
  const common = {
    stroke: color,
    strokeWidth: 10,
    strokeLinecap: 'round' as const,
    fill: 'none',
    pathLength: 1,
    className: ghost ? undefined : 'mark-draw',
  };
  if (side === 0) {
    return (
      <g opacity={opacity} pointerEvents="none" className="transition-opacity duration-300">
        <line {...common} x1={x + INSET} y1={y + INSET} x2={x + CELL - INSET} y2={y + CELL - INSET} />
        <line
          {...common}
          x1={x + CELL - INSET}
          y1={y + INSET}
          x2={x + INSET}
          y2={y + CELL - INSET}
          style={ghost ? undefined : { animationDelay: '0.12s' }}
        />
      </g>
    );
  }
  const { x: cx, y: cy } = center(cell);
  return (
    <circle
      {...common}
      cx={cx}
      cy={cy}
      r={CELL / 2 - INSET + 2}
      opacity={opacity}
      pointerEvents="none"
      style={{ transition: 'opacity 0.3s' }}
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  );
}

export default function TicTacToeBoard({ state, players, onMove, locked = false }: TicTacToeBoardProps) {
  const [hover, setHover] = useState<number | null>(null);
  const playable = (i: number) => !state.over && !locked && state.cells[i] === -1;
  const current = players[state.current];
  const winLine = state.line;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="mx-auto block h-auto w-full max-w-[460px] select-none"
      role="grid"
      aria-label="Tic-tac-toe board"
      onMouseLeave={() => setHover(null)}
    >
      {/* Grid lines between the cells */}
      {[1, 2].map((k) => (
        <g key={`grid-${k}`} stroke="#E4E7EE" strokeWidth={3} strokeLinecap="round">
          <line x1={MARGIN + k * CELL} y1={MARGIN} x2={MARGIN + k * CELL} y2={MARGIN + SIZE * CELL} />
          <line x1={MARGIN} y1={MARGIN + k * CELL} x2={MARGIN + SIZE * CELL} y2={MARGIN + k * CELL} />
        </g>
      ))}

      {/* Winning cells get a soft tint */}
      {winLine?.map((i) => (
        <rect
          key={`win-${i}`}
          x={cellX(i) + 6}
          y={cellY(i) + 6}
          width={CELL - 12}
          height={CELL - 12}
          fill={players[state.winner ?? 0].soft}
          className="box-pop"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      ))}

      {/* Placed marks */}
      {state.cells.map((owner, i) =>
        owner === -1 ? null : (
          <Mark
            key={`mark-${i}`}
            cell={i}
            side={owner}
            color={players[owner].color}
            dim={winLine !== null && !winLine.includes(i)}
          />
        )
      )}

      {/* Hover preview (desktop) */}
      {hover !== null && playable(hover) && (
        <Mark cell={hover} side={state.current} color={current.color} ghost />
      )}

      {/* Strike-through for the winning line */}
      {winLine && state.winner !== null && (
        <line
          x1={center(winLine[0]).x + (center(winLine[0]).x - center(winLine[2]).x) * 0.18}
          y1={center(winLine[0]).y + (center(winLine[0]).y - center(winLine[2]).y) * 0.18}
          x2={center(winLine[2]).x + (center(winLine[2]).x - center(winLine[0]).x) * 0.18}
          y2={center(winLine[2]).y + (center(winLine[2]).y - center(winLine[0]).y) * 0.18}
          stroke={players[state.winner].color}
          strokeWidth={8}
          strokeLinecap="round"
          pathLength={1}
          opacity={0.9}
          className="mark-draw"
          style={{ animationDelay: '0.25s', animationDuration: '0.35s' }}
          pointerEvents="none"
        />
      )}

      {/* Hit areas — keyboard reachable */}
      {state.cells.map((owner, i) => {
        const row = Math.floor(i / SIZE) + 1;
        const col = (i % SIZE) + 1;
        const label =
          owner === -1
            ? `Row ${row}, column ${col}, empty`
            : `Row ${row}, column ${col}, ${owner === 0 ? 'X' : 'O'} (${players[owner].name})`;
        return (
          <rect
            key={`hit-${i}`}
            x={cellX(i)}
            y={cellY(i)}
            width={CELL}
            height={CELL}
            fill="transparent"
            role="gridcell"
            aria-label={label}
            tabIndex={playable(i) ? 0 : -1}
            className={`outline-none ${playable(i) ? 'cursor-pointer focus-visible:fill-[#10131A]/5' : ''}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => playable(i) && onMove(i)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && playable(i)) {
                e.preventDefault();
                onMove(i);
              }
            }}
          />
        );
      })}

      {/* Dot lattice on top, like the Dots & Boxes board */}
      {Array.from({ length: (SIZE + 1) * (SIZE + 1) }, (_, k) => {
        const r = Math.floor(k / (SIZE + 1));
        const c = k % (SIZE + 1);
        return (
          <circle
            key={`dot-${k}`}
            cx={MARGIN + c * CELL}
            cy={MARGIN + r * CELL}
            r={5}
            fill="#10131A"
            pointerEvents="none"
          />
        );
      })}
    </svg>
  );
}
