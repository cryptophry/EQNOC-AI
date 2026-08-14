import React from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { Session } from '../types';

interface Props {
  sessions: Session[];
  currentId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function rel(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

const SessionList: React.FC<Props> = ({ sessions, currentId, onOpen, onNew, onDelete }) => {
  return (
    <div className="glass-panel rounded-xl2 p-3.5 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">Chats</h3>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:brightness-110 transition-all"
        >
          <MessageSquarePlus size={13} /> New
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-[12.5px] text-faint px-1 py-3 leading-relaxed">
          Conversations you start will show up here.
        </p>
      ) : (
        <ul className="flex flex-col overflow-y-auto max-h-[240px] nice-scroll gap-0.5">
          {sessions.map((s) => {
            const on = s.id === currentId;
            return (
              <li key={s.id} className="group flex items-stretch">
                <button
                  onClick={() => onOpen(s.id)}
                  className={`flex-1 text-left px-2.5 py-2 rounded-[10px] min-w-0 transition-colors ${
                    on ? 'bg-card-2 shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-card-2/70'
                  }`}
                >
                  <div className={`text-[13px] truncate ${on ? 'font-semibold' : ''}`}>{s.title || 'Untitled'}</div>
                  <div className="text-[11px] text-faint mt-0.5">{rel(s.timestamp)}</div>
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 px-2 text-faint hover:text-danger transition-opacity"
                  aria-label="Delete chat"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SessionList;
