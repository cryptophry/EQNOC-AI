import React, { useState, useEffect } from 'react';
import { Session, ActivityItem } from '../types';
import { generateShiftHandover, generateIncidentSummary, detectSessionIncidents } from '../services/ai';
import { ClipboardList, Clock, CheckCircle2, AlertTriangle, Loader2, Copy, Check, FileSearch, Sparkles, FlaskConical, RotateCcw, Activity } from 'lucide-react';

interface Props {
  sessions: Session[];
  persistedState?: {
      report: string;
      reportTitle: string;
      activeCardId: string | null;
      smartCache: Record<string, { timestamp: number, items: ActivityItem[] }>;
      deletedIds?: string[];
  };
  onStateChange?: (state: any) => void;
  shiftStartTime: number;
  onShiftReset: () => void;
  onSimulateShift?: () => void;
}

const ShiftHandoverDashboard: React.FC<Props> = ({ sessions, persistedState, onStateChange, shiftStartTime, onShiftReset, onSimulateShift }) => {
  const [report, setReport] = useState<string>(persistedState?.report || '');
  const [reportTitle, setReportTitle] = useState<string>(persistedState?.reportTitle || 'GENERATED REPORT');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(persistedState?.activeCardId || null);
  const [smartCache, setSmartCache] = useState<Record<string, { timestamp: number, items: ActivityItem[] }>>(persistedState?.smartCache || {});
  const [deletedIds, setDeletedIds] = useState<string[]>(persistedState?.deletedIds || []);

  const [copied, setCopied] = useState(false);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);

  // Synchronize local state with props when they change externally (e.g. from AI tools)
  useEffect(() => {
    if (persistedState) {
        if (persistedState.report !== report) setReport(persistedState.report);
        if (persistedState.reportTitle !== reportTitle) setReportTitle(persistedState.reportTitle);
        if (persistedState.activeCardId !== activeCardId) setActiveCardId(persistedState.activeCardId);
        
        // Fix for infinite loop on reset:
        if (persistedState.deletedIds !== deletedIds) {
            const propEmpty = !persistedState.deletedIds || persistedState.deletedIds.length === 0;
            const localEmpty = deletedIds.length === 0;
            if (!propEmpty || !localEmpty) {
                setDeletedIds(persistedState.deletedIds || []);
            }
        }

        if (persistedState.smartCache !== smartCache) {
            const propEmpty = !persistedState.smartCache || Object.keys(persistedState.smartCache).length === 0;
            const localEmpty = Object.keys(smartCache).length === 0;
            if (!propEmpty || !localEmpty) {
                setSmartCache(persistedState.smartCache || {});
            }
        }
    }
  }, [persistedState]);

  // Sync state changes back to parent
  useEffect(() => {
      onStateChange?.({
          report,
          reportTitle,
          activeCardId,
          smartCache,
          deletedIds
      });
  }, [report, reportTitle, activeCardId, smartCache, deletedIds]);

  // Filter sessions based on shift start time
  useEffect(() => {
    const recent = sessions.filter(s => s.timestamp >= shiftStartTime);
    setFilteredSessions(recent.sort((a, b) => b.timestamp - a.timestamp));
  }, [sessions, shiftStartTime]);

  // AI Analysis Effect (Incident Detection)
  useEffect(() => {
    let cancelled = false;
    const analyzeSessions = async () => {
        // Find sessions that need analysis (either new or updated)
        const sessionsToAnalyze = filteredSessions.filter(s => {
            const cache = smartCache[s.id];
            return !cache || cache.timestamp !== s.timestamp;
        });

        if (sessionsToAnalyze.length === 0) return;

        // Process sequentially to avoid rate limits, or batch if possible
        for (const session of sessionsToAnalyze) {
             if (cancelled) return;
             let incidents;
             try {
                incidents = await detectSessionIncidents(session);
             } catch (e) {
                console.error('Incident detection failed', e);
                continue;
             }
             if (cancelled) return;

             const newItems: ActivityItem[] = incidents.map((inc, idx) => {
                 // Validate status string to match union type
                 let status: ActivityItem['status'] = 'OPEN';
                 const validStatuses: ActivityItem['status'][] = ['OPEN', 'RESOLVED', 'MONITORING'];
                 if (validStatuses.includes(inc.status as ActivityItem['status'])) {
                     status = inc.status as ActivityItem['status'];
                 }

                 // The AI-supplied timestamp can be unparseable ("last Tuesday").
                 // Fall back to the session time so the incident isn't silently
                 // dropped by downstream date filters / sorts.
                 const parsed = new Date(inc.timestamp);
                 const timestamp = isNaN(parsed.getTime()) ? new Date(session.timestamp) : parsed;

                 return {
                     uniqueId: `${session.id}-smart-${idx}`,
                     sessionId: session.id,
                     sessionTitle: session.title,
                     text: inc.title,
                     timestamp,
                     status: status,
                     isAiGrouped: true
                 };
             });

             setSmartCache(prev => ({
                 ...prev,
                 [session.id]: { timestamp: session.timestamp, items: newItems }
             }));

             // Add a significant delay between requests to be gentle on the API and avoid 429 quota limits
             await new Promise(resolve => setTimeout(resolve, 2000));
        }
    };

    // Debounce analysis to avoid spamming while typing
    const timer = setTimeout(analyzeSessions, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filteredSessions]); // smartCache excluded to prevent loops

  const handleResetShift = () => {
      setReport(''); // Clear previous report
      setReportTitle('GENERATED REPORT');
      setActiveCardId(null);
      setDeletedIds([]);
      setSmartCache({}); // Explicitly clear local state to match pending parent state
      onShiftReset();
  };

  const handleGenerateReport = async () => {
    if (filteredSessions.length === 0) return;
    setIsGenerating(true);
    setActiveCardId(null);
    setReportTitle('GLOBAL SHIFT HANDOVER');
    setReport(''); // Clear immediately to show loading state specifically for report
    try {
      const result = await generateShiftHandover(filteredSessions);
      setReport(result);
    } catch (e) {
      console.error('Report generation failed', e);
      setReport('Report generation failed — the AI service is unavailable. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleActivityClick = async (activity: ActivityItem) => {
    if (activity.isLoading) return;

    setActiveCardId(activity.uniqueId);
    
    // Find the session associated with this activity
    const session = sessions.find(s => s.id === activity.sessionId);
    if (!session) return;

    setIsGenerating(true);
    setReportTitle('INCIDENT SUMMARY');
    setReport(''); // Clear to show loading
    
    // Pass the specific activity text as the focus topic to isolate the incident
    try {
      const summary = await generateIncidentSummary(session, activity.text);
      setReport(summary);
    } catch (e) {
      console.error('Incident summary failed', e);
      setReport('Summary generation failed — the AI service is unavailable. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate shift duration for display
  const getShiftDuration = () => {
      // If start time is 0, it means no shift is active
      if (shiftStartTime === 0) return 'START SHIFT';

      // If duration is negative (e.g. system time drift or fresh init), show 0
      const diff = Math.max(0, Date.now() - shiftStartTime);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
  };

  const getStatusStyle = (status: string) => {
      switch(status) {
          case 'RESOLVED': return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30';
          case 'MONITORING': return 'text-amber-400 border-amber-500/30 bg-amber-950/30';
          default: return 'text-red-400 border-red-500/30 bg-red-950/30';
      }
  };

  // Metrics
  const totalSessions = filteredSessions.length;
  
  // Flatten all sessions into distinct activity cards
  const activityCards: ActivityItem[] = filteredSessions.flatMap(session => {
      const cache = smartCache[session.id];
      // Use smart cache if available and fresh
      if (cache && cache.timestamp === session.timestamp) {
          // Filter out user-deleted items or those marked explicitly via tool
          // AND filter out items that occurred before the shift start
          return cache.items.filter(item => 
              !deletedIds.includes(item.uniqueId) &&
              item.timestamp.getTime() >= shiftStartTime
          );
      }

      // Instead of showing raw inputs, show a loading placeholder while AI analyzes
      return [{
          uniqueId: `loading-${session.id}`,
          sessionId: session.id,
          sessionTitle: session.title,
          text: "Processing Incident Data...",
          timestamp: new Date(session.timestamp),
          status: 'OPEN',
          isAiGrouped: false,
          isLoading: true
      } as ActivityItem];
  }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Count only loaded items for the metric
  const activeCount = activityCards.filter(c => !c.isLoading).length;

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-bold text-slate-400 block uppercase tracking-wide flex items-center gap-2">
                <ClipboardList size={14} className="text-teal-400" />
                Shift Log
            </label>
            <div className="flex items-center gap-3">
               <div className="text-[10px] font-mono text-slate-500 hidden sm:block">
                  STARTED: <span className="text-slate-300">
                    {shiftStartTime === 0 ? '--:--' : new Date(shiftStartTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
               </div>
               {onSimulateShift && (
                   <button
                        onClick={onSimulateShift}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/50 transition-all"
                        title="Simulate Shift Data (Test Mode)"
                   >
                        <FlaskConical size={14} />
                   </button>
               )}
               <button 
                  onClick={handleResetShift}
                  className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 text-teal-400 border border-teal-500/30 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all hover:shadow-[0_0_15px_rgba(45,212,191,0.1)]"
               >
                  <RotateCcw size={12} />
                  Start New Shift
               </button>
            </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
               <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><AlertTriangle size={18} /></div>
               <div>
                  <div className="text-lg font-bold text-white leading-none">{activeCount}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-mono">Activity Items</div>
               </div>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
               <div className="p-2 bg-slate-800 rounded-lg text-slate-400"><Clock size={18} /></div>
               <div>
                  <div className="text-lg font-bold text-white leading-none">{getShiftDuration()}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-mono">Shift Duration</div>
               </div>
            </div>
        </div>

        <button
            onClick={handleGenerateReport}
            disabled={isGenerating || totalSessions === 0}
            className={`w-full border rounded-lg py-3 text-sm font-bold tracking-wide uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2
                ${activeCardId === null && report 
                    ? 'bg-teal-600/30 text-teal-300 border-teal-500' 
                    : 'bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border-teal-500/50 hover:shadow-[0_0_20px_rgba(45,212,191,0.2)]'
                }`}
        >
            {isGenerating && !activeCardId ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
            {isGenerating && !activeCardId ? 'Generating Global Report...' : 'Generate Full Shift Report'}
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-6 flex flex-col lg:flex-row gap-6">
         
         {/* Session List */}
         <div className="lg:w-1/3 flex flex-col gap-3 min-h-0">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-800">
                <Clock size={12} /> Recent Activity Stream
             </div>
             <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                 {activityCards.length === 0 ? (
                    <div className="text-center text-slate-600 text-xs py-8">No activity recorded in this shift</div>
                 ) : (
                    activityCards.map(activity => {
                        if (activity.isLoading) {
                            return (
                                <div key={activity.uniqueId} className="border border-slate-800/50 p-4 rounded-lg bg-slate-950/40 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-800/20 to-transparent animate-[shimmer_2s_infinite]"></div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-800/50 animate-pulse flex items-center justify-center">
                                            <Sparkles size={14} className="text-slate-600 animate-spin" />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 w-3/4 bg-slate-800/50 rounded animate-pulse"></div>
                                            <div className="h-2 w-1/2 bg-slate-800/30 rounded animate-pulse"></div>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-[10px] text-teal-500/50 font-mono uppercase tracking-widest">
                                        <Loader2 size={10} className="animate-spin" />
                                        Grouping Incidents...
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div 
                                key={activity.uniqueId} 
                                onClick={() => handleActivityClick(activity)}
                                className={`border p-3 rounded-lg transition-all group shadow-sm relative overflow-hidden cursor-pointer
                                    ${activeCardId === activity.uniqueId 
                                        ? 'bg-teal-950/30 border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.2)]' 
                                        : 'bg-slate-950/80 border-slate-800 hover:border-teal-500/50 hover:shadow-teal-900/10'
                                    }
                                `}
                            >
                                {/* Accent Bar */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors ${activeCardId === activity.uniqueId ? 'bg-teal-500' : 'bg-slate-800 group-hover:bg-teal-500'}`}></div>
                                
                                <div className="pl-3">
                                    {/* Title / Context */}
                                    <div className={`text-xs font-bold mb-2 leading-snug line-clamp-2 transition-colors ${activeCardId === activity.uniqueId ? 'text-teal-200' : 'text-slate-200 group-hover:text-teal-50'}`}>
                                        {activity.text}
                                    </div>
                                    
                                    {/* Metadata */}
                                    <div className="flex items-center justify-between border-t border-slate-800/50 pt-2 mt-2">
                                        <div className="flex items-center gap-2">
                                            {/* Status Badge */}
                                            <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${getStatusStyle(activity.status)}`}>
                                                {activity.status === 'RESOLVED' ? <CheckCircle2 size={10} /> : 
                                                 activity.status === 'MONITORING' ? <Activity size={10} /> : 
                                                 <AlertTriangle size={10} />}
                                                {activity.status}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                                            <Clock size={10} />
                                            {new Date(activity.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                 )}
             </div>
         </div>

         {/* Report Output */}
         <div className="lg:w-2/3 flex flex-col min-h-0 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden shadow-lg">
             <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                 <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded border transition-colors flex items-center gap-2
                     ${activeCardId 
                        ? 'text-teal-300 bg-teal-950/40 border-teal-800' 
                        : 'text-teal-500 bg-teal-950/20 border-teal-900/50'
                     }`}>
                    {activeCardId ? <FileSearch size={12} /> : <ClipboardList size={12} />}
                    {reportTitle}
                 </span>
                 {report && (
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors text-[10px] font-bold uppercase"
                    >
                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                 )}
             </div>
             
             <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
                {isGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                         <div className="w-12 h-12 border-4 border-slate-800 border-t-teal-500 rounded-full animate-spin"></div>
                         <p className="text-xs font-mono animate-pulse uppercase tracking-widest">
                             {activeCardId ? 'Analyzing Incident Logs...' : 'Compiling Global Shift Report...'}
                         </p>
                    </div>
                ) : report ? (
                    <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed animate-in fade-in duration-300">
                        {report}
                    </pre>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60">
                        <ClipboardList size={40} className="mb-3 opacity-50" />
                        <p className="text-xs font-bold uppercase tracking-wide">Ready to Generate</p>
                        <p className="text-[10px] mt-2 text-slate-500">Select an activity card or generate full report</p>
                    </div>
                )}
             </div>
         </div>
      </div>
    </div>
  );
};

export default ShiftHandoverDashboard;