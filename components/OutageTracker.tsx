import React, { useState, useEffect } from 'react';
import { parseOutageData, OutageRecord } from '../services/gemini';
import { Zap, ZapOff, Loader2, RefreshCw, MapPin, Clock, Users, AlertTriangle, CheckCircle2, Search } from 'lucide-react';

interface Props {
  persistedOutages?: OutageRecord[];
  persistedLastUpdated?: Date | null;
  onOutagesChange?: (outages: OutageRecord[], lastUpdated: Date) => void;
}

const OutageTracker: React.FC<Props> = ({ persistedOutages, persistedLastUpdated, onOutagesChange }) => {
  const [outages, setOutages] = useState<OutageRecord[]>(persistedOutages || []);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(persistedLastUpdated || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchOutages = async () => {
    setLoading(true);
    setError(null);
    try {
      // Target URL for Ergon Energy Text View
      const targetUrl = 'https://www.ergon.com.au/network/outages/outage-finder/outage-finder-text-view';
      
      // Use corsproxy.io which is more robust for direct HTML fetching. 
      // It returns the RAW HTML string, not a JSON object.
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }

      // We expect HTML text, not JSON
      const htmlText = await response.text();

      // Basic validation to ensure we didn't get a proxy error page
      if (htmlText.trim().startsWith('Error') || htmlText.includes('403 Forbidden')) {
         throw new Error("Proxy access denied or target site blocked.");
      }

      // Pass the raw HTML to Gemini to structure it
      const records = await parseOutageData(htmlText);
      const now = new Date();
      
      setOutages(records);
      setLastUpdated(now);
      
      // Sync to parent
      onOutagesChange?.(records, now);

    } catch (err) {
      console.error("Outage fetch error:", err);
      // Fallback message if fetch fails
      setError("Unable to retrieve live outage feed. The utility provider may be blocking external access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch automatically if we don't have persisted data
    // If lastUpdated is present, we assume data (or empty state) is valid
    if (!lastUpdated) {
        fetchOutages();
    }
  }, []);

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
            <div className="text-[10px] font-mono text-slate-500">
                {lastUpdated ? `UPDATED: ${lastUpdated.toLocaleTimeString()}` : 'SYNC REQUIRED'}
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
            onClick={fetchOutages}
            disabled={loading}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
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

        {!loading && filteredOutages.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-80">
                <CheckCircle2 size={48} className="mb-4 text-emerald-500/50" />
                <p className="text-sm font-bold tracking-wide">NO OUTAGES DETECTED</p>
                <p className="text-xs text-slate-500 mt-2">Grid systems appear nominal matching criteria.</p>
            </div>
        )}

        {loading && filteredOutages.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full">
                 <div className="w-10 h-10 border-4 border-slate-800 border-t-red-500 rounded-full animate-spin mb-4"></div>
                 <p className="font-mono text-xs text-red-500 uppercase tracking-widest font-bold">Scanning Utility Feed...</p>
            </div>
        )}

        {filteredOutages.map((outage, idx) => (
            <div key={idx} className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-lg p-4 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                        <MapPin size={12} className="mt-0.5 shrink-0" /> 
                        <span>{outage.location}</span>
                    </div>
                    <div className="text-slate-400 flex items-center gap-2">
                        <Users size={12} /> 
                        <span>{outage.customersAffected} Affected</span>
                    </div>
                    <div className="text-slate-400 flex items-center gap-2">
                        <Clock size={12} /> 
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