import React, { useState } from 'react';
import { generateTroubleshootingFlow } from '../services/gemini';
import { FlowNode } from '../types';
import { Search, GitBranch, Terminal, CheckCircle2, AlertTriangle, Copy, RefreshCw, ChevronDown } from 'lucide-react';

interface Props {
  onCommandSelect?: (cmd: string) => void;
  onNodeClick?: (node: FlowNode) => void;
  persistedInput?: string;
  persistedTree?: FlowNode | null;
  onStateChange?: (input: string, tree: FlowNode | null) => void;
}

const FlowNodeView: React.FC<{ node: FlowNode; isRoot?: boolean; depth: number; onNodeClick?: (node: FlowNode) => void }> = ({ node, isRoot = false, depth, onNodeClick }) => {
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

  return (
    <div className={`relative flex flex-col ${!isRoot ? 'ml-8' : ''}`}>
      {!isRoot && (
        <div className="absolute -left-8 top-5 w-8 h-[2px] bg-slate-700"></div>
      )}
      
      <div 
        onClick={() => onNodeClick?.(node)}
        className={`
          relative z-10 mb-3 rounded-lg border bg-slate-900 px-4 py-3 w-full max-w-lg cursor-pointer transition-all shadow-md
          ${node.type === 'solution' ? 'border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-900/30' : 'border-slate-700 hover:border-cyan-500 hover:bg-slate-800 hover:shadow-cyan-500/10'}
      `}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 opacity-90">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-100">{node.title}</h4>
            {node.description && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{node.description}</p>}
            
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

      {node.branches && node.branches.length > 0 && (
        <div className={`pl-0 border-l-2 border-slate-800 ml-8 space-y-4 pt-4 pb-2`}>
           {node.branches.map((branch, idx) => (
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
    onStateChange 
}) => {
  const [input, setInput] = useState(persistedInput);
  const [isLoading, setIsLoading] = useState(false);
  const [tree, setTree] = useState<FlowNode | null>(persistedTree);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);
      onStateChange?.(val, tree);
  };

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    // Optimistically keep the tree if regenerating or clear it? 
    // Usually clearer to clear it, but let's clear it to show loading state.
    setTree(null); 
    onStateChange?.(input, null);

    try {
      const result = await generateTroubleshootingFlow(input);
      setTree(result);
      onStateChange?.(input, result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
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
            disabled={isLoading || !input.trim()}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50 hover:shadow-lg hover:shadow-cyan-900/20"
            title="Analyze"
          >
            {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
          
          {tree && !isLoading && (
            <button
                onClick={handleAnalyze}
                disabled={isLoading}
                className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all"
                title="Regenerate Flow"
            >
                <RefreshCw size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 scrollbar-hide relative bg-slate-950/30">
        {!tree && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-80">
             <GitBranch size={48} className="mb-4 text-slate-700" />
             <p className="text-sm font-bold tracking-wide">AWAITING INPUT</p>
             <p className="text-xs text-slate-500 mt-2">Describe the issue to generate a triage path</p>
          </div>
        )}

        {isLoading && (
          <div className="h-full flex flex-col items-center justify-center">
             <div className="w-10 h-10 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
             <p className="font-mono text-xs text-cyan-500 uppercase tracking-widest font-bold">Generating Tree...</p>
          </div>
        )}

        {tree && (
          <div className="pb-16 pl-4">
            <FlowNodeView node={tree} depth={0} isRoot={true} onNodeClick={onNodeClick} />
            <div className="mt-12 flex justify-center opacity-40">
               <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaultAssistant;