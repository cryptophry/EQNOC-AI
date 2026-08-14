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
    <div className="bg-card border border-line rounded-xl2 p-4 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] uppercase tracking-[0.6px] text-muted font-semibold">Chats</h3>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
        >
          <MessageSquarePlus size={13} /> New
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-[12.5px] text-faint py-2">No saved chats yet.</p>
      ) : (
        <ul className="flex flex-col overflow-y-auto max-h-[240px] -mx-1">
          {sessions.map((s) => {
            const on = s.id === currentId;
            return (
              <li key={s.id} className="group flex items-stretch">
                <button
                  onClick={() => onOpen(s.id)}
                  className={`flex-1 text-left px-2 py-2 rounded-lg min-w-0 ${on ? 'bg-card-2' : 'hover:bg-card-2'}`}
                >
                  <div className="text-[13px] truncate">{s.title || 'Untitled'}</div>
                  <div className="text-[11px] text-faint">{rel(s.timestamp)}</div>
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  className="opacity-0 group-hover:opacity-100 px-2 text-faint hover:text-danger"
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
