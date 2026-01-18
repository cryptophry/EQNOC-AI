import React, { useState, useEffect } from 'react';
import { Calculator, FileDiff, StickyNote, ArrowRight, X, ScanSearch, Loader2, AlertTriangle, CheckCircle2, Binary, Search, Copy, Zap, Cpu, ScanLine, LayoutGrid, MousePointer2 } from 'lucide-react';
import { generateRegex, RegexResult, lookupMacVendor, MacLookupResult } from '../services/gemini';
// analyzeRawLogs import removed as it is no longer used here

interface Props {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
}

const NetworkTools: React.FC<Props> = ({ activeTab, onTabChange, notes, onNotesChange }) => {
  const activeTabClass = "border-cyan-400 text-cyan-400 bg-cyan-950/10";
  const inactiveTabClass = "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30";
  
  const [internalTab, setInternalTab] = useState('notes');
  const currentTab = activeTab || internalTab;

  const handleTabChange = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden relative shadow-inner">
      <div className="flex border-b border-slate-800 bg-slate-950/30 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => handleTabChange('ip')}
          className={`flex-1 py-3 px-2 text-[10px] lg:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${currentTab === 'ip' ? activeTabClass : inactiveTabClass}`}
        >
          <Calculator size={14} /> IP Calc
        </button>
        <button
          onClick={() => handleTabChange('mac')}
          className={`flex-1 py-3 px-2 text-[10px] lg:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${currentTab === 'mac' ? 'border-sky-400 text-sky-400 bg-sky-950/10' : inactiveTabClass}`}
        >
          <ScanLine size={14} /> MAC Scan
        </button>
        <button
          onClick={() => handleTabChange('diff')}
          className={`flex-1 py-3 px-2 text-[10px] lg:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${currentTab === 'diff' ? 'border-amber-400 text-amber-400 bg-amber-950/10' : inactiveTabClass}`}
        >
          <FileDiff size={14} /> Diff
        </button>
        <button
          onClick={() => handleTabChange('regex')}
          className={`flex-1 py-3 px-2 text-[10px] lg:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${currentTab === 'regex' ? 'border-violet-400 text-violet-400 bg-violet-950/10' : inactiveTabClass}`}
        >
          <Search size={14} /> Regex
        </button>
        <button
          onClick={() => handleTabChange('optical')}
          className={`flex-1 py-3 px-2 text-[10px] lg:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${currentTab === 'optical' ? 'border-orange-400 text-orange-400 bg-orange-950/10' : inactiveTabClass}`}
        >
          <Zap size={14} /> Optical
        </button>
        <button
          onClick={() => handleTabChange('notes')}
          className={`flex-1 py-3 px-2 text-[10px] lg:text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${currentTab === 'notes' ? 'border-emerald-400 text-emerald-400 bg-emerald-950/10' : inactiveTabClass}`}
        >
          <StickyNote size={14} /> Notes
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-5 relative">
        {currentTab === 'ip' && <SubnetCalculator />}
        {currentTab === 'mac' && <MacOuiLookup />}
        {currentTab === 'diff' && <SimpleDiff />}
        {currentTab === 'regex' && <RegexBuilder />}
        {currentTab === 'optical' && <OpticalCalculator />}
        {currentTab === 'notes' && <Scratchpad notes={notes} onNotesChange={onNotesChange} />}
      </div>
    </div>
  );
};

const SubnetCalculator = () => {
  const [input, setInput] = useState('192.168.1.1/24');
  const [result, setResult] = useState<any>(null);
  const [vizMask, setVizMask] = useState<number | null>(null);

  const calculate = (val: string) => {
    setInput(val);
    try {
      const [ip, maskStr] = val.split('/');
      if (!ip) { setResult(null); return; }
      
      const mask = maskStr ? parseInt(maskStr) : 32;
      if (isNaN(mask) || mask < 0 || mask > 32) { setResult(null); return; }

      const ipParts = ip.split('.').map(Number);
      if (ipParts.length !== 4 || ipParts.some(p => isNaN(p) || p < 0 || p > 255)) { setResult(null); return; }

      const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
      const maskNum = mask === 0 ? 0 : (~0) << (32 - mask);
      
      const networkNum = ipNum & maskNum;
      const broadcastNum = networkNum | (~maskNum);

      const toIp = (num: number) => {
        return [(num >>> 24) & 0xFF, (num >>> 16) & 0xFF, (num >>> 8) & 0xFF, num & 0xFF].join('.');
      };

      const toBinary = (num: number) => {
        return [(num >>> 24) & 0xFF, (num >>> 16) & 0xFF, (num >>> 8) & 0xFF, num & 0xFF]
          .map(b => b.toString(2).padStart(8, '0'))
          .join('.');
      };

      const hosts = Math.pow(2, 32 - mask) - 2;

      setResult({
        network: toIp(networkNum),
        networkNum: networkNum, // Store for visualizer
        currentMask: mask,      // Store for visualizer
        broadcast: toIp(broadcastNum),
        mask: toIp(maskNum),
        hosts: hosts > 0 ? hosts : 0,
        class: mask < 8 ? 'A' : mask < 16 ? 'B' : mask < 24 ? 'C' : 'CIDR',
        ipDecimal: (ipNum >>> 0).toString(),
        ipBinary: toBinary(ipNum),
        maskBinary: toBinary(maskNum)
      });
      
      // Reset viz on drastic change, or default to next logical step
      setVizMask(null);

    } catch (e) {
      setResult(null);
    }
  };

  useEffect(() => { calculate(input) }, []);

  // CIDR Visualizer Logic
  const renderVisualizer = () => {
    if (!result || !result.currentMask) return null;
    
    const current = result.currentMask;
    const target = vizMask || current;
    const diff = target - current;
    const count = Math.pow(2, diff);

    // Limit visualization to prevent browser crash
    if (count > 512) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-slate-500 border border-slate-800 rounded-lg bg-slate-950/30 border-dashed">
                <AlertTriangle size={32} className="mb-2" />
                <p className="text-xs">Too many subnets to visualize ({count}).</p>
                <p className="text-[10px]">Select a smaller subdivision range.</p>
            </div>
        );
    }

    const items = [];
    const blockSize = Math.pow(2, 32 - target);
    
    // Int to IP helper
    const toIp = (num: number) => [(num >>> 24) & 0xFF, (num >>> 16) & 0xFF, (num >>> 8) & 0xFF, num & 0xFF].join('.');

    for (let i = 0; i < count; i++) {
        const subnetBase = (result.networkNum >>> 0) + (i * blockSize);
        const subnetIp = toIp(subnetBase);
        
        let label = `/${target}`;
        let subText = "";
        let colorClass = "bg-slate-800 border-slate-700 text-slate-400";

        if (target === 32) {
            // Individual IPs
            label = subnetIp.split('.')[3]; // Just last octet
            if (subnetBase === (result.networkNum >>> 0)) {
                colorClass = "bg-amber-900/40 border-amber-500/50 text-amber-400";
                subText = "Network";
            } else if (subnetBase === ((result.networkNum >>> 0) + Math.pow(2, 32 - current) - 1)) {
                 colorClass = "bg-red-900/40 border-red-500/50 text-red-400";
                 subText = "Broadcast";
            } else {
                 colorClass = "bg-emerald-900/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40";
                 subText = "Host";
            }
        } else {
            // Subnet Blocks
            const subBroadcast = toIp(subnetBase + blockSize - 1);
            colorClass = "bg-cyan-900/10 border-cyan-500/20 hover:bg-cyan-900/30 hover:border-cyan-500/50 text-cyan-300";
            subText = `Range: .${subnetIp.split('.')[3]} - .${subBroadcast.split('.')[3]}`;
        }

        items.push(
            <div key={i} className={`p-1.5 rounded border flex flex-col items-center justify-center text-center transition-all ${colorClass} min-h-[50px]`}>
                <div className="font-mono text-[10px] xl:text-xs font-bold w-full break-all leading-tight">{target === 32 ? label : subnetIp}</div>
                {target !== 32 && <div className="text-[9px] font-mono opacity-70">{label}</div>}
                {subText && <div className="text-[8px] uppercase tracking-wider opacity-60 mt-0.5">{subText}</div>}
            </div>
        );
    }

    return (
        <div className={`grid gap-2 mt-2 ${
            target === 32 ? 'grid-cols-8 sm:grid-cols-10' : 
            count <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 
            count <= 16 ? 'grid-cols-2 sm:grid-cols-4' : 
            'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5'
        }`}>
            {items}
        </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto scrollbar-hide pr-1">
      <div>
        <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-2 block tracking-wide">IP Address / CIDR</label>
        <input 
          type="text" 
          value={input}
          onChange={(e) => calculate(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-base font-mono text-cyan-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all shadow-inner"
          placeholder="e.g. 10.20.30.1/24"
        />
      </div>

      {result ? (
        <div className="flex flex-col gap-4">
           <div className="grid grid-cols-2 gap-3">
               <InfoBox label="Network" value={result.network} />
               <InfoBox label="Broadcast" value={result.broadcast} />
               <InfoBox label="Netmask" value={result.mask} />
               <InfoBox label="Usable Hosts" value={result.hosts.toLocaleString()} color="text-emerald-400" />
           </div>

           <div className="space-y-3 pt-4 border-t border-slate-800">
               <div className="flex items-center gap-2 mb-1 opacity-70">
                  <Binary size={14} className="text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Binary & Decimal</span>
               </div>
               <InfoBox label="IP Decimal" value={result.ipDecimal} color="text-amber-400" />
               <InfoBox label="IP Binary" value={result.ipBinary} fontClass="text-[10px] tracking-widest text-cyan-200" />
               <InfoBox label="Netmask Binary" value={result.maskBinary} fontClass="text-[10px] tracking-widest text-slate-500" />
           </div>

           {/* CIDR Visualizer Section */}
           <div className="pt-4 border-t border-slate-800 animate-in slide-in-from-bottom-2 duration-500">
               <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-2">
                       <LayoutGrid size={16} className="text-cyan-400" />
                       <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">CIDR Map</span>
                   </div>
                   
                   {/* Visualization Controls */}
                   <div className="flex gap-1 overflow-x-auto max-w-[350px] scrollbar-hide">
                       {[...Array(8)].map((_, i) => {
                           const maskOption = result.currentMask + i;
                           if (maskOption > 32) return null;
                           // Only show up to +6 steps to keep grid reasonable (max 64 items) unless it's /32
                           if (i > 6 && maskOption !== 32) return null; 
                           
                           return (
                               <button
                                   key={maskOption}
                                   onClick={() => setVizMask(maskOption === result.currentMask ? null : maskOption)}
                                   className={`px-2 py-1 rounded text-[10px] font-bold font-mono border transition-all whitespace-nowrap
                                       ${(vizMask === maskOption) || (!vizMask && maskOption === result.currentMask)
                                           ? 'bg-cyan-600 border-cyan-400 text-white' 
                                           : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                                       }
                                   `}
                               >
                                   /{maskOption}
                               </button>
                           );
                       })}
                   </div>
               </div>

               <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                   {/* Legend for /32 view */}
                   {(vizMask === 32 || (!vizMask && result.currentMask === 32)) && (
                       <div className="flex gap-3 mb-2 justify-center">
                           <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="text-[9px] text-slate-400 uppercase">Network</span></div>
                           <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-[9px] text-slate-400 uppercase">Usable</span></div>
                           <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-[9px] text-slate-400 uppercase">Broadcast</span></div>
                       </div>
                   )}
                   
                   {renderVisualizer()}
                   
                   {!vizMask && result.currentMask < 32 && (
                       <div className="text-center mt-2 text-[10px] text-slate-600 font-mono flex items-center justify-center gap-1">
                           <MousePointer2 size={10} />
                           Select a mask above to visualize subdivisions
                       </div>
                   )}
               </div>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          Enter a valid IP or CIDR (e.g., 10.0.0.1/24)
        </div>
      )}
    </div>
  );
};

const MacOuiLookup = () => {
  const [mac, setMac] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MacLookupResult | null>(null);
  const [bits, setBits] = useState<{ binary: string; ul: boolean; ig: boolean } | null>(null);

  const cleanMac = (input: string) => {
    return input.replace(/[^0-9A-Fa-f]/g, '');
  };

  const handleLookup = async () => {
    const raw = cleanMac(mac);
    if (raw.length < 6) return; // Need at least OUI (6 chars)
    
    setLoading(true);
    setResult(null);
    setBits(null);

    // Calculate Bits locally immediately
    const firstByte = parseInt(raw.substring(0, 2), 16);
    if (!isNaN(firstByte)) {
      const binary = firstByte.toString(2).padStart(8, '0');
      // U/L is the 2nd least significant bit of the first byte (bit 1, value 2)
      // I/G is the least significant bit of the first byte (bit 0, value 1)
      const ul = (firstByte & 2) !== 0; // 1 = Local, 0 = Universal
      const ig = (firstByte & 1) !== 0; // 1 = Group, 0 = Individual
      setBits({ binary, ul, ig });
    }

    // Lookup Vendor via Gemini
    const data = await lookupMacVendor(raw.substring(0, 6));
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto scrollbar-hide pr-1">
      <div>
        <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-2 block tracking-wide">MAC Address Scan</label>
        <div className="flex gap-2">
            <input 
              type="text" 
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-base font-mono text-sky-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all shadow-inner uppercase"
              placeholder="00:1A:2B:3C:4D:5E"
            />
            <button
               onClick={handleLookup}
               disabled={loading || cleanMac(mac).length < 6}
               className="bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-lg px-5 transition-all disabled:opacity-50 hover:shadow-[0_0_15px_rgba(14,165,233,0.2)]"
            >
               {loading ? <Loader2 size={20} className="animate-spin" /> : <ScanLine size={20} />}
            </button>
        </div>
      </div>

      {/* Bit Analysis Visualization */}
      {bits && (
         <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>
            <div className="text-[10px] text-slate-500 uppercase font-mono font-bold tracking-widest mb-3 flex items-center gap-2">
               <Binary size={12} /> FIRST OCTET ANALYSIS
            </div>
            
            <div className="flex items-center justify-center gap-1 font-mono text-lg mb-4">
               {bits.binary.split('').map((bit, i) => (
                  <span key={i} className={`w-6 h-8 flex items-center justify-center rounded border ${
                     i === 6 ? (bits.ul ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400') :
                     i === 7 ? (bits.ig ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-blue-500/20 border-blue-500/50 text-blue-400') :
                     'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                     {bit}
                  </span>
               ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className={`p-2 rounded border text-center ${bits.ul ? 'border-amber-500/30 bg-amber-950/20 text-amber-400' : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400'}`}>
                   <div className="text-[9px] uppercase font-bold opacity-70">ADMINISTRATION (U/L)</div>
                   <div className="text-xs font-bold mt-1">{bits.ul ? 'LOCALLY ADMINISTERED' : 'UNIVERSAL (OUI)'}</div>
               </div>
               <div className={`p-2 rounded border text-center ${bits.ig ? 'border-purple-500/30 bg-purple-950/20 text-purple-400' : 'border-blue-500/30 bg-blue-950/20 text-blue-400'}`}>
                   <div className="text-[9px] uppercase font-bold opacity-70">TYPE (I/G)</div>
                   <div className="text-xs font-bold mt-1">{bits.ig ? 'MULTICAST / GROUP' : 'UNICAST / INDIVIDUAL'}</div>
               </div>
            </div>
         </div>
      )}

      {/* Vendor Result */}
      {result ? (
        <div className="animate-in slide-in-from-bottom-2 duration-500">
             <div className="bg-sky-950/10 border border-sky-500/30 rounded-lg p-5 relative overflow-hidden">
                {/* Scanner effect line */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-sky-400/50 animate-[scan_2s_linear_infinite] shadow-[0_0_10px_#38bdf8]"></div>
                
                <div className="text-[10px] text-sky-600 uppercase font-mono font-bold tracking-widest mb-1">VENDOR IDENTIFIED</div>
                <div className="text-xl font-bold text-white mb-2 font-display tracking-wide">{result.vendor}</div>
                
                <div className="flex gap-3">
                    {result.country && (
                       <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono">
                          {result.country}
                       </span>
                    )}
                    {result.isPrivate && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-950/30 border border-amber-500/30 text-amber-400 font-bold flex items-center gap-1">
                           <AlertTriangle size={10} /> PRIVATE
                        </span>
                    )}
                </div>
             </div>
        </div>
      ) : (
         !loading && !bits && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-60">
                <ScanLine size={40} className="mb-3 text-slate-700" />
                <p className="text-xs font-mono">ENTER MAC TO IDENTIFY VENDOR</p>
            </div>
         )
      )}
    </div>
  );
};

const InfoBox = ({ label, value, color = 'text-slate-200', fontClass }: any) => (
  <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-lg overflow-hidden group hover:border-slate-700 transition-colors">
    <div className="text-[10px] text-slate-500 uppercase font-mono mb-1 font-bold truncate">{label}</div>
    <div className={`font-mono font-bold truncate ${fontClass || 'text-sm'} ${color}`}>{value}</div>
  </div>
);

const SimpleDiff = () => {
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  
  const getDiff = () => {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    // Very naive diff for visual purpose
    const max = Math.max(linesA.length, linesB.length);
    const output = [];

    for (let i = 0; i < max; i++) {
      const a = linesA[i] || '';
      const b = linesB[i] || '';
      if (a === b) {
        output.push({ type: 'same', text: a });
      } else {
        if (a) output.push({ type: 'del', text: a });
        if (b) output.push({ type: 'add', text: b });
      }
    }
    return output;
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex gap-3 h-1/3">
        <textarea 
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono resize-none focus:outline-none focus:border-amber-500/50 text-slate-300 scrollbar-hide leading-relaxed"
          placeholder="Original Config"
          value={textA}
          onChange={(e) => setTextA(e.target.value)}
        />
        <textarea 
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono resize-none focus:outline-none focus:border-amber-500/50 text-slate-300 scrollbar-hide leading-relaxed"
          placeholder="New Config"
          value={textB}
          onChange={(e) => setTextB(e.target.value)}
        />
      </div>
      <div className="flex-1 bg-black/40 border border-slate-800 rounded-lg overflow-y-auto p-3 font-mono text-xs">
         {(!textA && !textB) ? (
            <div className="text-slate-600 text-center mt-8">Paste text above to compare</div>
         ) : (
            getDiff().map((line, i) => (
              <div key={i} className={`${line.type === 'add' ? 'bg-green-500/10 text-green-400' : line.type === 'del' ? 'bg-red-500/10 text-red-400' : 'text-slate-500'} px-2 py-0.5 whitespace-pre-wrap break-all rounded-sm`}>
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.text}
              </div>
            ))
         )}
      </div>
    </div>
  );
};

const RegexBuilder = () => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<RegexResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    const data = await generateRegex(input);
    setResult(data);
    setLoading(false);
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopyState(type);
    setTimeout(() => setCopyState(null), 2000);
  };

  return (
    <div className="flex flex-col h-full gap-5">
      <div>
        <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-2 block tracking-wide">Describe Filter Logic</label>
        <div className="flex gap-2">
           <input 
             type="text" 
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
             className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all shadow-inner"
             placeholder="e.g. 'show errors but ignore admin down lines'"
           />
           <button
             onClick={handleGenerate}
             disabled={loading || !input.trim()}
             className="bg-slate-800 hover:bg-slate-700 text-violet-400 border border-slate-700 rounded-lg px-4 transition-all disabled:opacity-50"
           >
             {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {result ? (
          <>
            <div className="text-[10px] text-slate-500 font-mono italic text-center mb-2">
               Logic: {result.explanation}
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-lg overflow-hidden group">
               <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Cisco IOS (Include/Exclude)</span>
                  <button onClick={() => copyToClipboard(result.cisco, 'cisco')} className="text-slate-500 hover:text-cyan-400">
                     {copyState === 'cisco' ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
               </div>
               <div className="p-3 font-mono text-xs text-slate-300 break-all">{result.cisco}</div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-lg overflow-hidden group">
               <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Juniper (Match/Except)</span>
                  <button onClick={() => copyToClipboard(result.juniper, 'juniper')} className="text-slate-500 hover:text-violet-400">
                     {copyState === 'juniper' ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
               </div>
               <div className="p-3 font-mono text-xs text-slate-300 break-all">{result.juniper}</div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-lg overflow-hidden group">
               <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Linux Grep</span>
                  <button onClick={() => copyToClipboard(result.grep, 'grep')} className="text-slate-500 hover:text-amber-400">
                     {copyState === 'grep' ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
               </div>
               <div className="p-3 font-mono text-xs text-slate-300 break-all">{result.grep}</div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-60">
             <Search size={32} className="mb-2" />
             <p className="text-xs">Enter a filter description to generate regex</p>
          </div>
        )}
      </div>
    </div>
  );
};

const OpticalCalculator = () => {
  const [wavelength, setWavelength] = useState<'1310' | '1550' | '850'>('1310');
  const [txPower, setTxPower] = useState(-5);
  const [rxSens, setRxSens] = useState(-20);
  const [distance, setDistance] = useState(10);
  const [attenuation, setAttenuation] = useState(0.35);
  const [connectorCount, setConnectorCount] = useState(2);
  const [spliceCount, setSpliceCount] = useState(2);
  const [safetyMargin, setSafetyMargin] = useState(3);

  useEffect(() => {
    // Update default attenuation when wavelength changes
    if (wavelength === '1310') setAttenuation(0.35);
    if (wavelength === '1550') setAttenuation(0.25);
    if (wavelength === '850') setAttenuation(3.0);
  }, [wavelength]);

  // Calculations
  const fiberLoss = distance * attenuation;
  const passiveLoss = (connectorCount * 0.5) + (spliceCount * 0.1);
  const totalLinkLoss = fiberLoss + passiveLoss;
  const estimatedRxPower = txPower - totalLinkLoss;
  const powerBudget = txPower - rxSens;
  const margin = estimatedRxPower - rxSens - safetyMargin;
  const isPass = margin >= 0;

  return (
    <div className="flex flex-col h-full gap-5 overflow-y-auto scrollbar-hide pr-1">
      {/* Configuration Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Wavelength</label>
          <select 
            value={wavelength}
            onChange={(e) => setWavelength(e.target.value as any)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="1310">1310 nm (SMF)</option>
            <option value="1550">1550 nm (SMF)</option>
            <option value="850">850 nm (MMF)</option>
          </select>
        </div>
        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Distance (km)</label>
           <input type="number" value={distance} onChange={(e) => setDistance(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>
        
        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Tx Power (dBm)</label>
           <input type="number" step="0.1" value={txPower} onChange={(e) => setTxPower(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>
        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Rx Sensitivity (dBm)</label>
           <input type="number" step="0.1" value={rxSens} onChange={(e) => setRxSens(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>

        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Connectors (0.5dB ea)</label>
           <input type="number" value={connectorCount} onChange={(e) => setConnectorCount(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>
        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Splices (0.1dB ea)</label>
           <input type="number" value={spliceCount} onChange={(e) => setSpliceCount(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>
        
        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Loss (dB/km)</label>
           <input type="number" step="0.01" value={attenuation} onChange={(e) => setAttenuation(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>
        <div>
           <label className="text-xs font-bold text-slate-400 font-mono uppercase mb-1 block">Safety Margin (dB)</label>
           <input type="number" step="0.5" value={safetyMargin} onChange={(e) => setSafetyMargin(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
        </div>
      </div>

      {/* Results */}
      <div className={`p-4 rounded-lg border ${isPass ? 'bg-emerald-950/20 border-emerald-500/50' : 'bg-red-950/20 border-red-500/50'} transition-colors`}>
         <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
                <Zap size={18} className={isPass ? "text-emerald-400" : "text-red-400"} />
                <span className={`text-sm font-bold tracking-wider ${isPass ? "text-emerald-400" : "text-red-400"}`}>
                   LINK STATUS: {isPass ? 'PASS' : 'FAIL'}
                </span>
             </div>
             <span className="text-xs font-mono text-slate-500">
                MARGIN: {margin > 0 ? '+' : ''}{margin.toFixed(2)} dB
             </span>
         </div>
         
         <div className="grid grid-cols-2 gap-3">
             <InfoBox label="Estimated Rx Power" value={`${estimatedRxPower.toFixed(2)} dBm`} color={isPass ? "text-white" : "text-red-300"} />
             <InfoBox label="Total Link Loss" value={`${totalLinkLoss.toFixed(2)} dB`} />
             <InfoBox label="Fiber Loss Only" value={`${fiberLoss.toFixed(2)} dB`} color="text-slate-400" />
             <InfoBox label="Max Allowable Loss" value={`${(powerBudget - safetyMargin).toFixed(2)} dB`} color="text-amber-400" />
         </div>
      </div>
    </div>
  );
};

interface ScratchpadProps {
    notes?: string;
    onNotesChange?: (val: string) => void;
}

const Scratchpad: React.FC<ScratchpadProps> = ({ notes = '', onNotesChange }) => {
  // Use a local state for input to allow smooth typing, but sync with props
  const [internalNotes, setInternalNotes] = useState(notes);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Update internal state when external prop changes (e.g. AI updates it)
  useEffect(() => {
    setInternalNotes(notes);
  }, [notes]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setInternalNotes(newVal);
    setSaveStatus('saving');
    
    // Propagate change
    if (onNotesChange) {
        onNotesChange(newVal);
        // Simple visual feedback timeout
        setTimeout(() => setSaveStatus('saved'), 800);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
       <div className={`absolute top-3 right-4 text-[10px] font-mono font-bold tracking-wider transition-colors duration-300 ${saveStatus === 'saving' ? 'text-amber-400' : 'text-slate-600'}`}>
          {saveStatus === 'saving' ? 'SAVING...' : 'AUTOSAVED'}
       </div>
       <textarea
          className="flex-1 bg-slate-950/30 border border-slate-800/50 rounded-lg p-4 pt-8 text-sm font-mono text-emerald-200/90 resize-none focus:outline-none focus:border-emerald-500/30 placeholder-slate-700 leading-7"
          placeholder="// Scratchpad for logs, MACs, or thoughts..."
          value={internalNotes}
          onChange={handleChange}
          spellCheck={false}
       />
    </div>
  );
};

export default NetworkTools;