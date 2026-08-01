import React, { useState } from 'react';
import { OutageRecord } from '../services/ai';
import { Zap, ZapOff, Loader2, RefreshCw, MapPin, Clock, Users, AlertTriangle, CheckCircle2, Search, Hash, Calendar, Radio } from 'lucide-react';

interface Props {
  outages: OutageRecord[];
  lastUpdated: Date | null;
  isLoading: boolean;
  error: string | null;
  isSimulated?: boolean;
  onRefresh: () => void;
}

const OutageTracker: React.FC<Props> = ({ outages, lastUpdated, isLoading, error, isSimulated, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOutages = outages.filter(o => 
    o.suburb.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('progress') || s.includes('investig')) return 'text-amber-400 border-amber-500/50 bg-amber-950/20';
    if (s.includes('resolved') || s.includes('restored')) return 'text-emerald-400 border-emerald-500/50 bg-emerald-950/20';
    return 'text-slate-300 border-slate-700 bg-slate-900/40';
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-bold text-slate-400 block uppercase tracking-wide flex items-center gap-2">
                <ZapOff size={14} className="text-red-400" />
                Ergon Energy Outage Watch
            </label>
            <div className="flex items-center gap-2">
                {isSimulated && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-900/50 bg-amber-950/20 text-[9px] font-bold text-amber-500 uppercase tracking-wider animate-pulse">
                        <Radio size={10} /> SIMULATED
                    </div>
                )}
                <div className="text-[10px] font-mono text-slate-500">
                    {lastUpdated ? `UPDATED: ${lastUpdated.toLocaleTimeString()}` : 'SYNC REQUIRED'}
                </div>
            </div>
        </div>
        
        <div className="flex gap-3">
          <div className="relative flex-1">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
             <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by Suburb or Street..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white focus:border-red-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner"
             />
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 relative bg-slate-950/30">
        {error && (
            <div className="p-4 rounded-lg bg-red-950/20 border border-red-900/50 text-red-400 flex items-center gap-3">
                <AlertTriangle size={20} />
                <span className="text-sm">{error}</span>
            </div>
        )}

        {isSimulated && !error && (
            <div className="p-3 mb-1 rounded-lg bg-amber-950/10 border border-amber-900/30 text-amber-500/80 flex items-center gap-3 text-xs font-mono">
                <AlertTriangle size={14} className="shrink-0" />
                <span>DEMO MODE: LIVE FEED UNAVAILABLE. DISPLAYING SIMULATION.</span>
            </div>
        )}

        {!isLoading && filteredOutages.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-80">
                <CheckCircle2 size={48} className="mb-4 text-emerald-500/50" />
                <p className="text-sm font-bold tracking-wide">NO OUTAGES DETECTED</p>
                <p className="text-xs text-slate-500 mt-2">Grid systems appear nominal matching criteria.</p>
            </div>
        )}

        {isLoading && filteredOutages.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full">
                 <div className="w-10 h-10 border-4 border-slate-800 border-t-red-500 rounded-full animate-spin mb-4"></div>
                 <p className="font-mono text-xs text-red-500 uppercase tracking-widest font-bold">Scanning Utility Feed...</p>
            </div>
        )}

        {filteredOutages.map((outage, idx) => (
            <div key={idx} className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-lg p-4 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 relative overflow-hidden">
                {/* Council Watermark/Header */}
                {outage.council && (
                    <div className="text-[9px] font-mono font-bold text-slate-600 uppercase tracking-widest mb-2 border-b border-slate-800/50 pb-1">
                        {outage.council}
                    </div>
                )}

                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        {outage.type.toLowerCase().includes('unplanned') ? (
                             <ZapOff size={16} className="text-red-500" />
                        ) : (
                             <Zap size={16} className="text-amber-500" />
                        )}
                        <h3 className="text-sm font-bold text-slate-200">{outage.suburb}</h3>
                    </div>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getStatusColor(outage.status)}`}>
                        {outage.status}
                    </span>
                </div>
                
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs mb-3">
                    <div className="col-span-2 text-slate-400 flex items-start gap-2">
                        <MapPin size={12} className="mt-0.5 shrink-0 text-slate-500" /> 
                        <span>{outage.location}</span>
                    </div>

                    <div className="text-slate-400 flex items-center gap-2" title="Event ID">
                        <Hash size={12} className="text-slate-500" /> 
                        <span className="font-mono text-[10px] text-slate-300">{outage.eventId || 'N/A'}</span>
                    </div>

                    <div className="text-slate-400 flex items-center gap-2" title="Start Time">
                        <Calendar size={12} className="text-slate-500" /> 
                        <span className="text-[10px]">{outage.startTime || '-'}</span>
                    </div>

                    <div className="text-slate-400 flex items-center gap-2">
                        <Users size={12} className="text-slate-500" /> 
                        <span>{outage.customersAffected} Affected</span>
                    </div>
                    <div className="text-slate-400 flex items-center gap-2">
                        <Clock size={12} className="text-slate-500" /> 
                        <span className="text-cyan-400">{outage.estFix}</span>
                    </div>
                </div>

                <div className="bg-black/30 rounded p-2 text-xs text-slate-400 border border-slate-800/50">
                    <span className="font-bold text-slate-500 uppercase text-[10px] mr-2">CAUSE:</span>
                    {outage.description}
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default OutageTracker;