import React, { useState, useEffect } from 'react';
import { ScanSearch, Loader2, CheckCircle2, AlertTriangle, FileText, Terminal } from 'lucide-react';
import { analyzeRawLogs } from '../services/gemini';

interface Props {
  // Optional controlled props for War Room persistence
  persistedLogs?: string;
  onLogsChange?: (logs: string) => void;
}

const LogAnalyzer: React.FC<Props> = ({ persistedLogs, onLogsChange }) => {
  const [internalLogs, setInternalLogs] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Use props if available, otherwise internal state
  const logs = persistedLogs !== undefined ? persistedLogs : internalLogs;

  const handleLogsChange = (val: string) => {
    if (onLogsChange) {
      onLogsChange(val);
    } else {
      setInternalLogs(val);
    }
  };

  const handleAnalyze = async () => {
    if (!logs.trim()) return;
    setIsAnalyzing(true);
    const result = await analyzeRawLogs(logs);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
       <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
          <label className="text-xs font-bold text-slate-400 mb-3 block uppercase tracking-wide flex items-center gap-2">
              <ScanSearch size={14} className="text-red-400" />
              X-RAY Log Analysis
          </label>
          <div className="flex gap-3">
             <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing || !logs.trim()}
                className="w-full bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-lg py-2.5 text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(248,113,113,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Terminal size={16} />}
                {isAnalyzing ? 'Scanning Patterns...' : 'Run Analysis'}
              </button>
          </div>
       </div>

      <div className="flex-1 overflow-hidden p-6 flex flex-col gap-6">
        <div className="flex-1 flex flex-col gap-2 min-h-0 relative group">
           <div className="absolute top-0 right-0 p-2 pointer-events-none z-10">
              <span className="text-[10px] font-mono text-slate-500 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded">RAW INPUT</span>
           </div>
           <textarea
              className="flex-1 bg-slate-950/50 border border-slate-800 rounded-lg p-4 text-xs font-mono resize-none focus:outline-none focus:border-red-500/50 text-slate-300 leading-relaxed placeholder-slate-600 transition-all"
              placeholder={`Paste raw syslog, trap, or debug output here...

Example:
Jun 14 10:00:01 core-rtr-01 bgp[1234]: %BGP-5-ADJCHANGE: neighbor 10.1.1.1 Down BGP Notification sent
Jun 14 10:00:02 core-rtr-01 interface[444]: %LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down`}
              value={logs}
              onChange={(e) => handleLogsChange(e.target.value)}
              spellCheck={false}
           />
           <div className="absolute bottom-4 right-4 text-[10px] text-slate-600 font-mono bg-slate-900/80 px-2 py-1 rounded border border-slate-800 pointer-events-none">
              {logs.length} chars
           </div>
        </div>

        {analysis && (
            <div className="h-2/5 bg-slate-950 border border-slate-800 rounded-lg p-5 overflow-y-auto shadow-lg relative animate-in slide-in-from-bottom-4 duration-500">
                <div className="sticky top-0 bg-slate-950/90 backdrop-blur pb-2 mb-2 border-b border-slate-800/50 flex items-center justify-between z-10">
                   <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-2">
                      <CheckCircle2 size={14} /> AI Findings
                   </h4>
                   <button onClick={() => setAnalysis(null)} className="text-slate-500 hover:text-white" title="Clear Analysis"><AlertTriangle size={12} /></button>
                </div>
                <div className="prose prose-invert prose-sm text-xs text-slate-300">
                    <pre className="whitespace-pre-wrap font-sans text-slate-300 leading-6">{analysis}</pre>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default LogAnalyzer;