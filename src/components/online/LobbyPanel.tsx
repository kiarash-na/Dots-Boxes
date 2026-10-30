import type { LobbyPlayer } from '../../shared/protocol';

interface LobbyPanelProps {
  players: LobbyPlayer[];
  selfName: string | null;
  queuePosition: number | null;
  queueSize: number;
}

const STATUS_STYLE: Record<LobbyPlayer['status'], { dot: string; label: string }> = {
  queued: { dot: 'bg-[#F5A623]', label: 'In queue' },
  playing: { dot: 'bg-[#004EFF]', label: 'Playing' },
  idle: { dot: 'bg-[#D3D8E2]', label: 'Idle' },
};

export default function LobbyPanel({ players, selfName, queuePosition, queueSize }: LobbyPanelProps) {
  return (
    <aside className="w-full border border-[#E4E7EE] bg-white">
      <div className="flex items-center justify-between border-b border-[#EEF0F5] px-4 py-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#10131A]">
          Lobby
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8A91A1]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
          {players.length} online
        </span>
      </div>

      {queuePosition !== null && (
        <div className="border-b border-[#EEF0F5] bg-[#FFF9F0] px-4 py-2.5 text-[12px] font-semibold text-[#8A6100]">
          You're #{queuePosition} in line
          {queueSize > 1 ? ` · ${queueSize} waiting` : ''}
        </div>
      )}

      <ul className="max-h-72 overflow-y-auto">
        {players.map((p) => {
          const s = STATUS_STYLE[p.status];
          const isSelf = p.name === selfName;
          return (
            <li
              key={p.name}
              className={`flex items-center gap-2.5 px-4 py-2.5 ${isSelf ? 'bg-[#F6F8FC]' : ''}`}
            >
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#10131A]">
                {p.name}
                {isSelf && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A91A1]">
                    you
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] font-medium text-[#8A91A1]">{s.label}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
