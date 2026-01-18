import React, { useState, useEffect } from 'react';
import { COMMAND_LIBRARY } from '../constants';
import { CommandRef } from '../types';
import { Search, X, Terminal, Copy, Star, Play, HelpCircle, LayoutGrid, List, Check, Loader2, Filter } from 'lucide-react';

interface Props {
  onClose: () => void;
  onExplainCommand: (cmd: string, context: string) => void;
  onSimulateCommand: (cmd: string, context: string) => void;
}

const CommandLibraryModal: React.FC<Props> = ({ onClose, onExplainCommand, onSimulateCommand }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  
  const [customCommands, setCustomCommands] = useState<CommandRef[]>(() => {
    const saved = localStorage.getItem('eqnoc_custom_commands');
    return saved ? JSON.parse(saved) : [];
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('eqnoc_cmd_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Sync with other tabs/components
  useEffect(() => {
    const channel = new BroadcastChannel('eqnoc_commands_sync');
    channel.onmessage = (event) => {
      if (event.data === 'UPDATE_COMMANDS') {
        const savedCmds = localStorage.getItem('eqnoc_custom_commands');
        if (savedCmds) setCustomCommands(JSON.parse(savedCmds));
        
        const savedFavs = localStorage.getItem('eqnoc_cmd_favorites');
        if (savedFavs) setFavorites(JSON.parse(savedFavs));
      }
    };
    return () => channel.close();
  }, []);

  const toggleFavorite = (title: string) => {
    const newFavs = favorites.includes(title) 
        ? favorites.filter(t => t !== title)
        : [...favorites, title];
    setFavorites(newFavs);
    localStorage.setItem('eqnoc_cmd_favorites', JSON.stringify(newFavs));
    
    // Broadcast change so CommandPanel updates too
    const channel = new BroadcastChannel('eqnoc_commands_sync');
    channel.postMessage('UPDATE_COMMANDS'); // Reusing this message for favs too as simplistic sync
    channel.close();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const categories = ['ALL', 'phys', 'l2', 'l3', 'ospf', 'bgp', 'mpls', 'logs', 'sec'];
  const allCommands = [...customCommands, ...COMMAND_LIBRARY];

  const filteredCommands = allCommands.filter(cmd => {
    const matchesSearch = 
      cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.cisco.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cmd.juniper && cmd.juniper.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = activeCategory === 'ALL' 
      ? true 
      : cmd.category?.includes(activeCategory);

    return matchesSearch && matchesCategory;
  });

  // Sort: Favorites first, then alphabetical
  const sortedCommands = filteredCommands.sort((a, b) => {
    const aFav = favorites.includes(a.title);
    const bFav = favorites.includes(b.title);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-7xl bg-slate-950/60 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-2xl flex flex-col h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/30 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-950/30 rounded-lg border border-cyan-500/30">
                <Terminal size={24} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-display font-bold text-white tracking-wide">COMMAND LIBRARY</h2>
                <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
                  <span>{allCommands.length} TOTAL</span>
                  <span className="text-slate-600">•</span>
                  <span>{customCommands.length} CUSTOM</span>
                </p>
              </div>
            </div>
            
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-96 group">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Search commands, syntax, or keywords..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                autoFocus
              />
            </div>

            {/* Filters & View Toggle */}
            <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto scrollbar-hide pb-1 md:pb-0">
               <div className="flex items-center bg-slate-950/50 rounded-lg p-1 border border-slate-800">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
                        ${activeCategory === cat ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}
                      `}
                    >
                      {cat}
                    </button>
                  ))}
               </div>
               
               <div className="hidden md:flex items-center bg-slate-950/50 rounded-lg p-1 border border-slate-800">
                  <button 
                    onClick={() => setViewMode('GRID')}
                    className={`p-1.5 rounded transition-all ${viewMode === 'GRID' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button 
                    onClick={() => setViewMode('LIST')}
                    className={`p-1.5 rounded transition-all ${viewMode === 'LIST' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <List size={16} />
                  </button>
               </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/30">
          {sortedCommands.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <Filter size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-bold">No commands found</p>
              <p className="text-sm">Try adjusting your search filters</p>
            </div>
          ) : (
            <div className={`
              ${viewMode === 'GRID' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' 
                : 'flex flex-col gap-3'
              }
            `}>
              {sortedCommands.map((cmd, idx) => {
                const isFav = favorites.includes(cmd.title);
                return (
                  <div 
                    key={idx} 
                    className={`
                      group bg-slate-900/40 border border-slate-800 rounded-xl p-4 hover:border-cyan-500/30 hover:bg-slate-900/60 transition-all hover:shadow-lg backdrop-blur-sm
                      ${viewMode === 'LIST' ? 'flex items-center gap-6' : 'flex flex-col'}
                    `}
                  >
                    {/* Header Part */}
                    <div className={`flex justify-between items-start ${viewMode === 'LIST' ? 'w-1/4 shrink-0' : 'mb-3'}`}>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <button onClick={() => toggleFavorite(cmd.title)} className={`transition-colors ${isFav ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}>
                            <Star size={16} fill={isFav ? "currentColor" : "none"} />
                          </button>
                          <h3 className="font-bold text-slate-200 group-hover:text-cyan-400 transition-colors line-clamp-1" title={cmd.title}>{cmd.title}</h3>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{cmd.desc}</p>
                      </div>
                    </div>

                    {/* Commands Part */}
                    <div className={`flex-1 space-y-2 ${viewMode === 'LIST' ? 'grid grid-cols-2 gap-4 space-y-0' : ''}`}>
                      {/* Cisco */}
                      <div className="relative group/cmd">
                         <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono uppercase mb-1 px-1">
                            <span>Cisco</span>
                            <div className="flex items-center gap-2 opacity-0 group-hover/cmd:opacity-100 transition-opacity">
                               <button onClick={() => onSimulateCommand(cmd.cisco, 'Cisco')} title="Simulate"><Play size={12} className="hover:text-cyan-400" /></button>
                               <button onClick={() => onExplainCommand(cmd.cisco, 'Cisco')} title="Explain"><HelpCircle size={12} className="hover:text-cyan-400" /></button>
                               <button onClick={() => handleCopy(cmd.cisco)} title="Copy">
                                 {copiedCmd === cmd.cisco ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="hover:text-white" />}
                               </button>
                            </div>
                         </div>
                         <code className="block w-full bg-black/40 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-cyan-100 truncate">
                            {cmd.cisco}
                         </code>
                      </div>

                      {/* Juniper */}
                      {cmd.juniper && (
                        <div className="relative group/cmd">
                           <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono uppercase mb-1 px-1">
                              <span>Juniper</span>
                              <div className="flex items-center gap-2 opacity-0 group-hover/cmd:opacity-100 transition-opacity">
                                 <button onClick={() => onSimulateCommand(cmd.juniper, 'Juniper')} title="Simulate"><Play size={12} className="hover:text-violet-400" /></button>
                                 <button onClick={() => onExplainCommand(cmd.juniper, 'Juniper')} title="Explain"><HelpCircle size={12} className="hover:text-violet-400" /></button>
                                 <button onClick={() => handleCopy(cmd.juniper)} title="Copy">
                                   {copiedCmd === cmd.juniper ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="hover:text-white" />}
                                 </button>
                              </div>
                           </div>
                           <code className="block w-full bg-black/40 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-violet-100 truncate">
                              {cmd.juniper}
                           </code>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase">
           <span>EQNOC COMMAND DATABASE v2.1</span>
           <span>Press ESC to close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandLibraryModal;