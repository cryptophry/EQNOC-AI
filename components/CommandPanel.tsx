import React, { useState, useEffect } from 'react';
import { COMMAND_LIBRARY, DIAGNOSTIC_MODULES } from '../constants';
import { Copy, Terminal, Filter, Search, X, Info, HelpCircle, Play, Loader2, Check, Star, Plus, Cloud, Database, Trash2, Wifi, Layers } from 'lucide-react';
import { CommandRef } from '../types';
import { generateCommandDetails } from '../services/ai';

interface Props {
  activeModuleId: string | null;
  onExplainCommand: (cmd: string, context: string) => void;
  onSimulateCommand: (cmd: string, context: string) => void;
  isProcessing: boolean;
  onCategoryChange?: (id: string | null) => void;
}

const CommandPanel: React.FC<Props> = ({ activeModuleId, onExplainCommand, onSimulateCommand, isProcessing, onCategoryChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [simulatingCmd, setSimulatingCmd] = useState<string | null>(null);
  const [finishedCmd, setFinishedCmd] = useState<string | null>(null);
  
  // Custom Commands State
  const [customCommands, setCustomCommands] = useState<CommandRef[]>(() => {
    const saved = localStorage.getItem('eqnoc_custom_commands');
    return saved ? JSON.parse(saved) : [];
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [isGeneratingCommand, setIsGeneratingCommand] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Favorites State
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('eqnoc_cmd_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  // Cross-tab synchronization
  useEffect(() => {
    const channel = new BroadcastChannel('eqnoc_commands_sync');
    
    channel.onmessage = (event) => {
      if (event.data === 'UPDATE_COMMANDS') {
        const savedCustom = localStorage.getItem('eqnoc_custom_commands');
        if (savedCustom) {
          setCustomCommands(JSON.parse(savedCustom));
        }
        
        const savedFavs = localStorage.getItem('eqnoc_cmd_favorites');
        if (savedFavs) {
          setFavorites(JSON.parse(savedFavs));
        }
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    if (!isProcessing && simulatingCmd) {
        setFinishedCmd(simulatingCmd);
        setSimulatingCmd(null);
        const timer = setTimeout(() => {
            setFinishedCmd(null);
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [isProcessing, simulatingCmd]);

  const toggleFavorite = (title: string) => {
    const newFavs = favorites.includes(title) 
        ? favorites.filter(t => t !== title)
        : [...favorites, title];
    setFavorites(newFavs);
    localStorage.setItem('eqnoc_cmd_favorites', JSON.stringify(newFavs));
    
    // Broadcast change so CommandLibraryModal updates too
    const channel = new BroadcastChannel('eqnoc_commands_sync');
    channel.postMessage('UPDATE_COMMANDS');
    channel.close();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSimulateClick = (cmd: string, context: string) => {
      setSimulatingCmd(cmd);
      onSimulateCommand(cmd, context);
  };

  const handleAddCommand = async () => {
    if (!addInput.trim()) return;
    setIsGeneratingCommand(true);
    
    const newCmd = await generateCommandDetails(addInput);
    
    if (newCmd) {
        setIsSyncing(true);
        // Simulate network latency for "Cloud Sync" feel
        await new Promise(resolve => setTimeout(resolve, 800));

        const updatedCustom = [newCmd, ...customCommands];
        setCustomCommands(updatedCustom);
        localStorage.setItem('eqnoc_custom_commands', JSON.stringify(updatedCustom));
        
        // Broadcast to other tabs/users on same machine
        const channel = new BroadcastChannel('eqnoc_commands_sync');
        channel.postMessage('UPDATE_COMMANDS');
        channel.close();

        setAddInput('');
        setIsAdding(false);
        setIsSyncing(false);
    }
    
    setIsGeneratingCommand(false);
  };

  const handleDeleteCommand = (e: React.MouseEvent, title: string) => {
      e.stopPropagation(); // Prevent card expansion if applicable
      const updatedCustom = customCommands.filter(c => c.title !== title);
      setCustomCommands(updatedCustom);
      localStorage.setItem('eqnoc_custom_commands', JSON.stringify(updatedCustom));
      
      const channel = new BroadcastChannel('eqnoc_commands_sync');
      channel.postMessage('UPDATE_COMMANDS');
      channel.close();

      // Also remove from favorites if present
      if (favorites.includes(title)) {
          toggleFavorite(title);
      }
  };

  // Merge static and custom commands
  const allCommands = [...customCommands, ...COMMAND_LIBRARY];

  const filteredCommands = allCommands.filter(cmd => {
    const matchesModule = activeModuleId ? cmd.category?.includes(activeModuleId) : true;
    
    if (!searchQuery) return matchesModule;

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      cmd.title.toLowerCase().includes(query) ||
      cmd.desc.toLowerCase().includes(query) ||
      cmd.cisco.toLowerCase().includes(query) ||
      (cmd.juniper && cmd.juniper.toLowerCase().includes(query));
      
    return matchesModule && matchesSearch;
  });

  // Split into pinned and others
  const pinnedCommands = filteredCommands.filter(cmd => favorites.includes(cmd.title));
  const otherCommands = filteredCommands.filter(cmd => !favorites.includes(cmd.title));

  const highlightSyntax = (text: string) => {
    // Regex to capture variables <...> and common keywords
    const regex = /(<[^>]+>)|(\b(?:show|ip|ipv6|interface|bgp|mpls|vrf|ping|traceroute|summary|detail|extensive|log|messages|forwarding-table|l2circuit|connections|diagnostics|optics|transceiver|service|instance|stats|vc|l2transport|vpnv4|route|family)\b)/g;
    
    // Split and map
    const parts = text.split(regex);
    
    return parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('<') && part.endsWith('>')) {
             return <span key={i} className="text-amber-400 font-mono font-bold">{part}</span>;
        }
        if (['show', 'ip', 'ipv6', 'interface', 'bgp', 'mpls', 'vrf', 'ping', 'traceroute', 'summary', 'detail', 'extensive', 'log', 'messages', 'forwarding-table', 'l2circuit', 'connections', 'diagnostics', 'optics', 'transceiver', 'service', 'instance', 'stats', 'vc', 'l2transport', 'vpnv4', 'route', 'family'].includes(part)) {
             return <span key={i} className="text-cyan-400 font-bold font-mono">{part}</span>;
        }
        return <span key={i} className="text-slate-200 font-mono">{part}</span>;
    });
  };

  const renderCommandCard = (cmd: CommandRef, index: number) => {
    const isFav = favorites.includes(cmd.title);
    const isCustomCommand = customCommands.some(c => c.title === cmd.title);

    return (
        <div key={`${cmd.title}-${index}`} className="group border border-transparent hover:border-slate-800/50 rounded-xl p-2.5 -mx-1.5 transition-colors bg-slate-900/20 hover:bg-slate-900/50 mb-2 relative">
            <div className="flex items-center justify-between mb-2">
                {/* Tooltip Wrapper */}
                <div className="relative group/tooltip flex items-center gap-2 cursor-help min-w-0">
                    <button 
                        onClick={() => toggleFavorite(cmd.title)}
                        className={`transition-colors p-1 rounded-full hover:bg-slate-800 shrink-0 ${isFav ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
                    >
                        <Star size={14} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    <h3 className="text-sm font-semibold text-slate-200 group-hover/tooltip:text-cyan-400 transition-colors truncate">{cmd.title}</h3>
                    <Info size={14} className="text-slate-500 group-hover/tooltip:text-cyan-400 transition-colors shrink-0" />
                    
                    {/* Tooltip Content */}
                    <div className="absolute bottom-full left-0 mb-2 w-56 p-3 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                        {cmd.desc}
                        <div className="absolute top-full left-6 border-6 border-transparent border-t-slate-700"></div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                    {isCustomCommand && (
                         <button 
                            onClick={(e) => handleDeleteCommand(e, cmd.title)}
                            className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete Custom Command"
                         >
                            <Trash2 size={12} />
                         </button>
                    )}
                    <span className={`text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded border ${isCustomCommand ? 'bg-indigo-950/30 text-indigo-400 border-indigo-500/30' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>
                        {isCustomCommand ? 'CUSTOM' : cmd.juniper ? 'Multi-Vendor' : 'Cisco'}
                    </span>
                </div>
            </div>
            
            <div className="space-y-3">
                {/* Cisco Command */}
                <div className="relative group/code">
                    <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-t-lg px-3 py-1.5 border-b-0">
                            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">Cisco IOS-XR</span>
                            <div className="flex items-center gap-3 opacity-0 group-hover/code:opacity-100 transition-opacity">
                            <button 
                                onClick={() => handleSimulateClick(cmd.cisco, 'Cisco IOS-XR')}
                                disabled={isProcessing}
                                className={`transition-colors ${
                                    simulatingCmd === cmd.cisco ? 'text-cyan-400' :
                                    finishedCmd === cmd.cisco ? 'text-emerald-400' : 
                                    'text-slate-500 hover:text-emerald-400'
                                }`}
                                title={finishedCmd === cmd.cisco ? "Output Ready in Log" : "Simulate Output"}
                            >
                                {simulatingCmd === cmd.cisco ? <Loader2 size={14} className="animate-spin" /> : 
                                    finishedCmd === cmd.cisco ? <Check size={14} className="animate-in zoom-in duration-300" /> :
                                    <Play size={14} />}
                            </button>
                            <button 
                                onClick={() => onExplainCommand(cmd.cisco, 'Cisco IOS-XR')}
                                className="text-slate-500 hover:text-cyan-400 transition-colors"
                                title="Explain Command"
                            >
                                <HelpCircle size={14} />
                            </button>
                            <button 
                                onClick={() => copyToClipboard(cmd.cisco)}
                                className="text-slate-500 hover:text-white transition-colors"
                                title="Copy"
                            >
                                <Copy size={14} />
                            </button>
                            </div>
                    </div>
                    <code className={`block bg-black/40 border border-slate-800 rounded-b-lg px-3 py-2.5 text-xs font-mono truncate transition-colors duration-500 ${finishedCmd === cmd.cisco ? 'border-emerald-500/30 bg-emerald-950/10' : ''}`}>
                        {highlightSyntax(cmd.cisco)}
                    </code>
                </div>

                {/* Juniper Command */}
                {cmd.juniper && (
                    <div className="relative group/code">
                        <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-t-lg px-3 py-1.5 border-b-0">
                            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">Juniper Junos</span>
                            <div className="flex items-center gap-3 opacity-0 group-hover/code:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => handleSimulateClick(cmd.juniper, 'Juniper Junos')}
                                    disabled={isProcessing}
                                    className={`transition-colors ${
                                        simulatingCmd === cmd.juniper ? 'text-cyan-400' :
                                        finishedCmd === cmd.juniper ? 'text-emerald-400' : 
                                        'text-slate-500 hover:text-emerald-400'
                                    }`}
                                    title={finishedCmd === cmd.juniper ? "Output Ready in Log" : "Simulate Output"}
                                >
                                    {simulatingCmd === cmd.juniper ? <Loader2 size={14} className="animate-spin" /> : 
                                        finishedCmd === cmd.juniper ? <Check size={14} className="animate-in zoom-in duration-300" /> :
                                        <Play size={14} />}
                                </button>
                                <button 
                                    onClick={() => onExplainCommand(cmd.juniper, 'Juniper Junos')}
                                    className="text-slate-500 hover:text-cyan-400 transition-colors"
                                    title="Explain Command"
                                >
                                    <HelpCircle size={14} />
                                </button>
                                <button 
                                    onClick={() => copyToClipboard(cmd.juniper)}
                                    className="text-slate-500 hover:text-white transition-colors"
                                    title="Copy"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>
                        <code className={`block bg-black/40 border border-slate-800 rounded-b-lg px-3 py-2.5 text-xs font-mono truncate transition-colors duration-500 ${finishedCmd === cmd.juniper ? 'border-emerald-500/30 bg-emerald-950/10' : ''}`}>
                            {highlightSyntax(cmd.juniper)}
                        </code>
                    </div>
                )}
            </div>
        </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      <div className="flex flex-col border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="p-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Terminal size={16} className="text-cyan-400" />
                <span className="text-sm font-bold text-slate-200 tracking-wide">COMMAND LIBRARY</span>
            </div>
            <button 
                onClick={() => setIsAdding(!isAdding)} 
                className={`p-1 rounded transition-colors ${isAdding ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-cyan-400 hover:bg-slate-800'}`}
                title="Add New Command"
            >
                <Plus size={16} className={isAdding ? 'rotate-45 transition-transform' : 'transition-transform'} />
            </button>
        </div>
        
        {/* Category Filters - Now Wrapping */}
        {onCategoryChange && (
            <div className="flex flex-wrap gap-2 px-4 pb-3">
                <button
                    onClick={() => onCategoryChange(null)}
                    className={`px-2 py-1 text-[9px] font-bold uppercase rounded border transition-all whitespace-nowrap
                        ${!activeModuleId ? 'bg-cyan-500 text-white border-cyan-400' : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                >
                    ALL
                </button>
                {DIAGNOSTIC_MODULES.map(mod => (
                    <button
                        key={mod.id}
                        onClick={() => onCategoryChange(mod.id === activeModuleId ? null : mod.id)}
                        className={`px-2 py-1 text-[9px] font-bold uppercase rounded border transition-all whitespace-nowrap flex items-center gap-1
                            ${activeModuleId === mod.id ? 'bg-cyan-950 text-cyan-400 border-cyan-500/50' : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                    >
                        {mod.id === 'l2' ? 'L2' : mod.title.split(' ')[0]} {/* Shorten label */}
                    </button>
                ))}
            </div>
        )}
        
        {isAdding && (
          <div className="px-4 pb-3 animate-in slide-in-from-top-2 duration-200">
             <div className="bg-slate-950 border border-cyan-500/30 rounded-lg p-1.5 flex gap-2 shadow-lg shadow-cyan-900/10 relative overflow-hidden">
                {isSyncing && (
                    <div className="absolute inset-0 bg-slate-950/90 z-10 flex items-center justify-center gap-3 text-cyan-400">
                         <div className="relative">
                            <Cloud size={16} className="animate-pulse" />
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></div>
                         </div>
                         <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Broadcasting Update...</span>
                    </div>
                )}
                
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. 'Check OSPF neighbors' or 'show ip ospf neighbor'"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCommand()}
                  disabled={isGeneratingCommand || isSyncing}
                  className="flex-1 bg-transparent border-none text-xs text-white placeholder-slate-500 focus:outline-none px-2"
                />
                <button
                   onClick={handleAddCommand}
                   disabled={!addInput.trim() || isGeneratingCommand || isSyncing}
                   className="bg-cyan-950 text-cyan-400 hover:bg-cyan-900 border border-cyan-900 rounded px-3 py-1 text-[10px] font-bold uppercase disabled:opacity-50 transition-all flex items-center gap-2"
                >
                   {isGeneratingCommand ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                   {isGeneratingCommand ? 'Generating...' : 'Add'}
                </button>
             </div>
             <div className="flex justify-between items-center mt-1 px-1">
                <span className="text-[9px] text-slate-500 font-mono">Changes persist across session users</span>
                <span className="text-[9px] text-emerald-500/80 font-mono flex items-center gap-1"><Wifi size={8} /> LIVE SYNC ACTIVE</span>
             </div>
          </div>
        )}

        <div className="px-4 pb-4">
             <div className="relative group">
                <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${searchQuery ? 'text-cyan-400' : 'text-slate-500 group-focus-within:text-cyan-400'}`} />
                <input
                  type="text"
                  placeholder="Search commands..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-9 pr-9 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all shadow-inner"
                />
                 {searchQuery && (
                    <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                        <X size={14} />
                    </button>
                )}
             </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <Filter size={24} className="mb-2 opacity-30" />
                <span className="text-xs">No matching commands found</span>
            </div>
        ) : (
            <>
                {/* Favorites Section */}
                {pinnedCommands.length > 0 && (
                    <div className="mb-8 relative">
                         <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-900/20">
                            <Star size={14} className="text-amber-400 fill-amber-400" />
                            <span className="text-xs font-bold text-amber-500 tracking-wider">FAVORITES</span>
                        </div>
                        <div className="space-y-4">
                            {pinnedCommands.map((cmd, idx) => renderCommandCard(cmd, idx))}
                        </div>
                    </div>
                )}
                
                {/* All Commands */}
                {pinnedCommands.length > 0 && otherCommands.length > 0 && (
                     <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/50 mt-6">
                        <Terminal size={14} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-500 tracking-wider">LIBRARY</span>
                    </div>
                )}

                <div className="space-y-4">
                     {otherCommands.map((cmd, idx) => renderCommandCard(cmd, idx))}
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default CommandPanel;