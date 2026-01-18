import React, { useState, useEffect, useRef } from 'react';
import { generateTroubleshootingFlow } from '../services/gemini';
import { FlowNode } from '../types';
import { Search, GitBranch, Terminal, CheckCircle2, AlertTriangle, Copy, RefreshCw, ChevronDown, ChevronRight, BrainCircuit, ZoomIn, ZoomOut, Maximize, Move } from 'lucide-react';

interface Props {
  onCommandSelect?: (cmd: string) => void;
  onNodeClick?: (node: FlowNode) => void;
  persistedInput?: string;
  persistedTree?: FlowNode | null;
  onStateChange?: (input: string, tree: FlowNode | null) => void;
  isExternalLoading?: boolean;
}

const FlowNodeView: React.FC<{ node: FlowNode; isRoot?: boolean; depth: number; onNodeClick?: (node: FlowNode) => void }> = ({ node, isRoot = false, depth, onNodeClick }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.branches && node.branches.length > 0;

  const getIcon = () => {
    switch (node.type) {
      case 'command': return <Terminal size={16} className="text-cyan-500" />;
      case 'decision': return <GitBranch size={16} className="text-amber-500" />;
      case 'solution': return <CheckCircle2 size={16} className="text-emerald-500" />;
      default: return <AlertTriangle size={16} className="text-slate-500" />;
    }
  };

  const copyCommand = (e: React.MouseEvent, cmd: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd);
  };

  const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExpanded(!isExpanded);
  };

  return (
    <div className={`relative flex flex-col ${!isRoot ? 'ml-8' : ''}`}>
      {!isRoot && (
        <div className="absolute -left-8 top-5 w-8 h-[2px] bg-slate-700"></div>
      )}
      
      <div 
        onClick={() => onNodeClick?.(node)}
        className={`
          relative z-10 mb-3 rounded-lg border bg-slate-900 px-4 py-3 w-full max-w-lg cursor-pointer transition-all shadow-md group
          ${node.type === 'solution' ? 'border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-900/30' : 'border-slate-700 hover:border-cyan-500 hover:bg-slate-800 hover:shadow-cyan-500/10'}
      `}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 opacity-90">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
                <h4 className="text-sm font-bold text-slate-100">{node.title}</h4>
                {hasChildren && (
                    <button 
                        onClick={toggleExpand}
                        className="text-slate-500 hover:text-cyan-400 transition-colors p-0.5 rounded hover:bg-slate-800"
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                )}
            </div>
            {node.description && <p className="text-xs text-slate-400 mt-1 leading-relaxed pr-6">{node.description}</p>}
            
            {node.command && (
                <div className="mt-3 flex items-center gap-2 group/cmd" onClick={(e) => copyCommand(e, node.command!)}>
                    <code className="flex-1 block bg-black/40 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-cyan-300 break-all hover:border-cyan-500/40 transition-colors">
                    {node.command}
                    </code>
                    <Copy size={14} className="text-slate-500 group-hover/cmd:text-cyan-400" />
                </div>
            )}
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className={`pl-0 border-l-2 border-slate-800 ml-8 space-y-4 pt-4 pb-2 animate-in slide-in-from-top-2 duration-200`}>
           {node.branches!.map((branch, idx) => (
             <div key={idx} className="relative">
                <div className="flex items-center gap-2 mb-2 -ml-8 pl-0.5">
                   <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-600 bg-slate-900 z-20"></div>
                   <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-tight bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {branch.label}
                   </span>
                </div>
                <div className="">
                   <FlowNodeView node={branch.node} depth={depth + 1} onNodeClick={onNodeClick} />
                </div>
             </div>
           ))}
        </div>
      )}
    </div>
  );
};

const FaultAssistant: React.FC<Props> = ({ 
    onCommandSelect, 
    onNodeClick, 
    persistedInput = '', 
    persistedTree = null, 
    onStateChange,
    isExternalLoading = false
}) => {
  const [input, setInput] = useState(persistedInput);
  const [isLoading, setIsLoading] = useState(false);
  const [tree, setTree] = useState<FlowNode | null>(persistedTree);
  const [progress, setProgress] = useState(0);

  // Zoom and Pan State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize internal state when props change
  useEffect(() => {
    if (persistedInput !== input) setInput(persistedInput);
  }, [persistedInput]);

  useEffect(() => {
    if (persistedTree !== tree) {
        setTree(persistedTree);
        // Reset zoom on new tree
        if (persistedTree) {
            setScale(1);
            setPosition({ x: 50, y: 50 });
        }
    }
  }, [persistedTree]);

  const showLoading = isLoading || isExternalLoading;

  // Progress Bar Simulation
  useEffect(() => {
    let interval: any;
    if (showLoading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 98) return 98;
          const remaining = 99 - prev;
          const increment = Math.max(0.5, remaining * 0.15); 
          return prev + increment;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [showLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);
      onStateChange?.(val, tree);
  };

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setTree(null); 
    onStateChange?.(input, null);
    
    // Reset view
    setScale(1);
    setPosition({ x: 50, y: 50 });

    try {
      const result = await generateTroubleshootingFlow(input);
      setProgress(100);
      await new Promise(r => setTimeout(r, 600)); 
      setTree(result);
      onStateChange?.(input, result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Zoom & Pan Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    if (!tree) return;
    // e.preventDefault(); // Note: React synthetic events can't always preventDefault on wheel if passive
    
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.2, scale + scaleAmount), 3);
    
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!tree) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const zoomIn = () => setScale(s => Math.min(s + 0.2, 3));
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.2));
  const resetView = () => {
      setScale(1);
      setPosition({ x: 50, y: 50 });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 relative">
        <label className="text-xs font-bold text-slate-400 mb-3 block uppercase tracking-wide">Describe Network Fault</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="e.g. BGP neighbor down on Core-SF-01..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner"
          />
          <button
            onClick={handleAnalyze}
            disabled={showLoading || !input.trim()}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50 hover:shadow-lg hover:shadow-cyan-900/20"
            title="Analyze"
          >
            {showLoading ? <BrainCircuit size={18} className="animate-pulse" /> : <Search size={18} />}
          </button>
          
          {tree && !showLoading && (
            <button
                onClick={handleAnalyze}
                disabled={showLoading}
                className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all"
                title="Regenerate Flow"
            >
                <RefreshCw size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-950/30">
        
        {/* Empty State */}
        {!tree && !showLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 opacity-80 pointer-events-none">
             <GitBranch size={48} className="mb-4 text-slate-700" />
             <p className="text-sm font-bold tracking-wide">AWAITING INPUT</p>
             <p className="text-xs text-slate-500 mt-2">Describe the issue to generate a triage path</p>
          </div>
        )}

        {/* Loading State */}
        {showLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center animate-in fade-in duration-500 pointer-events-none z-30 bg-slate-900/50 backdrop-blur-sm">
             <div className="relative mb-6">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                    <path className="text-slate-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    <path 
                        className="text-cyan-500 transition-all duration-300 ease-out" 
                        strokeDasharray={`${progress}, 100`} 
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.5" 
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-sm text-cyan-400">
                    {Math.round(progress)}%
                </div>
             </div>
             
             <div className="flex flex-col items-center gap-2">
                 <p className="font-mono text-xs text-slate-400 uppercase tracking-widest font-bold animate-pulse">
                    Generating...
                 </p>
             </div>
          </div>
        )}

        {/* Zoom Controls Toolbar */}
        {tree && !showLoading && (
            <div className="absolute bottom-6 right-6 z-50 flex flex-col gap-2 bg-slate-900/90 border border-slate-700 rounded-lg p-1 shadow-xl backdrop-blur">
                <button onClick={zoomIn} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title="Zoom In">
                    <ZoomIn size={18} />
                </button>
                <button onClick={zoomOut} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title="Zoom Out">
                    <ZoomOut size={18} />
                </button>
                <div className="h-px bg-slate-700 my-0.5 mx-2"></div>
                <button onClick={resetView} className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors" title="Reset View">
                    <Maximize size={18} />
                </button>
            </div>
        )}

        {/* Canvas Area */}
        <div 
            ref={containerRef}
            className={`w-full h-full overflow-hidden ${tree && !showLoading ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {tree && (
              <div 
                style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
                className="w-full h-full p-8"
              >
                <FlowNodeView node={tree} depth={0} isRoot={true} onNodeClick={onNodeClick} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default FaultAssistant;