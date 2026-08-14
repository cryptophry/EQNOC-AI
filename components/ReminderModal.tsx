import React, { useState, useEffect } from 'react';
import { X, Bell, Plus, Clock, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface Reminder {
  id: string;
  text: string;
  time: number; // Timestamp
  fired: boolean;
}

interface Props {
  reminders: Reminder[];
  onClose: () => void;
  onAdd: (r: Reminder) => void;
  onDelete: (id: string) => void;
}

const ReminderModal: React.FC<Props> = ({ reminders, onClose, onAdd, onDelete }) => {
  const [inputText, setInputText] = useState('');
  const [inputTime, setInputTime] = useState('');
  const [mode, setMode] = useState<'ABSOLUTE' | 'RELATIVE'>('RELATIVE');
  const [relativeMin, setRelativeMin] = useState(15);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const handleAdd = () => {
    if (!inputText.trim()) return;
    let target: number;
    if (mode === 'ABSOLUTE' && inputTime) {
      const [h, m] = inputTime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      target = d.getTime();
    } else {
      target = Date.now() + relativeMin * 60000;
    }
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    onAdd({ id, text: inputText, time: target, fired: false });
    setInputText('');
  };

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const rel = (ts: number) => {
    const diff = ts - Date.now();
    if (diff < 0) return 'overdue';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet w-full max-w-lg flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-line flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 grid place-items-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>
              <Bell size={18} className="text-accent" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold">Reminders</h2>
              <p className="text-[12px] text-muted">Incident follow-ups & alarms</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="p-4 border-b border-line space-y-3">
          <input value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Reminder (e.g. Check BGP on Core-A)…"
            className="w-full bg-card-2 border border-line rounded-xl px-4 py-2.5 text-[14px] text-ink outline-none focus-ring transition-shadow placeholder:text-faint" />
          <div className="flex gap-2 items-center">
            <div className="flex bg-card-2 rounded-lg border border-line p-1">
              <button onClick={() => setMode('RELATIVE')} className={`px-3 py-1.5 rounded text-[11px] font-semibold ${mode === 'RELATIVE' ? 'bg-accent text-white' : 'text-muted'}`}>Timer</button>
              <button onClick={() => setMode('ABSOLUTE')} className={`px-3 py-1.5 rounded text-[11px] font-semibold ${mode === 'ABSOLUTE' ? 'bg-accent text-white' : 'text-muted'}`}>Time</button>
            </div>
            {mode === 'RELATIVE' ? (
              <div className="flex items-center gap-2 bg-card-2 border border-line rounded-lg px-2.5 py-1.5">
                <span className="text-[12px] text-muted">In</span>
                <input type="number" value={relativeMin} onChange={e => setRelativeMin(parseInt(e.target.value) || 0)} className="w-12 bg-transparent text-center text-[14px] font-semibold text-ink outline-none" />
                <span className="text-[12px] text-muted">min</span>
              </div>
            ) : (
              <input type="time" value={inputTime} onChange={e => setInputTime(e.target.value)} className="bg-card-2 border border-line rounded-lg px-3 py-1.5 text-[14px] text-ink outline-none" />
            )}
            <button onClick={handleAdd} disabled={!inputText.trim() || (mode === 'ABSOLUTE' && !inputTime)}
              className="flex-1 text-white rounded-lg py-2 flex items-center justify-center gap-2 disabled:opacity-40 text-[13px] font-semibold"
              style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent))' }}>
              <Plus size={14} /> Set
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[42vh]">
          {reminders.length === 0 ? (
            <div className="text-center py-8 text-faint flex flex-col items-center gap-2">
              <Bell size={30} /><p className="text-[12px] font-semibold">No reminders set</p>
            </div>
          ) : reminders.map(r => (
            <div key={r.id} className={`p-3 rounded-xl border flex items-center gap-3 ${r.fired ? 'border-danger bg-danger/10' : 'bg-card-2 border-line'}`}>
              <div className={`w-8 h-8 grid place-items-center rounded-full ${r.fired ? 'bg-danger text-white' : 'bg-card text-muted border border-line'}`}>
                {r.fired ? <AlertTriangle size={15} /> : <Clock size={15} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[14px] font-semibold truncate ${r.fired ? 'text-danger' : 'text-ink'}`}>{r.text}</div>
                <div className="text-[11px] text-muted flex items-center gap-2">
                  <span>{fmt(r.time)}</span><span className="w-1 h-1 bg-faint rounded-full" />
                  <span className={r.time < Date.now() ? 'text-danger' : 'text-accent'}>{rel(r.time)}</span>
                </div>
              </div>
              <button onClick={() => onDelete(r.id)} className="p-2 text-faint hover:text-danger" aria-label="Delete reminder">
                {r.fired ? <CheckCircle2 size={16} /> : <Trash2 size={16} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReminderModal;
