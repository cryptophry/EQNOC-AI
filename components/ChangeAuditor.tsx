import React, { useState } from 'react';
import { assessChangeRisk, ChangeAuditResult } from '../services/ai';
import { ShieldAlert, Activity, CheckSquare, Undo2, Play, Loader2, AlertTriangle, FileWarning, Search } from 'lucide-react';

const ChangeAuditor: React.FC = () => {
  const [script, setScript] = useState('');
  const [result, setResult] = useState<ChangeAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAudit = async () => {
    if (!script.trim()) return;
    setIsLoading(true);
    setResult(null);
    const auditData = await assessChangeRisk(script);
    setResult(auditData);
    setIsLoading(false);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'text-red-500 border-red-500 bg-red-950/30';
      case 'HIGH': return 'text-orange-500 border-orange-500 bg-orange-950/30';
      case 'MEDIUM': return 'text-amber-400 border-amber-400 bg-amber-950/30';
      case 'LOW': return 'text-emerald-400 border-emerald-400 bg-emerald-950/30';
      default: return 'text-slate-400 border-slate-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <label className="text-xs font-bold text-slate-400 mb-3 block uppercase tracking-wide flex items-center gap-2">
            <ShieldAlert size={14} className="text-amber-400" />
            Change Auditor (Risk Analysis)
        </label>
        
        <div className="flex gap-3 h-32">
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste proposed config changes here (e.g. router bgp 65000...)"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-xs font-mono text-white focus:border-amber-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner resize-none leading-relaxed"
          />
        </div>
        <div className="mt-3 flex justify-end">
             <button
                onClick={handleAudit}
                disabled={isLoading || !script.trim()}
                className="bg-amber-900/20 hover:bg-amber-900/40 text-amber-400 border border-amber-900/50 rounded-lg px-6 py-2 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)]"
            >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                ASSESS RISK
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative bg-slate-950/30">
        {!result && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-80">
                <FileWarning size={48} className="mb-4 text-slate-700" />
                <p className="text-sm font-bold tracking-wide">READY FOR AUDIT</p>
                <p className="text-xs text-slate-500 mt-2 max-w-xs text-center">AI will analyze blast radius, risk score, and generate rollback plans.</p>
            </div>
        )}

        {isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
                 <div className="w-10 h-10 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin mb-4"></div>
                 <p className="font-mono text-xs text-amber-500 uppercase tracking-widest font-bold">Simulating Network Impact...</p>
            </div>
        )}

        {result && !isLoading && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                
                {/* Risk Score Header */}
                <div className="flex items-center gap-6">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path className="text-slate-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                            <path 
                                className={`${result.score > 75 ? 'text-red-500' : result.score > 40 ? 'text-amber-500' : 'text-emerald-500'} transition-all duration-1000`}
                                strokeDasharray={`${result.score}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="3" 
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                            <span className="text-2xl font-display font-bold text-white">{result.score}</span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase">RISK SCORE</span>
                        </div>
                    </div>
                    
                    <div className="flex-1">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded border mb-2 ${getRiskColor(result.riskLevel)}`}>
                            <AlertTriangle size={14} />
                            <span className="text-xs font-bold tracking-wider">{result.riskLevel} RISK</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            {result.score > 70 ? "Critical impact detected. Maintenance window required." : "Standard change detected. Proceed with caution."}
                        </p>
                    </div>
                </div>

                {/* Blast Radius */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Activity size={14} className="text-red-400" /> Blast Radius
                    </h4>
                    <ul className="space-y-2">
                        {result.impactAnalysis.map((impact, i) => (
                            <li key={i} className="flex gap-2 text-xs text-slate-300">
                                <span className="text-red-500 mt-0.5">●</span>
                                {impact}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Validation Plans */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                         <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Search size={14} /> Pre-Flight
                        </h4>
                        <div className="space-y-1">
                            {result.preChecks.map((cmd, i) => (
                                <code key={i} className="block bg-black/40 px-2 py-1.5 rounded text-[10px] font-mono text-emerald-200/80 border border-emerald-900/30">
                                    {cmd}
                                </code>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                         <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <CheckSquare size={14} /> Post-Flight
                        </h4>
                         <div className="space-y-1">
                            {result.postChecks.map((cmd, i) => (
                                <code key={i} className="block bg-black/40 px-2 py-1.5 rounded text-[10px] font-mono text-cyan-200/80 border border-cyan-900/30">
                                    {cmd}
                                </code>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Rollback Plan */}
                 <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Undo2 size={14} className="text-amber-400" /> Rollback Plan
                    </h4>
                    <div className="bg-black/50 rounded-lg p-3 border border-slate-700">
                        <pre className="text-xs font-mono text-amber-100/80 whitespace-pre-wrap">{result.rollbackPlan}</pre>
                    </div>
                </div>

            </div>
        )}
      </div>
    </div>
  );
};

export default ChangeAuditor;