import React, { useState, useRef, useEffect } from 'react';
import { generateCommunication } from '../services/gemini';
import { Mail, Loader2, Copy, Check, MessageSquare, Send, Plus, X, Trash2, ArrowLeft, Edit2 } from 'lucide-react';

const CommCenter: React.FC = () => {
  const [points, setPoints] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [type, setType] = useState('Shift Handover');
  const [output, setOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'INPUT' | 'OUTPUT'>('INPUT');
  
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const commTypes = [
    'Shift Handover'
  ];

  const handleAddPoint = () => {
    if (!inputValue.trim()) return;
    setPoints([...points, inputValue.trim()]);
    setInputValue('');
    // Keep focus
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleRemovePoint = (index: number) => {
    setPoints(points.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddPoint();
    }
  };

  const handleGenerate = async () => {
    if (points.length === 0) return;
    setIsLoading(true);
    
    // Construct context from points
    const context = points.map(p => `- ${p}`).join('\n');
    
    const result = await generateCommunication(type, context);
    setOutput(result);
    setView('OUTPUT');
    setIsLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleEdit = () => {
      setView('INPUT');
  };

  const handleClear = () => {
      setPoints([]);
      setInputValue('');
      setOutput('');
      setView('INPUT');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md shrink-0">
        <div className="flex items-center justify-between mb-3">
             <label className="text-xs font-bold text-slate-400 block uppercase tracking-wide flex items-center gap-2">
                <Mail size={14} className="text-violet-400" />
                Comm Center (Draft Assistant)
            </label>
            {view === 'OUTPUT' && (
                <button 
                    onClick={handleEdit}
                    className="text-[10px] flex items-center gap-1 text-slate-500 hover:text-violet-400 transition-colors"
                >
                    <ArrowLeft size={10} /> BACK TO EDIT
                </button>
            )}
        </div>
        
        {/* Type Selection */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {commTypes.map(t => (
                <button
                    key={t}
                    onClick={() => setType(t)}
                    disabled={view === 'OUTPUT'}
                    className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all whitespace-nowrap
                        ${type === t 
                            ? 'bg-violet-500/10 text-violet-400 border-violet-500/50' 
                            : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300 disabled:opacity-50'}`}
                >
                    {t}
                </button>
            ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative bg-slate-950/30 flex flex-col">
        
        {/* INPUT VIEW */}
        {view === 'INPUT' && (
            <div className="flex flex-col h-full p-5 animate-in fade-in slide-in-from-left-4 duration-300">
                {/* Input Area */}
                <div className="flex gap-3 mb-6 shrink-0">
                    <div className="relative flex-1">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={`Add context for ${type} (Press Enter to add)...`}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:border-violet-500/50 focus:outline-none placeholder-slate-600 transition-all shadow-inner resize-none h-20 leading-relaxed scrollbar-hide"
                        />
                        <div className="absolute bottom-2 right-2 text-[10px] text-slate-600 font-mono">
                           ENTER ↵
                        </div>
                    </div>
                    <button
                        onClick={handleAddPoint}
                        disabled={!inputValue.trim()}
                        className="bg-slate-800 hover:bg-slate-700 text-violet-400 border border-slate-700 rounded-lg px-4 transition-all disabled:opacity-50 disabled:hover:bg-slate-800 flex items-center justify-center h-20 w-16"
                        title="Add Item"
                    >
                        <Plus size={24} />
                    </button>
                </div>

                {/* List Area */}
                <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 mb-4 space-y-2">
                    {points.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50 border-2 border-dashed border-slate-800/50 rounded-lg">
                            <MessageSquare size={32} className="mb-2" />
                            <p className="text-xs font-bold">NO CONTEXT ADDED</p>
                            <p className="text-[10px]">Add bullet points to generate draft</p>
                        </div>
                    ) : (
                        points.map((point, idx) => (
                            <div key={idx} className="group flex items-start gap-3 bg-slate-900/50 border border-slate-800/50 rounded-lg p-3 hover:border-violet-500/30 transition-colors animate-in slide-in-from-bottom-2 fade-in duration-300">
                                <span className="text-violet-500 mt-1 text-[10px] font-bold">{(idx + 1).toString().padStart(2, '0')}</span>
                                <p className="flex-1 text-sm text-slate-300 leading-relaxed">{point}</p>
                                <button 
                                    onClick={() => handleRemovePoint(idx)}
                                    className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 shrink-0 pt-4 border-t border-slate-800/50">
                     {points.length > 0 && (
                        <button 
                            onClick={handleClear}
                            className="px-4 py-3 rounded-lg border border-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors text-xs font-bold"
                        >
                            CLEAR
                        </button>
                     )}
                     <button
                        onClick={handleGenerate}
                        disabled={isLoading || points.length === 0}
                        className="flex-1 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 border border-violet-500/50 rounded-lg py-3 text-sm font-bold tracking-wide uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]"
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        {isLoading ? 'Drafting...' : 'Generate Communication'}
                    </button>
                </div>
            </div>
        )}

        {/* OUTPUT VIEW */}
        {view === 'OUTPUT' && (
            <div className="flex flex-col h-full p-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-violet-400 uppercase tracking-wider bg-violet-950/20 px-2 py-1 rounded border border-violet-900/50">
                        AI GENERATED DRAFT
                    </span>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors text-xs font-bold"
                    >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        {copied ? 'COPIED' : 'COPY TEXT'}
                    </button>
                </div>
                
                <textarea
                    className="flex-1 bg-black/30 border border-slate-800 rounded-lg p-6 text-sm text-slate-200 leading-relaxed resize-none focus:outline-none focus:border-violet-500/30 font-sans"
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                />
                
                <div className="mt-4 flex justify-end shrink-0">
                     <button
                        onClick={handleEdit}
                        className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-300 px-4 py-2"
                    >
                        <Edit2 size={12} />
                        EDIT CONTEXT POINTS
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default CommCenter;