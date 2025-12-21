import React, { useState } from 'react';
import { TRIAGE_CHECKLIST_DATA } from '../constants';
import { CheckSquare, Square, HelpCircle, CheckCircle2 } from 'lucide-react';

interface Props {
  onAskJarvis: (question: string) => void;
}

const TriageChecklist: React.FC<Props> = ({ onAskJarvis }) => {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const progress = Math.round((Object.values(checkedItems).filter(Boolean).length / TRIAGE_CHECKLIST_DATA.length) * 100);

  return (
    <div className="jarvis-panel rounded-lg p-4 h-full flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-2">
        <h2 className="text-cyan-400 font-display text-lg flex items-center gap-2">
           <CheckCircle2 size={18} />
           PRE-FLIGHT CHECKS
        </h2>
        <div className="text-xs font-mono text-cyan-600">
           {progress}% COMPLETE
        </div>
      </div>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-slate-900">
        <div 
          className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2 pr-1">
        {TRIAGE_CHECKLIST_DATA.map((item) => {
          const isChecked = checkedItems[item.id];
          return (
            <div 
              key={item.id} 
              className={`p-2 rounded border transition-all duration-200 flex items-start gap-3 group
                ${isChecked 
                  ? 'bg-cyan-900/10 border-cyan-500/30' 
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-600'
                }`}
            >
              <button 
                onClick={() => toggleItem(item.id)}
                className={`mt-0.5 transition-colors ${isChecked ? 'text-cyan-400' : 'text-slate-600 hover:text-cyan-600'}`}
              >
                {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              
              <div className="flex-1">
                <div className={`text-sm font-medium ${isChecked ? 'text-cyan-100' : 'text-slate-400'}`}>
                  {item.label}
                </div>
                <div className="text-[10px] text-slate-500 font-mono leading-tight mt-0.5">
                  {item.question}
                </div>
              </div>

              <button 
                onClick={() => onAskJarvis(`Explain the importance of ${item.label}: "${item.question}" in the triage process.`)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-cyan-400 p-1"
                title="Ask Jarvis about this"
              >
                <HelpCircle size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TriageChecklist;
