import React, { useState } from 'react';
import { Save, X, Database, AlertCircle } from 'lucide-react';

interface Props {
  initialContent: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

const KnowledgeBaseModal: React.FC<Props> = ({ initialContent, onSave, onClose }) => {
  const [content, setContent] = useState(initialContent);

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-950/60 backdrop-blur-xl border border-cyan-500/20 rounded-xl shadow-[0_0_50px_rgba(34,211,238,0.1)] flex flex-col h-[80vh] animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/30 rounded-t-xl">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg border border-violet-500/30">
                 <Database size={20} className="text-violet-400" />
              </div>
              <div>
                 <h2 className="text-lg font-bold text-slate-100 tracking-wide">KNOWLEDGE BASE INGEST</h2>
                 <p className="text-xs text-slate-500 font-mono">RAG-LITE CONTEXT INJECTION</p>
              </div>
           </div>
           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={24} />
           </button>
        </div>

        {/* Info Banner */}
        <div className="bg-violet-900/10 border-b border-violet-900/20 p-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-violet-400 mt-0.5 shrink-0" />
            <p className="text-xs text-violet-200/80 leading-relaxed">
               Paste your specific Company SOPs, Network Diagrams (text description), or Site Procedures here.
               The AI will prioritize this information over general knowledge during triage.
            </p>
        </div>

        {/* Text Area */}
        <div className="flex-1 p-5 overflow-hidden flex flex-col">
            <div className="flex-1 relative group">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="# Example SOP&#10;1. Check BGP State...&#10;2. Verify Optical Levels..."
                    className="w-full h-full bg-slate-950/50 border border-slate-800 rounded-lg p-4 text-sm font-mono text-slate-300 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20 resize-none leading-relaxed custom-scrollbar"
                    spellCheck={false}
                />
            </div>
            <div className="text-right mt-2 text-[10px] text-slate-600 font-mono">
               {content.length} CHARS
            </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/30 rounded-b-xl flex justify-end gap-3">
           <button 
             onClick={onClose}
             className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
           >
             CANCEL
           </button>
           <button
             onClick={() => onSave(content)}
             className="px-6 py-2 bg-violet-600 text-white text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-violet-500 transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] border border-violet-500 flex items-center gap-2"
           >
              <Save size={16} />
              Ingest Data
           </button>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseModal;