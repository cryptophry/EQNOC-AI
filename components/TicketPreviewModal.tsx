import React, { useState, useEffect } from 'react';
import { generateTicketDraft, TicketDraft } from '../services/gemini';
import { Message } from '../types';
import { Ticket, Copy, Check, X, Send, Loader2, Server, AlertTriangle } from 'lucide-react';

interface Props {
  messages: Message[];
  onClose: () => void;
}

const TicketPreviewModal: React.FC<Props> = ({ messages, onClose }) => {
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const generate = async () => {
      const result = await generateTicketDraft(messages);
      setDraft(result);
      setIsLoading(false);
    };
    generate();
  }, [messages]);

  const handleCopy = () => {
    if (!draft) return;
    const text = `
SHORT DESCRIPTION: ${draft.shortDescription}
CONFIGURATION ITEM: ${draft.configurationItem}
IMPACT: ${draft.impact} | URGENCY: ${draft.urgency}

DESCRIPTION:
${draft.description}

WORK NOTES:
${draft.workNotes}
    `.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePush = () => {
    setIsSending(true);
    // Simulate API call to ServiceNow/Jira Webhook
    setTimeout(() => {
        setIsSending(false);
        setIsSent(true);
        setTimeout(onClose, 2000);
    }, 1500);
  };

  return (
    <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900/60 backdrop-blur-xl border border-teal-500/20 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 relative">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/30 flex justify-between items-center">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500/10 rounded-lg border border-teal-500/30">
                 <Ticket size={20} className="text-teal-400" />
              </div>
              <div>
                 <h2 className="text-lg font-bold text-white tracking-wide">TICKET INTEGRATION STUB</h2>
                 <p className="text-xs text-slate-500 font-mono">PUSH TO SERVICENOW / JIRA</p>
              </div>
           </div>
           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/30">
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <Loader2 size={48} className="text-teal-500 animate-spin" />
                    <div className="text-center">
                        <p className="text-sm font-bold text-white uppercase tracking-wide">Formatting Incident Data...</p>
                        <p className="text-xs text-slate-500 mt-1">Analyzing chat transcript for CI, Impact, and Timeline</p>
                    </div>
                </div>
            ) : draft ? (
                <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Short Description</label>
                            <input 
                                type="text" 
                                readOnly 
                                value={draft.shortDescription} 
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Server size={10} /> Configuration Item</label>
                            <input 
                                type="text" 
                                readOnly 
                                value={draft.configurationItem} 
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-teal-400 font-mono font-bold focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Impact</label>
                            <div className={`px-3 py-2 rounded text-xs font-bold border w-fit min-w-[100px] text-center
                                ${draft.impact === 'High' ? 'bg-red-950/30 border-red-500 text-red-400' : 
                                  draft.impact === 'Medium' ? 'bg-amber-950/30 border-amber-500 text-amber-400' : 
                                  'bg-emerald-950/30 border-emerald-500 text-emerald-400'}`}>
                                {draft.impact.toUpperCase()}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Urgency</label>
                            <div className={`px-3 py-2 rounded text-xs font-bold border w-fit min-w-[100px] text-center
                                ${draft.urgency === 'High' ? 'bg-red-950/30 border-red-500 text-red-400' : 
                                  draft.urgency === 'Medium' ? 'bg-amber-950/30 border-amber-500 text-amber-400' : 
                                  'bg-emerald-950/30 border-emerald-500 text-emerald-400'}`}>
                                {draft.urgency.toUpperCase()}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Detailed Description</label>
                        <textarea 
                            readOnly 
                            value={draft.description} 
                            className="w-full h-32 bg-slate-950 border border-slate-700 rounded p-3 text-xs text-slate-300 font-mono resize-none focus:outline-none leading-relaxed"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Work Notes (Technical)</label>
                        <textarea 
                            readOnly 
                            value={draft.workNotes} 
                            className="w-full h-32 bg-black/40 border border-slate-700 rounded p-3 text-xs text-teal-100/80 font-mono resize-none focus:outline-none leading-relaxed"
                        />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <AlertTriangle size={32} className="mb-2" />
                    <p>Failed to generate ticket draft.</p>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/30 flex gap-3">
            <button 
                onClick={handleCopy}
                disabled={isLoading || !draft || isSent}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg py-3 flex items-center justify-center gap-2 font-bold uppercase tracking-wide transition-all disabled:opacity-50"
            >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copied ? 'Copied to Clipboard' : 'Copy Text'}
            </button>
            <button 
                onClick={handlePush}
                disabled={isLoading || !draft || isSending || isSent}
                className={`flex-1 rounded-lg py-3 flex items-center justify-center gap-2 font-bold uppercase tracking-wide transition-all disabled:opacity-50
                    ${isSent 
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/50' 
                        : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/20'}`}
            >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : isSent ? <Check size={16} /> : <Send size={16} />}
                {isSending ? 'Pushing...' : isSent ? 'Ticket Created' : 'Push to Ticket'}
            </button>
        </div>

      </div>
    </div>
  );
};

export default TicketPreviewModal;