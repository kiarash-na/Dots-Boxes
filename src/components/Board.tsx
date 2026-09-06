import { useMemo, useState } from 'react';
import { BOXES, DOTS, edgeOwner } from '../game/engine';
import type { Edge, GameState, Player } from '../game/engine';

const CELL = 56;
const MARGIN = 34;
const SIZE = MARGIN * 2 + (DOTS - 1) * CELL;

const dotX = (c: number) => MARGIN + c * CELL;
const dotY = (r: number) => MARGIN + r * CELL;

interface BoardProps {
  state: GameState;
  players: [Player, Player];
  onMove: (e: Edge) => void;
}

export default function Board({ state, players, onMove }: BoardProps) {
  const [hover, setHover] = useState<Edge | null>(null);

  // All edges in stable order so React keys stay constant across renders
  const allEdges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];
    for (let r = 0; r < DOTS; r++)
      for (let c = 0; c < BOXES; c++) list.push({ orientation: 'h', row: r, col: c });
    for (let r = 0; r < BOXES; r++)
      for (let c = 0; c < DOTS; c++) list.push({ orientation: 'v', row: r, col: c });
    return list;
  }, []);

  const edgeKey = (e: Edge) => `${e.orientation}-${e.row}-${e.col}`;

  const coords = (e: Edge) =>
    e.orientation === 'h'
      ? { x1: dotX(e.col), y1: dotY(e.row), x2: dotX(e.col + 1), y2: dotY(e.row) }
      : { x1: dotX(e.col), y1: dotY(e.row), x2: dotX(e.col), y2: dotY(e.row + 1) };

  const current = players[state.current];

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="block h-auto w-full select-none"
      role="grid"
      aria-label="Dots and boxes board"
      onMouseLeave={() => setHover(null)}
    >
      {/* Captured boxes */}
      {Array.from({ length: BOXES * BOXES }, (_, bi) => {
        const owner = state.boxes[bi];
        if (owner === -1) return null;
        const r = Math.floor(bi / BOXES);
        const c = bi % BOXES;
        const p = players[owner];
        const cx = dotX(c) + CELL / 2;
        const cy = dotY(r) + CELL / 2;
        return (
          <g key={`box-${bi}`} className="box-pop" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <rect
              x={dotX(c) + 4}
              y={dotY(r) + 4}
              width={CELL - 8}
              height={CELL - 8}
              fill={p.soft}
            />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill={p.color}
              fontSize={19}
              fontWeight={800}
              fontFamily="Inter, -apple-system, 'Segoe UI', sans-serif"
              letterSpacing="-0.02em"
            >
              {p.initials}
            </text>
          </g>
        );
      })}

      {/* Placed edges */}
      {allEdges.map((e) => {
        const owner = edgeOwner(state, e);
        if (owner === -1) return null;
        const { x1, y1, x2, y2 } = coords(e);
        return (
          <line
            key={`edge-${edgeKey(e)}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={players[owner].color}
            strokeWidth={7}
            strokeLinecap="round"
            className="edge-draw"
            style={{ ['--len' as string]: CELL }}
          />
        );
      })}

      {/* Hover preview + endpoint highlights */}
      {hover && !state.over && edgeOwner(state, hover) === -1 && (
        <g pointerEvents="none">
          <line
            {...coords(hover)}
            stroke={current.color}
            strokeWidth={7}
            strokeLinecap="round"
            opacity={0.35}
          />
          <circle cx={coords(hover).x1} cy={coords(hover).y1} r={8} fill={current.color} />
          <circle cx={coords(hover).x2} cy={coords(hover).y2} r={8} fill={current.color} />
        </g>
      )}

      {/* Hit areas (only free edges) */}
      {allEdges.map((e) => {
        if (edgeOwner(state, e) !== -1) return null;
        const k = edgeKey(e);
        return (
          <line
            key={`hit-${k}`}
            {...coords(e)}
            stroke="transparent"
            strokeWidth={26}
            strokeLinecap="round"
            className={state.over ? '' : 'cursor-pointer'}
            onMouseEnter={() => !state.over && setHover(e)}
            onMouseLeave={() => setHover((h) => (h && edgeKey(h) === k ? null : h))}
            onClick={() => !state.over && onMove(e)}
          />
        );
      })}

      {/* Dots on top */}
      {Array.from({ length: DOTS * DOTS }, (_, i) => {
        const r = Math.floor(i / DOTS);
        const c = i % DOTS;
        return (
          <circle
            key={`dot-${i}`}
            cx={dotX(c)}
            cy={dotY(r)}
            r={4.6}
            fill="#10131A"
            pointerEvents="none"
          />
        );
      })}

    </svg>
  );
}
