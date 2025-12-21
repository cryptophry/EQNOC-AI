import React from 'react';
import { DIAGNOSTIC_MODULES } from '../constants';
import * as Icons from 'lucide-react';

interface Props {
  onModuleClick: (moduleId: string, title: string) => void;
  activeModuleId: string | null;
}

const DiagnosticGrid: React.FC<Props> = ({ onModuleClick, activeModuleId }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {DIAGNOSTIC_MODULES.map((mod) => {
        // @ts-ignore
        const IconComponent = Icons[mod.icon] || Icons.Activity;
        const isActive = activeModuleId === mod.id;

        return (
          <button
            key={mod.id}
            onClick={() => onModuleClick(mod.id, mod.title)}
            className={`group flex flex-col items-start p-4 rounded-xl border transition-all text-left relative overflow-hidden
                ${isActive 
                    ? 'bg-cyan-900/20 border-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/50' 
                    : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/80 hover:border-cyan-500/50 hover:shadow-lg'
                }`}
          >
            {isActive && <div className="absolute top-0 right-0 w-3 h-3 bg-cyan-400 rounded-bl shadow-[0_0_8px_#22d3ee]"></div>}
            
            <div className="flex w-full items-start justify-between mb-3">
               <div className={`transition-colors p-2 rounded-lg ${isActive ? 'bg-cyan-950/50 text-cyan-400' : 'bg-slate-950/50 text-slate-400 group-hover:text-cyan-400 group-hover:bg-cyan-950/30'}`}>
                 <IconComponent size={24} />
               </div>
               <span className={`text-[11px] font-mono font-bold uppercase tracking-wider ${isActive ? 'text-cyan-400' : 'text-slate-600'}`}>SYS-{mod.id.toUpperCase()}</span>
            </div>
            <div className={`font-bold text-base mb-1 ${isActive ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>{mod.title}</div>
            <div className="text-xs text-slate-500 group-hover:text-slate-400 leading-snug">{mod.subtitle}</div>
          </button>
        );
      })}
    </div>
  );
};

export default DiagnosticGrid;