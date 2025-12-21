import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChatSession, generateRFO, OutageRecord, findRelevantHistory, embedText } from './services/gemini';
import { Message, MessageRole, TriageMode, TriageStatus, FlowNode, Session, WarRoomEvent } from './types';
import { Mic, Send, Bot, User, Power, Activity, Wifi, LayoutDashboard, BrainCircuit, GitBranch, ZapOff, FileText, Loader2, ScanSearch, Clock, History, Siren, ShieldAlert, Paperclip, Image as ImageIcon, X, Database, ClipboardList, Layers, Lightbulb } from 'lucide-react';
import CommandPanel from './components/CommandPanel';
import MessageContent from './components/MessageContent';
import NetworkTools from './components/NetworkTools';
import DiagnosticGrid from './components/DiagnosticGrid';
import FaultAssistant from './components/FaultAssistant';
import OutageTracker from './components/OutageTracker';
import LogAnalyzer from './components/LogAnalyzer';
import ShiftHandoverDashboard from './components/ShiftHandoverDashboard';
import SessionHistory from './components/SessionHistory';
import WarRoomTimeline from './components/WarRoomTimeline';
import KnowledgeBaseModal from './components/KnowledgeBaseModal';
import LoginScreen from './components/LoginScreen';
import PacketWalkVisualizer from './components/PacketWalkVisualizer';
import { useLiveApi } from './hooks/useLiveApi';
import { GenerateContentResponse } from '@google/genai';

const App: React.FC = () => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [mode, setMode] = useState<TriageMode>('TEXT');
  const [triageStatus, setTriageStatus] = useState<TriageStatus>('pending');
  const [leftPanelMode, setLeftPanelMode] = useState<'DASHBOARD' | 'FAULT_ASSIST' | 'OUTAGES' | 'LOGS' | 'HANDOVER' | 'PACKET_WALK'>('DASHBOARD');
  
  // Resizable Panel State
  const [leftPanelWidth, setLeftPanelWidth] = useState(55); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  
  // State for active diagnostic module (filtering commands)
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  // Persistent State for Tools
  const [persistentLogs, setPersistentLogs] = useState('');
  const [faultAssistantState, setFaultAssistantState] = useState<{input: string, tree: FlowNode | null}>({
    input: '',
    tree: null
  });
  const [outageState, setOutageState] = useState<{outages: OutageRecord[], lastUpdated: Date | null}>({
    outages: [],
    lastUpdated: null
  });
  const [shiftState, setShiftState] = useState<{
    report: string;
    reportTitle: string;
    activeCardId: string | null;
    smartCache: Record<string, any>;
  }>({
    report: '',
    reportTitle: 'GENERATED REPORT',
    activeCardId: null,
    smartCache: {}
  });

  // Session Management
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Date.now().toString());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // RAG State
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [ragContext, setRagContext] = useState<boolean>(false); // Visual indicator

  // Knowledge Base State
  const [isKbOpen, setIsKbOpen] = useState(false);
  const [customKb, setCustomKb] = useState(() => localStorage.getItem('eqnoc_kb') || '');

  // War Room State
  const [isWarRoomMode, setIsWarRoomMode] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<WarRoomEvent[]>([]);

  // Attachments
  const [attachment, setAttachment] = useState<{ base64: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: MessageRole.SYSTEM,
      text: "EQNOC Assistant ready.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingRFO, setIsGeneratingRFO] = useState(false);
  
  const chatSession = useRef<any>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('eqnoc_sessions');
    if (saved) {
      try {
        const parsed: Session[] = JSON.parse(saved);
        // Revive dates in messages
        const revived = parsed.map(s => ({
          ...s,
          messages: s.messages.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(revived);
      } catch (e) {
        console.error("Failed to load sessions", e);
      }
    }
  }, []);

  // Save Session logic
  const saveCurrentSession = useCallback(async (msgs: Message[]) => {
      if (msgs.length <= 1 && msgs[0]?.id === 'init') return;

      const firstUserMsg = msgs.slice().reverse().find(m => m.role === MessageRole.USER);
      const title = firstUserMsg 
        ? (firstUserMsg.text.length > 40 ? firstUserMsg.text.slice(0, 40) + '...' : firstUserMsg.text)
        : 'New Triage Session';

      setSessions(prev => {
        const existingIdx = prev.findIndex(s => s.id === currentSessionId);
        const updatedSession: Session = {
          id: currentSessionId,
          title,
          timestamp: Date.now(),
          messages: msgs,
          // Preserve existing embedding if just updated text, will regen later if needed
          embedding: existingIdx >= 0 ? prev[existingIdx].embedding : undefined
        };

        let newSessions;
        if (existingIdx >= 0) {
            newSessions = [...prev];
            newSessions[existingIdx] = updatedSession;
        } else {
            newSessions = [updatedSession, ...prev];
        }
        localStorage.setItem('eqnoc_sessions', JSON.stringify(newSessions));
        return newSessions;
      });
  }, [currentSessionId]);

  // Generate embedding for session after it settles (e.g., after AI response)
  const generateSessionEmbedding = async (msgs: Message[]) => {
      // Only embed if substantial content (e.g. at least 1 Q&A pair)
      if (msgs.length < 3) return;

      // Create a summary text to embed
      const summaryText = msgs
          .filter(m => m.role !== 'system')
          .map(m => `${m.role.toUpperCase()}: ${m.text}`)
          .join('\n')
          .substring(0, 8000); // stay within limits

      const embedding = await embedText(summaryText);
      if (embedding) {
          setSessions(prev => {
              const idx = prev.findIndex(s => s.id === currentSessionId);
              if (idx === -1) return prev;
              
              const updated = [...prev];
              updated[idx] = { ...updated[idx], embedding };
              localStorage.setItem('eqnoc_sessions', JSON.stringify(updated));
              return updated;
          });
      }
  };

  // Resize Handlers
  const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);
  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      const newWidth = (mouseMoveEvent.clientX / window.innerWidth) * 100;
      // Constrain width between 25% and 75%
      if (newWidth > 25 && newWidth < 75) {
        setLeftPanelWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);


  const scrollToTop = () => {
    if (chatContainerRef.current) {
        if (chatContainerRef.current.scrollTop < 50) {
           requestAnimationFrame(() => {
            if (chatContainerRef.current) {
               chatContainerRef.current.scrollTop = 0;
            }
          });
        }
    }
  };

  const { isConnected, isSpeaking, volume, connect, disconnect } = useLiveApi({
    onTranscription: (text, type) => {
      setMessages(prev => [{
        id: Date.now().toString(),
        role: MessageRole.USER,
        text: text,
        timestamp: new Date()
      }, ...prev]);
      
      // Add to timeline in War Room
      if (isWarRoomMode && type === 'user') {
          addTimelineEvent('USER', `Voice Command: ${text}`);
      }
      
      scrollToTop();
      if (triageStatus === 'pending') setTriageStatus('active');
    }
  });

  useEffect(() => {
    try {
      // Init chat with customKB if present
      chatSession.current = createChatSession(customKb);
    } catch (e) {
      console.error("Failed to init chat", e);
    }
  }, []);

  const handleSaveKb = (content: string) => {
    setCustomKb(content);
    localStorage.setItem('eqnoc_kb', content);
    setIsKbOpen(false);
    
    // Re-initialize session with new context
    // We preserve current history manually by recreating the session and passing history
    const history = messages
        .filter(m => m.role !== MessageRole.SYSTEM)
        .map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));
        
    chatSession.current = createChatSession(content, history);
    
    // Add system note
    setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: MessageRole.SYSTEM,
        text: "Knowledge Base Updated. Context reloaded.",
        timestamp: new Date()
    }]);
  };

  const addTimelineEvent = (type: WarRoomEvent['type'], message: string) => {
     setTimelineEvents(prev => [...prev, {
        id: Date.now().toString(),
        timestamp: Date.now(),
        type,
        message
     }]);
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        alert("Only image files are supported for optical recon.");
        return;
      }
      try {
        const base64 = await convertFileToBase64(file);
        setAttachment({ base64, type: file.type });
      } catch (err) {
        console.error("File upload failed", err);
      }
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || isLoading) return;
    if (triageStatus === 'pending') setTriageStatus('active');

    // Capture attachment and clear it from state immediately
    const currentAttachment = attachment;
    setAttachment(null);
    setRagContext(false); // Reset RAG indicator

    const fullTextLog = currentAttachment ? `[Uploaded Image] ${text}` : text;
    if (isWarRoomMode) {
        addTimelineEvent('USER', fullTextLog);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      text: text,
      timestamp: new Date(),
      images: currentAttachment ? [currentAttachment.base64] : undefined
    };

    const newMessages = [userMsg, ...messages];
    setMessages(newMessages);
    saveCurrentSession(newMessages); // Auto-save

    setInput('');
    setIsLoading(true);
    
    requestAnimationFrame(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = 0;
    });

    try {
      // --- RAG RETRIEVAL ---
      let relevantHistory = '';
      if (!currentAttachment) { // Skip RAG for image-first queries to keep it simple
          setIsRetrieving(true);
          const historyText = await findRelevantHistory(text, sessions.filter(s => s.id !== currentSessionId));
          if (historyText) {
              relevantHistory = historyText;
              setRagContext(true);
          }
          setIsRetrieving(false);
      }

      let result;
      
      // Combine retrieved context with user query
      // We append it to the prompt invisibly to the user
      const finalPrompt = relevantHistory 
          ? `${relevantHistory}\n\nUser Query: ${text}`
          : text;

      if (currentAttachment) {
          // Send multimodal message
          const base64Data = currentAttachment.base64.split(',')[1];
          const parts = [
              { text: finalPrompt || "Analyze this image." },
              { inlineData: { mimeType: currentAttachment.type, data: base64Data } }
          ];
          result = await chatSession.current.sendMessageStream({ message: parts });
      } else {
          result = await chatSession.current.sendMessageStream({ message: finalPrompt });
      }
      
      const botMsgId = (Date.now() + 1).toString();
      const botMsg: Message = {
        id: botMsgId,
        role: MessageRole.MODEL,
        text: '',
        timestamp: new Date(),
        isStreaming: true
      };

      setMessages(prev => [botMsg, ...prev]); // Add placeholder
      
      let fullText = '';
      let groundingMetadata: any = null;

      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text || '';
        fullText += chunkText;
        
        if (c.candidates?.[0]?.groundingMetadata) {
            groundingMetadata = c.candidates[0].groundingMetadata;
        }

        setMessages(prev => prev.map(m => 
          m.id === botMsgId ? { ...m, text: fullText, groundingMetadata } : m
        ));
        scrollToTop();
      }
      
      // Final update
      const completedMessages = [{ ...botMsg, text: fullText, isStreaming: false, groundingMetadata }, userMsg, ...messages];
      setMessages(completedMessages);
      
      // Post-Processing: Save & Embed
      saveCurrentSession(completedMessages);
      generateSessionEmbedding(completedMessages); // Trigger "Learning"
      
      if (isWarRoomMode) {
          addTimelineEvent('AI', 'Assistant responded to query');
      }

    } catch (error) {
      console.error("Gemini API Error:", error);
      setMessages(prev => [{
        id: Date.now().toString(),
        role: MessageRole.SYSTEM,
        text: "System error: Failed to reach network intelligence. Please check API configuration.",
        timestamp: new Date()
      }, ...prev]);
      scrollToTop();
      setIsRetrieving(false);
      if (isWarRoomMode) addTimelineEvent('SYSTEM', 'API Error: Failed to generate response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    processMessage(input);
    setInput('');
  };

  const handleGenerateRFO = async () => {
    if (messages.length < 2) return;
    setIsGeneratingRFO(true);
    
    const context = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const rfo = await generateRFO(context);
    
    setMessages(prev => [{
        id: Date.now().toString(),
        role: MessageRole.MODEL,
        text: `**RFO GENERATED:**\n\n${rfo}`,
        timestamp: new Date()
    }, ...prev]);
    
    if (isWarRoomMode) addTimelineEvent('SYSTEM', 'RFO Report Generated');
    setIsGeneratingRFO(false);
    scrollToTop();
  };

  const handleDiagnosticClick = (id: string, title: string) => {
     setActiveModuleId(prev => prev === id ? null : id);
     const prompt = `Initiate diagnostic sequence for ${title}.`;
     processMessage(prompt);
  };

  const handleExplainCommand = (cmd: string, context: string) => {
    processMessage(`Explain the ${context} command: "${cmd}". Include what it does, syntax details, and how to interpret the output.`);
  };

  const handleSimulateCommand = (cmd: string, context: string) => {
    processMessage(`Generate a realistic simulated CLI output for the ${context} command: "${cmd}".
    
    Format the output in a code block.
    After the code block, briefly highlight the key metrics or flags to look for in a troubleshooting context.`);
  };

  const handleFaultNodeClick = (node: FlowNode) => {
    const prompt = `Explain the troubleshooting step "${node.title}" detailed in the flowchart.
    
    Context:
    - Description: ${node.description || 'N/A'}
    - Type: ${node.type}
    ${node.command ? `- Command: ${node.command}` : ''}
    
    Provide context on why this step is important, what the command does (if present), and how to interpret the results to move to the next step.`;
    
    processMessage(prompt);
  };

  const toggleLiveMode = async () => {
    if (isConnected) {
      await disconnect();
      setMode('TEXT');
    } else {
      if (!process.env.API_KEY) {
        alert("API KEY MISSING");
        return;
      }
      await connect();
      setMode('LIVE');
    }
  };

  const toggleWarRoom = () => {
      if (!isWarRoomMode) {
          // Entering War Room
          addTimelineEvent('SYSTEM', 'WAR ROOM PROTOCOL INITIATED');
          setIsWarRoomMode(true);
      } else {
          // Exiting
          setIsWarRoomMode(false);
      }
  };

  // Session Handlers
  const handleSelectSession = (session: Session) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setIsHistoryOpen(false);
    setRagContext(false);
    try {
        const history = session.messages
            .filter(m => m.role !== MessageRole.SYSTEM)
            .map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));
        chatSession.current = createChatSession(customKb, history); 
    } catch(e) {
        console.error("Error restoring chat context", e);
    }
  };

  const handleNewSession = () => {
    setMessages([{ id: 'init', role: MessageRole.SYSTEM, text: "EQNOC Assistant ready.", timestamp: new Date() }]);
    setCurrentSessionId(Date.now().toString());
    setIsHistoryOpen(false);
    setRagContext(false);
    chatSession.current = createChatSession(customKb);
    if (isWarRoomMode) {
        setTimelineEvents([]);
        addTimelineEvent('SYSTEM', 'NEW SESSION STARTED');
    }
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    localStorage.setItem('eqnoc_sessions', JSON.stringify(newSessions));
    
    if (id === currentSessionId) {
        handleNewSession();
    }
  };

  const isSystemOnline = !!process.env.API_KEY;

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  // CHAT COMPONENT RENDERER (Shared between modes)
  const renderChatInterface = () => (
    <div className="flex flex-col h-full bg-slate-950/50 relative">
        {/* Visualizer Header */}
        <div className="h-14 border-b border-slate-800/50 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm shrink-0">
        <h2 className="text-slate-300 font-bold text-sm flex items-center gap-2 tracking-wide">
            <BrainCircuit size={18} className="text-cyan-500" /> 
            ASSISTANT LOG
        </h2>
        
        {ragContext && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 animate-in fade-in zoom-in">
                <Lightbulb size={12} className="text-indigo-400" />
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Memory Active</span>
            </div>
        )}

        <button
            onClick={handleGenerateRFO}
            disabled={isGeneratingRFO || messages.length < 2}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 transition-all disabled:opacity-50"
        >
            {isGeneratingRFO ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            GENERATE RFO
        </button>
        </div>

        {/* MESSAGES */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide flex flex-col">
            {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-5 ${msg.role === MessageRole.USER ? 'flex-row-reverse' : ''} animate-in fade-in duration-300 slide-in-from-bottom-2`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${msg.role === MessageRole.USER ? 'bg-slate-800 border-slate-700' : 'bg-cyan-950/30 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]'}`}>
                {msg.role === MessageRole.USER ? <User size={20} className="text-slate-400" /> : <Bot size={20} className="text-cyan-400" />}
                </div>
                
                <div className={`max-w-[85%] ${msg.role === MessageRole.SYSTEM ? 'w-full text-center' : ''}`}>
                {msg.role === MessageRole.SYSTEM ? (
                    <span className="text-xs font-mono font-medium text-slate-500 py-1.5 px-4 rounded-full border border-slate-800/80 bg-slate-900/50 inline-block">{msg.text}</span>
                ) : (
                    <MessageContent text={msg.text} isStreaming={msg.isStreaming} groundingMetadata={msg.groundingMetadata} images={msg.images} />
                )}
                </div>
            </div>
            ))}
            <div className="h-4" />
        </div>
        
        {/* Input */}
        <div className="p-4 bg-slate-900/50 border-t border-slate-800 backdrop-blur-md shrink-0">
             
             {/* Attachment Preview */}
             {attachment && (
                 <div className="mb-3 flex items-center gap-3 bg-slate-900/80 border border-slate-700 rounded-lg p-2 animate-in slide-in-from-bottom-2">
                     <div className="relative group">
                         <img src={attachment.base64} alt="Preview" className="h-16 w-16 object-cover rounded-md border border-slate-600" />
                         <button 
                             onClick={() => setAttachment(null)}
                             className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600"
                         >
                             <X size={12} />
                         </button>
                     </div>
                     <div className="flex-1">
                         <div className="text-xs font-bold text-cyan-400">OPTICAL RECON READY</div>
                         <div className="text-[10px] text-slate-500 font-mono">Image attached for analysis</div>
                     </div>
                 </div>
             )}

            <div className="flex items-center gap-3 bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 transition-all focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 shadow-lg">
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                    title="Upload Image for Recon"
                >
                    <Paperclip size={20} />
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*"
                />

                <button 
                onClick={toggleLiveMode}
                className={`p-2.5 rounded-lg transition-all ${isConnected ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                title={isConnected ? "Stop Live Mode" : "Start Live Mode"}
                >
                {isConnected ? <Power size={20} /> : <Mic size={20} />}
                </button>
                
                <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={isConnected ? "Listening..." : "Type query or upload image..."}
                disabled={isConnected || isLoading}
                className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-500 text-base h-full"
                />
                
                <button 
                onClick={handleSendMessage}
                disabled={(!input.trim() && !attachment) || isConnected || isLoading}
                className="p-2.5 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:hover:text-cyan-400 transition-colors"
                >
                <Send size={20} />
                </button>
            </div>
            {isRetrieving && (
                <div className="absolute top-0 right-4 -mt-3 text-[10px] text-indigo-400 flex items-center gap-1 font-mono">
                   <Loader2 size={8} className="animate-spin" /> Recalling...
                </div>
            )}
        </div>
        </div>
    </div>
  );

  return (
    <div className={`h-screen overflow-hidden bg-slate-950 text-gray-100 font-sans flex flex-col selection:bg-cyan-500/30 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      
      {/* HEADER */}
      <header className={`h-16 backdrop-blur-md border-b flex items-center justify-between px-6 z-20 sticky top-0 shrink-0 transition-colors duration-500 ${isWarRoomMode ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-950/80 border-slate-800/50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all duration-500 ${isWarRoomMode ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
             {isWarRoomMode ? <Siren size={20} /> : <Activity size={20} />}
          </div>
          <h1 className="font-display text-xl font-bold tracking-wide text-white">EQNOC <span className={`font-normal transition-colors duration-500 ${isWarRoomMode ? 'text-red-500' : 'text-cyan-400'}`}>AI</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
           {/* WAR ROOM TOGGLE */}
           <button
             onClick={toggleWarRoom}
             className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all text-xs font-bold tracking-widest ${
                 isWarRoomMode 
                 ? 'bg-red-600 text-white border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:bg-red-700' 
                 : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:border-red-500/50 hover:text-red-400'
             }`}
           >
              <ShieldAlert size={14} />
              WAR ROOM {isWarRoomMode ? 'ACTIVE' : 'OFF'}
           </button>

           {/* Knowledge Base Button */}
           <button 
             onClick={() => setIsKbOpen(true)}
             className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-xs font-bold ${
                 customKb 
                 ? 'bg-violet-950/30 border-violet-500/50 text-violet-400' 
                 : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-violet-400 hover:border-violet-500/30'
             }`}
             title="Ingest Knowledge Base"
           >
              <Database size={14} />
              <span className="hidden sm:inline">KB {customKb ? 'ACTIVE' : 'INGEST'}</span>
           </button>

           <button 
             onClick={() => setIsHistoryOpen(true)}
             className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900/50 hover:bg-slate-800 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-400 transition-all text-xs font-bold"
           >
              <History size={14} />
              <span className="hidden sm:inline">HISTORY</span>
           </button>

          <div className={`flex items-center gap-2 text-xs font-mono font-bold px-3 py-1.5 rounded-full border transition-all ${
            isConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
              : isSystemOnline 
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.1)]'
                : 'bg-red-900/10 text-red-500 border-red-900/30'
          }`}>
            <Wifi size={14} className={isConnected ? "animate-pulse" : ""} />
            {isConnected ? 'LIVE CONNECTED' : isSystemOnline ? 'SYSTEM ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className={`flex-1 flex overflow-hidden relative transition-colors duration-500 ${isWarRoomMode ? 'bg-red-950/5' : ''}`}>
        
        {/* Modals */}
        {isHistoryOpen && (
            <SessionHistory 
                sessions={sessions}
                currentSessionId={currentSessionId}
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
                onDeleteSession={handleDeleteSession}
                onClose={() => setIsHistoryOpen(false)}
            />
        )}
        
        {isKbOpen && (
            <KnowledgeBaseModal 
                initialContent={customKb}
                onSave={handleSaveKb}
                onClose={() => setIsKbOpen(false)}
            />
        )}
        
        {/* --- WAR ROOM LAYOUT --- */}
        {isWarRoomMode ? (
            <div className="w-full h-full p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-500">
                {/* COL 1: CONTEXT */}
                <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
                    <div className="h-1/2 rounded-xl border border-red-900/30 overflow-hidden shadow-lg bg-slate-900/40">
                         <OutageTracker 
                            persistedOutages={outageState.outages}
                            persistedLastUpdated={outageState.lastUpdated}
                            onOutagesChange={(outages, lastUpdated) => setOutageState({outages, lastUpdated})}
                        />
                    </div>
                    <div className="h-1/2 rounded-xl border border-red-900/30 overflow-hidden shadow-lg bg-slate-900/40">
                         <WarRoomTimeline events={timelineEvents} onAddEntry={(msg) => addTimelineEvent('MANUAL', msg)} />
                    </div>
                </div>

                {/* COL 2: MAIN CHAT */}
                <div className="lg:col-span-2 rounded-xl border border-red-500/40 overflow-hidden shadow-[0_0_40px_rgba(220,38,38,0.1)] relative">
                     {renderChatInterface()}
                     {/* War Room overlay effects */}
                     <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-pulse z-20 pointer-events-none"></div>
                     <div className="absolute bottom-0 right-0 p-4 pointer-events-none z-20 opacity-20">
                        <Siren size={120} className="text-red-600" />
                     </div>
                </div>

                {/* COL 3: DIAGNOSTICS */}
                <div className="lg:col-span-1 rounded-xl border border-red-900/30 overflow-hidden shadow-lg bg-slate-900/40">
                     <LogAnalyzer persistedLogs={persistentLogs} onLogsChange={setPersistentLogs} />
                </div>
            </div>
        ) : (
        /* --- STANDARD LAYOUT --- */
        <>
            {/* LEFT PANE */}
            <div 
            className="hidden lg:flex flex-col bg-slate-900/30 min-w-[300px]"
            style={{ width: `${leftPanelWidth}%` }}
            >
            {/* Minimal Tab Bar */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 shrink-0 overflow-x-auto scrollbar-hide">
                <button 
                onClick={() => setLeftPanelMode('DASHBOARD')}
                className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'DASHBOARD' ? 'border-cyan-400 text-cyan-400 bg-cyan-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <LayoutDashboard size={16} /> OPS
                </button>
                <button 
                onClick={() => setLeftPanelMode('FAULT_ASSIST')}
                className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'FAULT_ASSIST' ? 'border-amber-400 text-amber-400 bg-amber-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <GitBranch size={16} /> TRIAGE
                </button>
                <button 
                onClick={() => setLeftPanelMode('PACKET_WALK')}
                className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'PACKET_WALK' ? 'border-violet-400 text-violet-400 bg-violet-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <Layers size={16} /> PACKET WALK
                </button>
                <button 
                onClick={() => setLeftPanelMode('OUTAGES')}
                className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'OUTAGES' ? 'border-red-500 text-red-500 bg-red-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <ZapOff size={16} /> OUTAGES
                </button>
                <button 
                onClick={() => setLeftPanelMode('HANDOVER')}
                className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'HANDOVER' ? 'border-teal-400 text-teal-400 bg-teal-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <ClipboardList size={16} /> SHIFT
                </button>
                <button 
                onClick={() => setLeftPanelMode('LOGS')}
                className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'LOGS' ? 'border-blue-400 text-blue-400 bg-blue-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <ScanSearch size={16} /> X-RAY
                </button>
            </div>

            <div className="flex-1 overflow-hidden relative p-6">
                {leftPanelMode === 'DASHBOARD' ? (
                <div className="flex flex-col h-full gap-6">
                    <DiagnosticGrid onModuleClick={handleDiagnosticClick} activeModuleId={activeModuleId} />
                    <div className="flex-1 flex gap-6 min-h-0">
                        <div className="flex-1 h-full overflow-hidden">
                            <NetworkTools />
                        </div>
                        <div className="w-96 h-full overflow-hidden bg-slate-900/40 rounded-xl border border-slate-800/50 shadow-sm">
                            <CommandPanel 
                                activeModuleId={activeModuleId} 
                                onExplainCommand={handleExplainCommand} 
                                onSimulateCommand={handleSimulateCommand}
                                isProcessing={isLoading}
                            />
                        </div>
                    </div>
                </div>
                ) : leftPanelMode === 'FAULT_ASSIST' ? (
                <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <FaultAssistant 
                        onNodeClick={handleFaultNodeClick}
                        persistedInput={faultAssistantState.input}
                        persistedTree={faultAssistantState.tree}
                        onStateChange={(input, tree) => setFaultAssistantState({input, tree})}
                    />
                </div>
                ) : leftPanelMode === 'LOGS' ? (
                    <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <LogAnalyzer persistedLogs={persistentLogs} onLogsChange={setPersistentLogs} />
                    </div>
                ) : leftPanelMode === 'HANDOVER' ? (
                    <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <ShiftHandoverDashboard 
                      sessions={sessions}
                      persistedState={shiftState}
                      onStateChange={setShiftState}
                    />
                    </div>
                ) : leftPanelMode === 'PACKET_WALK' ? (
                    <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <PacketWalkVisualizer />
                    </div>
                ) : (
                <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <OutageTracker 
                        persistedOutages={outageState.outages}
                        persistedLastUpdated={outageState.lastUpdated}
                        onOutagesChange={(outages, lastUpdated) => setOutageState({outages, lastUpdated})}
                    />
                </div>
                )}
            </div>
            </div>

            {/* RESIZER HANDLE */}
            <div 
            className={`hidden lg:flex w-1 bg-slate-800 hover:bg-cyan-500 cursor-col-resize transition-colors items-center justify-center z-50 ${isResizing ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : ''}`}
            onMouseDown={startResizing}
            >
            <div className={`h-8 w-0.5 rounded-full transition-colors ${isResizing ? 'bg-white' : 'bg-slate-600'}`} />
            </div>

            {/* RIGHT PANE (CHAT) */}
            <div className="flex-1 flex flex-col bg-slate-950 relative min-w-[300px]">
                 {renderChatInterface()}
            </div>
        </>
        )}
      </main>
    </div>
  );
};

export default App;