import React, { useState } from 'react';
import { generateNetworkConfig } from '../services/ai';
import { PenTool, Loader2, Copy, Check, Terminal, Cpu } from 'lucide-react';

const ConfigArchitect: React.FC = () => {
  const [intent, setIntent] = useState('');
  const [vendor, setVendor] = useState('Cisco IOS-XR');
  const [config, setConfig] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!intent.trim()) return;
    setIsLoading(true);
    const result = await generateNetworkConfig(intent, vendor);
    // Strip markdown code blocks if present for cleaner copy/paste
    const cleanResult = result.replace(/```[a-z]*\n/g, '').replace(/```/g, '');
    setConfig(cleanResult);
    setIsLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const vendors = ['Cisco IOS-XR', 'Juniper Junos', 'Nokia SROS', 'Arista EOS'];

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <label className="text-xs font-bold text-slate-400 mb-3 block uppercase tracking-wide flex items-center gap-2">
            <PenTool size={14} className="text-emerald-400" />
            Config Architect
        </label>
        
        {/* Vendor Selection */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
            {vendors.map(v => (
                <button
                    key={v}
                    onClick={() => setVendor(v)}
                    className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all whitespace-nowrap
                        ${vendor === v 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50' 
                            : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                >
                    {v}
                </button>
            ))}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder={`Describe desired ${vendor.split(' ')[0]} config (e.g. L3VPN for Cust A)...`}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !intent.trim()}
            className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50 hover:shadow-lg hover:shadow-emerald-900/20"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Cpu size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 relative bg-slate-950/30 flex flex-col">
        {!config && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-80">
                <Terminal size={48} className="mb-4 text-slate-700" />
                <p className="text-sm font-bold tracking-wide">READY TO BUILD</p>
                <p className="text-xs text-slate-500 mt-2">Describe configuration intent to generate CLI commands</p>
            </div>
        )}

        {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center">
                 <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                 <p className="font-mono text-xs text-emerald-500 uppercase tracking-widest font-bold">Designing Architecture...</p>
            </div>
        )}

        {config && !isLoading && (
            <div className="flex-1 relative group flex flex-col min-h-0">
                <div className="absolute top-0 right-0 p-2 z-10">
                    <button
                        onClick={handleCopy}
                        className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 backdrop-blur transition-colors"
                        title="Copy Configuration"
                    >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                </div>
                <div className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-4 shadow-inner">
                    <pre className="font-mono text-xs text-emerald-100/90 whitespace-pre-wrap leading-relaxed">
                        {config}
                    </pre>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ConfigArchitect;