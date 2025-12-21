import React, { useState, useEffect, useRef } from 'react';
import { WarRoomEvent } from '../types';
import { Clock, Send, User, Bot, AlertTriangle, PenTool } from 'lucide-react';

interface Props {
  events: WarRoomEvent[];
  onAddEntry: (text: string) => void;
}

const WarRoomTimeline: React.FC<Props> = ({ events, onAddEntry }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onAddEntry(input);
    setInput('');
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'USER': return <User size={12} />;
      case 'AI': return <Bot size={12} />;
      case 'SYSTEM': return <AlertTriangle size={12} />;
      default: return <PenTool size={12} />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'USER': return 'text-cyan-400 border-cyan-500/30 bg-cyan-950/30';
      case 'AI': return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30';
      case 'SYSTEM': return 'text-red-400 border-red-500/30 bg-red-950/30';
      default: return 'text-slate-300 border-slate-700 bg-slate-900';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/50 rounded-xl border border-red-900/30 overflow-hidden">
      <div className="p-3 border-b border-red-900/30 bg-red-950/10 flex items-center justify-between">
         <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-widest">
            <Clock size={14} /> INCIDENT TIMELINE
         </div>
         <div className="text-[10px] text-red-500 font-mono animate-pulse">
            REC ●
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 relative">
         <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-800/50"></div>
         
         {events.map((event) => (
            <div key={event.id} className="relative pl-8 animate-in slide-in-from-left-2 duration-300">
               <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 bg-slate-950 z-10 -ml-px ${event.type === 'SYSTEM' ? 'border-red-500' : 'border-slate-600'}`}></div>
               <div className={`p-2 rounded border text-xs ${getColor(event.type)}`}>
                  <div className="flex items-center justify-between mb-1 opacity-70">
                     <span className="font-mono text-[10px]">{formatTime(event.timestamp)}</span>
                     {getIcon(event.type)}
                  </div>
                  <div className="leading-relaxed font-mono opacity-90 break-words">
                     {event.message}
                  </div>
               </div>
            </div>
         ))}
         <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-slate-800 bg-slate-950">
         <div className="flex gap-2">
            <input
               type="text"
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
               placeholder="Log manual event..."
               className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:border-red-500/50 focus:outline-none placeholder-slate-600 font-mono"
            />
            <button 
               onClick={handleSubmit}
               disabled={!input.trim()}
               className="bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40 rounded px-2 transition-colors disabled:opacity-50"
            >
               <Send size={14} />
            </button>
         </div>
      </div>
    </div>
  );
};

export default WarRoomTimeline;