import React, { useState } from 'react';
import { generateTopologyMermaid } from '../services/ai';
import MermaidDiagram from './MermaidDiagram';
import { Network, Search, Loader2, RefreshCw, FileText } from 'lucide-react';

const TopologyVisualizer: React.FC = () => {
  const [input, setInput] = useState('');
  const [chartCode, setChartCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    const code = await generateTopologyMermaid(input);
    setChartCode(code);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <label className="text-xs font-bold text-slate-400 mb-3 block uppercase tracking-wide flex items-center gap-2">
            <Network size={14} className="text-emerald-400" />
            Holo-Mapper (Topology Visualizer)
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="Paste 'show lldp neighbors' output or describe network..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner font-mono"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !input.trim()}
            className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50 hover:shadow-lg hover:shadow-emerald-900/20"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 relative bg-slate-950/30 flex items-center justify-center">
        {!chartCode && !isLoading && (
            <div className="text-center text-slate-600 opacity-80 flex flex-col items-center">
                <Network size={48} className="mx-auto mb-4 text-slate-700" />
                <p className="text-sm font-bold tracking-wide">AWAITING TOPOLOGY DATA</p>
                <div className="text-xs text-slate-500 mt-2 max-w-md space-y-1">
                   <p>Paste CLI output from devices to instantly map the network.</p>
                   <code className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-slate-800 inline-block">show lldp neighbors detail</code>
                </div>
            </div>
        )}

        {isLoading && (
            <div className="flex flex-col items-center">
                 <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                 <p className="font-mono text-xs text-emerald-500 uppercase tracking-widest font-bold">Parsing Network Graph...</p>
            </div>
        )}

        {chartCode && !isLoading && (
            <div className="w-full h-full overflow-auto">
                <MermaidDiagram chart={chartCode} />
            </div>
        )}
      </div>
    </div>
  );
};

export default TopologyVisualizer;