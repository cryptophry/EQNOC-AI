import React from 'react';
import { Session, MessageRole } from '../types';
import { Clock, MessageSquare, Plus, Trash2, X, Calendar, ChevronRight } from 'lucide-react';

interface Props {
  sessions: Session[];
  currentSessionId: string;
  onSelectSession: (session: Session) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
}

const SessionHistory: React.FC<Props> = ({ 
  sessions, 
  currentSessionId, 
  onSelectSession, 
  onNewSession, 
  onDeleteSession, 
  onClose 
}) => {
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // If today
    if (diff < 24 * 60 * 60 * 1000 && now.getDate() === date.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // If this year
    if (now.getFullYear() === date.getFullYear()) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString();
  };

  const getPreview = (session: Session) => {
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg.role === MessageRole.SYSTEM) return 'New Session';
    return lastMsg.text.slice(0, 60) + (lastMsg.text.length > 60 ? '...' : '');
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/50">
           <div className="flex items-center gap-2 text-cyan-400 font-bold tracking-wide">
              <Clock size={18} />
              HISTORY
           </div>
           <button 
             onClick={onClose}
             className="text-slate-500 hover:text-white transition-colors"
           >
             <X size={20} />
           </button>
        </div>

        {/* New Session Action */}
        <div className="p-4 border-b border-slate-800/50">
           <button
             onClick={onNewSession}
             className="w-full bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-lg py-3 flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-all hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]"
           >
              <Plus size={16} /> New Triage Session
           </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                    <MessageSquare size={32} className="mb-2 opacity-50" />
                    <p className="text-xs uppercase font-bold tracking-wide">No History Found</p>
                </div>
            ) : (
                sessions.map(session => (
                    <div 
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className={`group relative p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1
                            ${session.id === currentSessionId 
                                ? 'bg-slate-800 border-cyan-500/50 shadow-md' 
                                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <h4 className={`text-sm font-bold line-clamp-1 pr-6 ${session.id === currentSessionId ? 'text-white' : 'text-slate-300 group-hover:text-cyan-400'}`}>
                                {session.title || 'Untitled Session'}
                            </h4>
                            <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                                {formatDate(session.timestamp)}
                            </span>
                        </div>
                        
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                           {getPreview(session)}
                        </p>

                        {/* Actions */}
                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            <button
                                onClick={(e) => onDeleteSession(session.id, e)}
                                className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                                title="Delete Session"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                        
                        {session.id === currentSessionId && (
                           <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 rounded-l-lg"></div>
                        )}
                    </div>
                ))
            )}
        </div>
        
        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 text-center">
            <span className="text-[10px] text-slate-600 font-mono">EQNOC SESSION MANAGER v1.0</span>
        </div>
      </div>
    </div>
  );
};

export default SessionHistory;