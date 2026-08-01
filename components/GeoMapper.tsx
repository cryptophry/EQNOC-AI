import React, { useState, useEffect, useRef } from 'react';
import { generateGeoFiberPath, FiberPathData } from '../services/ai';
import { Map, Loader2, Search, Zap, Crosshair, Navigation, Ruler, Activity } from 'lucide-react';

const GeoMapper: React.FC = () => {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<FiberPathData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<any | null>(null);

  // Animated cursor on path
  const [traceProgress, setTraceProgress] = useState(0);

  useEffect(() => {
    let interval: any;
    if (data) {
        interval = setInterval(() => {
            setTraceProgress(p => (p + 1) % 100);
        }, 50);
    }
    return () => clearInterval(interval);
  }, [data]);

  const handleGenerate = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setData(null);
    const result = await generateGeoFiberPath(query);
    setData(result);
    setLoading(false);
  };

  const getPointsString = (points: {x:number, y:number}[]) => {
      return points.map(p => `${p.x},${p.y}`).join(' ');
  };

  const calculateEventX = (dist: number, totalDist: number) => {
      return (dist / totalDist) * 100;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <label className="text-xs font-bold text-slate-400 mb-3 block uppercase tracking-wide flex items-center gap-2">
            <Map size={14} className="text-cyan-400" />
            Geo-Spatial Fiber Mapper
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="Enter link endpoints (e.g. 'Route from Data Center A to Substation B')..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner font-mono"
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !query.trim()}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50 hover:shadow-lg hover:shadow-cyan-900/20"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 relative bg-slate-950/30 flex flex-col gap-6">
        
        {!data && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-80">
                <Map size={48} className="mb-4 text-slate-700" />
                <p className="text-sm font-bold tracking-wide">AWAITING GEO-DATA</p>
                <p className="text-xs text-slate-500 mt-2">Generate simulated GIS fiber routes and OTDR traces.</p>
            </div>
        )}

        {loading && (
            <div className="flex-1 flex flex-col items-center justify-center">
                 <div className="relative">
                    <div className="w-16 h-16 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Crosshair size={24} className="text-cyan-500/50" />
                    </div>
                 </div>
                 <p className="font-mono text-xs text-cyan-500 uppercase tracking-widest font-bold">Calculating Trajectory...</p>
            </div>
        )}

        {data && (
            <>
                <div className="flex-1 relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-2xl group">
                    {/* Map Grid Background */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none"></div>
                    
                    {/* SVG Map Layer */}
                    <svg className="w-full h-full p-8" viewBox="-10 -10 120 120" preserveAspectRatio="xMidYMid meet">
                        {/* Connecting Path (Glow) */}
                        <polyline 
                            points={getPointsString(data.route)} 
                            fill="none" 
                            stroke="#06b6d4" 
                            strokeWidth="1" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                            className="drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        />
                        
                        {/* Start Node */}
                        <g transform={`translate(${data.start.x}, ${data.start.y})`}>
                            <circle r="3" fill="#0ea5e9" className="animate-pulse" />
                            <circle r="6" fill="none" stroke="#0ea5e9" strokeWidth="0.5" opacity="0.5" />
                            <text y="-5" textAnchor="middle" fill="#bae6fd" fontSize="3" fontFamily="monospace" fontWeight="bold">{data.start.name}</text>
                        </g>

                        {/* End Node */}
                        <g transform={`translate(${data.end.x}, ${data.end.y})`}>
                            <circle r="3" fill="#10b981" />
                            <circle r="6" fill="none" stroke="#10b981" strokeWidth="0.5" opacity="0.5" />
                            <text y="-5" textAnchor="middle" fill="#a7f3d0" fontSize="3" fontFamily="monospace" fontWeight="bold">{data.end.name}</text>
                        </g>

                        {/* Waypoints / Events mapped roughly to line segments if possible, or simplified */}
                        {data.route.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="0.5" fill="#64748b" />
                        ))}
                    </svg>

                    {/* Stats Overlay */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <div className="bg-slate-900/90 border border-cyan-500/30 p-3 rounded-lg backdrop-blur-md shadow-lg">
                            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 mb-2 border-b border-cyan-900/50 pb-1">
                                <Ruler size={12} /> ROUTE METRICS
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] font-mono text-slate-300">
                                <span className="text-slate-500">DISTANCE:</span> <span>{data.distance.toFixed(2)} km</span>
                                <span className="text-slate-500">EST. LOSS:</span> <span className={data.estimatedLoss > 20 ? 'text-red-400' : 'text-emerald-400'}>{data.estimatedLoss.toFixed(2)} dB</span>
                                <span className="text-slate-500">EVENTS:</span> <span>{data.events.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* OTDR Trace View */}
                <div className="h-1/3 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={14} className="text-amber-400" />
                            OTDR Trace Simulation (1550nm)
                        </span>
                        {hoveredEvent && (
                            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30 animate-in fade-in">
                                {hoveredEvent.type} @ {hoveredEvent.distance}km (-{hoveredEvent.loss}dB)
                            </span>
                        )}
                    </div>
                    
                    <div className="flex-1 relative border-l border-b border-slate-700 ml-4 mb-2">
                        {/* Grid Lines */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_20%]" />
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:10%_100%]" />

                        {/* Trace Line SVG */}
                        <svg className="absolute inset-0 w-full h-full overflow-visible">
                            {/* Construct path: Start high, slope down, drop at events */}
                            <path
                                d={`
                                    M 0 10
                                    ${data.events.map((e, i, arr) => {
                                        const prevDist = i === 0 ? 0 : arr[i-1].distance;
                                        const prevY = 10 + (prevDist * 2) + (i > 0 ? arr.slice(0, i).reduce((acc, curr) => acc + (curr.loss * 10), 0) : 0);
                                        const x = calculateEventX(e.distance, data.distance);
                                        const slopeY = prevY + ((e.distance - prevDist) * 2); // Fiber loss slope
                                        const dropY = slopeY + (e.loss * 10); // Event loss drop
                                        return `L ${x}% ${slopeY} L ${x}% ${dropY}`;
                                    }).join(' ')}
                                    L 100% ${10 + (data.distance * 2) + data.events.reduce((acc, e) => acc + (e.loss * 10), 0)}
                                `}
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                                className="drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]"
                            />

                            {/* Event Markers */}
                            {data.events.map((e, i) => (
                                <g key={i}>
                                    <circle 
                                        cx={`${calculateEventX(e.distance, data.distance)}%`} 
                                        cy={`${10 + (e.distance * 2) + data.events.slice(0,i+1).reduce((acc, ev) => acc + (ev.loss * 10), 0)}`} 
                                        r="4" 
                                        fill="#1e293b" 
                                        stroke={e.type === 'CUT' ? '#ef4444' : '#38bdf8'}
                                        strokeWidth="2"
                                        className="cursor-pointer hover:scale-150 transition-transform"
                                        onMouseEnter={() => setHoveredEvent(e)}
                                        onMouseLeave={() => setHoveredEvent(null)}
                                    />
                                    {e.type === 'CUT' && (
                                        <text x={`${calculateEventX(e.distance, data.distance)}%`} y="90%" fill="#ef4444" fontSize="10" textAnchor="middle" fontWeight="bold">FAULT</text>
                                    )}
                                </g>
                            ))}
                        </svg>
                        
                        {/* Axis Labels */}
                        <div className="absolute -left-6 top-0 text-[8px] text-slate-500">0dB</div>
                        <div className="absolute -left-6 bottom-0 text-[8px] text-slate-500">-30dB</div>
                        <div className="absolute left-0 -bottom-4 text-[8px] text-slate-500">0km</div>
                        <div className="absolute right-0 -bottom-4 text-[8px] text-slate-500">{data.distance}km</div>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default GeoMapper;