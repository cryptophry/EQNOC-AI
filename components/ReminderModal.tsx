import React, { useState, useEffect } from 'react';
import { X, Bell, Plus, Clock, Trash2, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react';

export interface Reminder {
  id: string;
  text: string;
  time: number; // Timestamp
  fired: boolean;
}

interface Props {
  reminders: Reminder[];
  setReminders: (r: Reminder[]) => void;
  onClose: () => void;
  shiftStartTime: number;
}

const ReminderModal: React.FC<Props> = ({ reminders, setReminders, onClose, shiftStartTime }) => {
  const [inputText, setInputText] = useState('');
  const [inputTime, setInputTime] = useState(''); // HH:mm
  const [mode, setMode] = useState<'ABSOLUTE' | 'RELATIVE'>('RELATIVE');
  const [relativeMin, setRelativeMin] = useState(15);

  // Force re-render to update "time remaining"
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleAdd = () => {
    if (!inputText.trim()) return;

    let targetTime = 0;
    const now = new Date();

    if (mode === 'ABSOLUTE' && inputTime) {
      const [h, m] = inputTime.split(':').map(Number);
      const target = new Date();
      target.setHours(h, m, 0, 0);
      if (target.getTime() < now.getTime()) {
        // If time passed today, assume tomorrow? Or just allow past for testing. 
        // Better: assume next occurrence.
        target.setDate(target.getDate() + 1);
      }
      // If user sets time that is passed but within reasonable window (e.g. they meant today), 
      // standard logic usually assumes next day if < now. 
      // However for simplicity let's stick to "Today/Tomorrow" logic or just use Relative mostly.
      // Let's just set the hours/min for today. If it's in the past, it fires immediately.
      const todayTarget = new Date();
      todayTarget.setHours(h, m, 0, 0);
      targetTime = todayTarget.getTime();
    } else {
      targetTime = now.getTime() + (relativeMin * 60 * 1000);
    }

    const newReminder: Reminder = {
      id: Date.now().toString(),
      text: inputText,
      time: targetTime,
      fired: false
    };

    setReminders([...reminders, newReminder].sort((a, b) => a.time - b.time));
    setInputText('');
  };

  const handleDelete = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id));
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRelativeString = (ts: number) => {
    const diff = ts - Date.now();
    const mins = Math.floor(diff / 60000);
    if (diff < 0) return 'Overdue';
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `in ${hours}h ${remMins}m`;
  };

  return (
    <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                 <Bell size={20} className="text-amber-400" />
              </div>
              <div>
                 <h2 className="text-lg font-bold text-white tracking-wide">SHIFT ALARMS</h2>
                 <p className="text-xs text-slate-500 font-mono">INCIDENT FOLLOW-UP & REMINDERS</p>
              </div>
           </div>
           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        {/* Create New */}
        <div className="p-5 bg-slate-900/30 border-b border-slate-800">
            <div className="flex flex-col gap-3">
                <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Reminder message (e.g. Check BGP on Site A)..."
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
                
                <div className="flex gap-2 items-center">
                    <div className="flex bg-slate-950/50 rounded-lg border border-slate-800 p-1">
                        <button onClick={() => setMode('RELATIVE')} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${mode === 'RELATIVE' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Timer</button>
                        <button onClick={() => setMode('ABSOLUTE')} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${mode === 'ABSOLUTE' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Time</button>
                    </div>

                    {mode === 'RELATIVE' ? (
                        <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-700 rounded-lg px-2 py-1.5">
                            <span className="text-xs text-slate-400 font-mono">In</span>
                            <input 
                                type="number" 
                                value={relativeMin} 
                                onChange={(e) => setRelativeMin(parseInt(e.target.value) || 0)} 
                                className="w-12 bg-transparent text-center text-sm font-bold text-white focus:outline-none"
                            />
                            <span className="text-xs text-slate-400 font-mono">mins</span>
                        </div>
                    ) : (
                        <input 
                            type="time" 
                            value={inputTime} 
                            onChange={(e) => setInputTime(e.target.value)} 
                            className="bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        />
                    )}

                    <button 
                        onClick={handleAdd}
                        disabled={!inputText.trim() || (mode === 'ABSOLUTE' && !inputTime)}
                        className="flex-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/50 rounded-lg py-1.5 flex items-center justify-center gap-2 disabled:opacity-50 transition-all text-xs font-bold uppercase"
                    >
                        <Plus size={14} /> Set Alarm
                    </button>
                </div>
            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[40vh]">
            {reminders.length === 0 ? (
                <div className="text-center py-8 text-slate-600 opacity-50 flex flex-col items-center">
                    <Bell size={32} className="mb-2" />
                    <p className="text-xs font-bold uppercase">No Active Alarms</p>
                </div>
            ) : (
                reminders.map(r => (
                    <div 
                        key={r.id} 
                        onClick={() => r.fired && handleDelete(r.id)}
                        className={`p-3 rounded-lg border flex items-center gap-3 transition-all ${r.fired ? 'bg-red-950/30 border-red-500 animate-pulse cursor-pointer hover:bg-red-900/40' : 'bg-slate-950/50 border-slate-800'}`}
                        title={r.fired ? 'Click to acknowledge' : ''}
                    >
                        <div className={`p-2 rounded-full ${r.fired ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            {r.fired ? <AlertTriangle size={16} /> : <Clock size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold truncate ${r.fired ? 'text-red-300' : 'text-slate-200'}`}>{r.text}</div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                                <span>{formatTime(r.time)}</span>
                                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                <span className={r.time < Date.now() ? 'text-red-400' : 'text-cyan-400'}>{getRelativeString(r.time)}</span>
                            </div>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded transition-colors"
                        >
                            {r.fired ? <CheckCircle2 size={16} /> : <Trash2 size={16} />}
                        </button>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};

export default ReminderModal;