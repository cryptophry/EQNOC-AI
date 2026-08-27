import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MessageSquarePlus, MoreVertical, Pencil, Search, Trash2, X } from 'lucide-react';
import { Session } from '../types';
import { displayTitle, sessionMatchesQuery } from '../utils/sessionTitle';

interface Props {
  sessions: Session[];
  currentId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function rel(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

const MENU_W = 164;
const MENU_H = 84;

const SessionList: React.FC<Props> = ({ sessions, currentId, onOpen, onNew, onDelete, onRename }) => {
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const ignoreBlur = useRef(false);

  const filtered = useMemo(
    () => sessions.filter((s) => sessionMatchesQuery(s.title, query)),
    [sessions, query]
  );

  const closeMenu = () => {
    setMenuId(null);
    setMenuPos(null);
  };

  const startRename = (s: Session) => {
    closeMenu();
    ignoreBlur.current = false;
    setEditingId(s.id);
    setEditValue(s.title || '');
  };

  const cancelRename = () => {
    ignoreBlur.current = true;
    setEditingId(null);
    setEditValue('');
  };

  const commitRename = () => {
    if (ignoreBlur.current) {
      ignoreBlur.current = false;
      return;
    }
    const id = editingId;
    const next = editValue;
    setEditingId(null);
    setEditValue('');
    if (id) onRename(id, next);
  };

  const openMenu = (id: string, btn: HTMLElement) => {
    if (menuId === id) {
      closeMenu();
      return;
    }
    const r = btn.getBoundingClientRect();
    let left = r.right - MENU_W;
    let top = r.bottom + 4;
    if (left < 8) left = 8;
    if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8;
    if (top + MENU_H > window.innerHeight - 8) top = r.top - MENU_H - 4;
    setMenuPos({ top, left });
    setMenuId(id);
  };

  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if ((e.target as HTMLElement).closest?.('[data-chat-menu]')) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  const menuSession = menuId ? sessions.find((s) => s.id === menuId) : undefined;

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
      {sessions.length > 0 && (
        <div className="flex items-center gap-2 mx-1 mb-2 bg-card-2 border border-line rounded-xl px-2.5 py-1.5 focus-ring">
          <Search size={13} className="text-faint shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="flex-1 bg-transparent outline-none text-[13px] text-ink placeholder:text-faint min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}
      {sessions.length === 0 ? (
        <p className="text-[12.5px] text-faint px-1 py-3 leading-relaxed">
          Conversations you start will show up here.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-[12.5px] text-faint px-1 py-3 leading-relaxed">
          No chats match that name.
        </p>
      ) : (
        <ul className="flex flex-col overflow-y-auto max-h-[240px] nice-scroll gap-0.5">
          {filtered.map((s) => {
            const on = s.id === currentId;
            const editing = editingId === s.id;
            return (
              <li key={s.id} className="group flex items-stretch">
                {editing ? (
                  <div className="flex-1 min-w-0 px-2.5 py-1.5 rounded-[10px] bg-card-2 shadow-[inset_2px_0_0_var(--accent)]">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={commitRename}
                      onFocus={(e) => e.target.select()}
                      className="w-full text-[13px] font-semibold bg-card border border-accent rounded-md px-1.5 py-0.5 outline-none"
                      aria-label="Chat name"
                    />
                    <div className="text-[11px] text-faint mt-0.5">{rel(s.timestamp)}</div>
                  </div>
                ) : (
                  <button
                    onClick={() => onOpen(s.id)}
                    className={`flex-1 text-left px-2.5 py-2 rounded-[10px] min-w-0 transition-colors ${
                      on ? 'bg-card-2 shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-card-2/70'
                    }`}
                  >
                    <div className={`text-[13px] truncate ${on ? 'font-semibold' : ''}`}>
                      {displayTitle(s.title)}
                    </div>
                    <div className="text-[11px] text-faint mt-0.5">{rel(s.timestamp)}</div>
                  </button>
                )}
                {editing ? (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commitRename();
                    }}
                    className="px-2 text-accent"
                    aria-label="Save name"
                  >
                    <Check size={14} />
                  </button>
                ) : (
                  <button
                    data-chat-menu
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu(s.id, e.currentTarget);
                    }}
                    className={`px-2 text-faint hover:text-ink transition-opacity ${
                      menuId === s.id || on
                        ? 'opacity-100'
                        : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100'
                    }`}
                    aria-label="Chat actions"
                    aria-haspopup="menu"
                    aria-expanded={menuId === s.id}
                  >
                    <MoreVertical size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {menuId && menuPos && menuSession &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 w-[164px] py-1 rounded-xl border border-line bg-card-solid shadow-raised"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              role="menuitem"
              onClick={() => startRename(menuSession)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink hover:bg-card-2 transition-colors"
            >
              <Pencil size={13} className="text-muted" /> Rename
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onDelete(menuId);
                closeMenu();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-danger hover:bg-card-2 transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SessionList;
