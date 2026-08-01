import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  createChatSession, generateShiftHandover, checkAiHealth, StreamChunk,
  isAuthenticated as hasAuthToken, clearAuth, AuthError,
} from './services/ai';
import { Message, MessageRole, Session } from './types';
import {
  Activity, Send, Paperclip, X, Bell, BookOpen, BookText, StickyNote,
  FileText, RotateCcw, ChevronRight, Loader2, Camera,
} from 'lucide-react';
import MessageContent from './components/MessageContent';
import LoginScreen from './components/LoginScreen';
import CommandLibraryModal from './components/CommandLibraryModal';
// Lazy — pulls in pdf.js only when a tech opens the manuals uploader.
const ManualsModal = lazy(() => import('./components/ManualsModal'));
const PhotosModal = lazy(() => import('./components/PhotosModal'));
import ReminderModal, { Reminder } from './components/ReminderModal';
import { playAlertSound } from './utils/audio';

const SUGGESTIONS = [
  'Interpret an OTDR or power reading',
  'Fibre colour code & connector guide',
  'Safety check for a site job',
  'Draft a job or defect report',
  'Generate my shift handover',
  'Explain a Cisco vs Juniper command',
];

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasAuthToken());

  // Chat
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: MessageRole.MODEL, text: "Tech Assistant ready — desk or field, what are you working on?", timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatSession = useRef<ReturnType<typeof createChatSession> | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // Notes
  const [notes, setNotes] = useState(() => { try { return localStorage.getItem('eqnoc_notes') || ''; } catch { return ''; } });
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const handleNotesChange = (v: string) => {
    setNotes(v);
    try { localStorage.setItem('eqnoc_notes', v); } catch { /* ignore */ }
  };

  // Command library
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isManualsOpen, setIsManualsOpen] = useState(false);
  const [isPhotosOpen, setIsPhotosOpen] = useState(false);

  // Reminders / alarms
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    try { return JSON.parse(localStorage.getItem('eqnoc_reminders') || '[]'); } catch { return []; }
  });
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [hasUnreadAlarm, setHasUnreadAlarm] = useState(false);
  const activeAlarms = reminders.filter(r => r.fired);

  useEffect(() => {
    try { localStorage.setItem('eqnoc_reminders', JSON.stringify(reminders)); } catch (e) { console.warn('save reminders', e); }
  }, [reminders]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const updated = reminders.map(r => (!r.fired && r.time <= now ? (changed = true, { ...r, fired: true }) : r));
      if (changed) { setReminders(updated); setHasUnreadAlarm(true); playAlertSound(); }
    }, 1000);
    return () => clearInterval(interval);
  }, [reminders]);

  const handleDismissAlarm = (id: string) => setReminders(prev => prev.filter(r => r.id !== id));

  // Shift
  const [shiftStartTime, setShiftStartTime] = useState<number>(() => {
    try { const s = localStorage.getItem('eqnoc_shift_start'); const p = s ? parseInt(s, 10) : NaN; return isNaN(p) ? 0 : p; } catch { return 0; }
  });
  const [shiftElapsed, setShiftElapsed] = useState('');
  useEffect(() => {
    const fmt = () => {
      if (!shiftStartTime) { setShiftElapsed('Not started'); return; }
      const d = Math.max(0, Date.now() - shiftStartTime);
      const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000);
      setShiftElapsed(`${h}h ${m}m`);
    };
    fmt();
    const t = setInterval(fmt, 30000);
    return () => clearInterval(t);
  }, [shiftStartTime]);

  const handleShiftReset = () => {
    const now = Date.now();
    setShiftStartTime(now);
    try { localStorage.setItem('eqnoc_shift_start', now.toString()); } catch { /* ignore */ }
  };

  // Sessions (chat history persistence — powers the shift handover)
  const [sessions, setSessions] = useState<Session[]>([]);
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const [currentSessionId] = useState<string>(() => Date.now().toString());
  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('eqnoc_sessions');
      if (saved) {
        const parsed: Session[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSessions(parsed.map(s => ({ ...s, messages: s.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })) })));
        }
      }
    } catch (e) { console.error('load sessions', e); }
  }, []);

  const persistSessions = (list: Session[]): boolean => {
    const lean = list.map(s => ({ ...s, messages: s.messages.map(m => (m.images ? { ...m, images: undefined } : m)) }));
    try { localStorage.setItem('eqnoc_sessions', JSON.stringify(lean)); return true; }
    catch (e) { console.warn('session save failed (quota?)', e); return false; }
  };

  const saveCurrentSession = useCallback((msgs: Message[]) => {
    if (msgs.length <= 1 && msgs[0]?.id === 'init') return;
    const firstUser = msgs.slice().reverse().find(m => m.role === MessageRole.USER);
    const title = firstUser ? (firstUser.text.length > 40 ? firstUser.text.slice(0, 40) + '…' : firstUser.text) : 'Triage session';
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === currentSessionId);
      const updated: Session = { id: currentSessionId, title, timestamp: Date.now(), messages: msgs };
      const next = idx >= 0 ? prev.map((s, i) => (i === idx ? updated : s)) : [updated, ...prev];
      setSessionSaveFailed(!persistSessions(next));
      return next;
    });
  }, [currentSessionId]);

  // Health / online indicator
  const [isSystemOnline, setIsSystemOnline] = useState(false);
  useEffect(() => { checkAiHealth().then(h => setIsSystemOnline(h.ok && h.configured)).catch(() => {}); }, []);

  // Init chat session
  useEffect(() => {
    try { chatSession.current = createChatSession(); } catch (e) { console.error('init chat', e); }
  }, []);

  const scrollToBottom = () => requestAnimationFrame(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; });

  const getSystemStateContext = () => {
    const dur = shiftStartTime === 0 ? 'not started' : shiftElapsed;
    return `[SYSTEM STATE]\n- Shift duration: ${dur}\n- Scratchpad notes: ${notes ? `"${notes.slice(0, 1000)}"` : 'empty'}\n[/SYSTEM STATE]`;
  };

  const appendMessage = (m: Message) => setMessages(prev => [...prev, m]);

  const convertFileToBase64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result as string); r.onerror = rej;
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { alert('Only image files are supported.'); return; }
      try { setAttachment({ base64: await convertFileToBase64(file), type: file.type }); } catch (err) { console.error(err); }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) { try { setAttachment({ base64: await convertFileToBase64(file), type: file.type }); } catch (err) { console.error(err); } }
        break;
      }
    }
  };

  // Optical budget calculator (pure)
  const opticalBudget = (a: Record<string, number | string>) => {
    const txPower = Number(a.txPower), rxSensitivity = Number(a.rxSensitivity), distance = Number(a.distance);
    const wavelength = String(a.wavelength ?? '1310');
    const connectorCount = Number(a.connectorCount ?? 2), spliceCount = Number(a.spliceCount ?? 2), safetyMargin = Number(a.safetyMargin ?? 3);
    const attenuation = wavelength === '1550' ? 0.25 : wavelength === '850' ? 3.0 : 0.35;
    const fiberLoss = distance * attenuation;
    const passiveLoss = connectorCount * 0.5 + spliceCount * 0.1;
    const totalLoss = fiberLoss + passiveLoss;
    const estRx = txPower - totalLoss;
    const margin = estRx - rxSensitivity - safetyMargin;
    return {
      fiberLoss: +fiberLoss.toFixed(2), passiveLoss: +passiveLoss.toFixed(2), totalLinkLoss: +totalLoss.toFixed(2),
      estimatedRxPower: +estRx.toFixed(2), margin: +margin.toFixed(2), status: margin >= 0 ? 'PASS' : 'FAIL', wavelength, distance,
    };
  };

  const processMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || isLoading) return;

    const currentAttachment = attachment;
    setAttachment(null);

    const userMsg: Message = {
      id: Date.now().toString(), role: MessageRole.USER, text, timestamp: new Date(),
      images: currentAttachment ? [currentAttachment.base64] : undefined,
    };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    saveCurrentSession(withUser);
    setInput('');
    setIsLoading(true);
    scrollToBottom();

    let streamingMsgId: string | null = null;
    try {
      if (!chatSession.current) chatSession.current = createChatSession();

      const finalPrompt = `${getSystemStateContext()}\n\nUser Query: ${text}`;
      const result = currentAttachment
        ? await chatSession.current.sendMessageStream({ message: [
            { text: finalPrompt || 'Analyze this image.' },
            { inlineData: { mimeType: currentAttachment.type, data: currentAttachment.base64.split(',')[1] } },
          ] })
        : await chatSession.current.sendMessageStream({ message: finalPrompt });

      const botMsgId = (Date.now() + 1).toString();
      streamingMsgId = botMsgId;
      const botMsg: Message = { id: botMsgId, role: MessageRole.MODEL, text: '', timestamp: new Date(), isStreaming: true };
      setMessages(prev => [...prev, botMsg]);

      let fullText = '';
      const functionCalls: { id?: string; name: string; args: Record<string, unknown> }[] = [];
      for await (const chunk of result) {
        const c = chunk as StreamChunk;
        fullText += c.text || '';
        if (c.functionCalls) c.functionCalls.forEach(fc => functionCalls.push(fc));
        setMessages(prev => prev.map(m => (m.id === botMsgId ? { ...m, text: fullText } : m)));
        scrollToBottom();
      }

      // Handle tool calls (loop for chained calls)
      let pending = functionCalls;
      let rounds = 0;
      let workingNotes = notesRef.current;
      const extraMessages: Message[] = [];
      while (pending.length > 0 && rounds++ < 5) {
        const toolResponses = [];
        for (const fc of pending) {
          const args = (fc.args || {}) as Record<string, unknown>;
          let toolResult = 'Done.';

          if (fc.name === 'generate_shift_report') {
            const recent = sessionsRef.current.filter(s => s.timestamp >= shiftStartTime).sort((a, b) => b.timestamp - a.timestamp);
            if (recent.length === 0) { toolResult = 'No activity recorded this shift yet.'; }
            else {
              try {
                const report = await generateShiftHandover(recent);
                extraMessages.push({ id: `rep-${Date.now()}`, role: MessageRole.MODEL, text: report, timestamp: new Date() });
                toolResult = 'Shift handover generated and shown below.';
              } catch { toolResult = 'Failed to generate the handover.'; }
            }
          } else if (fc.name === 'start_new_shift') {
            handleShiftReset();
            toolResult = 'New shift started — timer reset.';
          } else if (fc.name === 'set_alarm') {
            const { message, type, timeValue } = args as { message: string; type: string; timeValue: string };
            let target = 0, display = '';
            if (type === 'RELATIVE_MINUTES') { const mins = parseInt(timeValue, 10); target = Date.now() + mins * 60000; display = `in ${mins} minutes`; }
            else if (type === 'ABSOLUTE_TIME') { const [h, m] = timeValue.split(':').map(Number); const dt = new Date(); dt.setHours(h, m, 0, 0); if (dt.getTime() < Date.now()) dt.setDate(dt.getDate() + 1); target = dt.getTime(); display = `at ${timeValue}`; }
            if (target > 0) {
              setReminders(prev => [...prev, { id: Date.now().toString(), text: message, time: target, fired: false }].sort((a, b) => a.time - b.time));
              setHasUnreadAlarm(true);
              toolResult = `Reminder set for "${message}" ${display}.`;
            } else { toolResult = 'Could not parse the time.'; }
          } else if (fc.name === 'calculate_optical_budget') {
            toolResult = JSON.stringify(opticalBudget(args as Record<string, number | string>));
          } else if (fc.name === 'update_notes') {
            const { content, mode = 'APPEND' } = args as { content: string; mode?: string };
            workingNotes = mode === 'OVERWRITE' ? content : (workingNotes + '\n' + content).trim();
            handleNotesChange(workingNotes);
            toolResult = `Notes updated (${workingNotes.length} chars).`;
          }

          toolResponses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: { result: toolResult } } });
        }

        const followUp = await chatSession.current.sendMessageStream({ message: toolResponses });
        const next: typeof functionCalls = [];
        for await (const sub of followUp) {
          const sc = sub as StreamChunk;
          fullText += sc.text || '';
          if (sc.functionCalls) sc.functionCalls.forEach(fc => next.push(fc));
          setMessages(prev => prev.map(m => (m.id === botMsgId ? { ...m, text: fullText } : m)));
        }
        pending = next;
      }

      const completed: Message[] = [
        ...withUser,
        { ...botMsg, text: fullText, isStreaming: false },
        ...extraMessages,
      ];
      setMessages(completed);
      saveCurrentSession(completed);
      scrollToBottom();
    } catch (error: unknown) {
      if (error instanceof AuthError) { clearAuth(); setIsAuthenticated(false); setIsLoading(false); return; }
      console.error('AI API Error:', error);
      if (streamingMsgId) setMessages(prev => prev.map(m => (m.id === streamingMsgId ? { ...m, isStreaming: false } : m)));
      appendMessage({ id: Date.now().toString(), role: MessageRole.SYSTEM, text: `Communication error. ${(error as Error)?.message || ''}`, timestamp: new Date() });
      checkAiHealth().then(h => setIsSystemOnline(h.ok && h.configured)).catch(() => setIsSystemOnline(false));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => { processMessage(input); };
  const handleExplainCommand = (cmd: string, ctx: string) => { setIsLibraryOpen(false); processMessage(`Explain the ${ctx} command: "${cmd}".`); };
  const handleSimulateCommand = (cmd: string, ctx: string) => { setIsLibraryOpen(false); processMessage(`Show simulated CLI output for the ${ctx} command: "${cmd}".`); };

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  return (
    <div className="min-h-screen lg:h-[100dvh] w-full flex flex-col lg:overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Alarm banner */}
      {activeAlarms.length > 0 && (
        <div className="bg-danger text-white text-[13px] font-semibold px-4 py-2 flex items-center gap-2" role="alert">
          <Bell size={14} className="shrink-0" />
          <span className="flex-1 truncate">
            {activeAlarms.length === 1 ? `Reminder: ${activeAlarms[0].text}` : `${activeAlarms.length} active reminders`}
          </span>
          <button onClick={() => handleDismissAlarm(activeAlarms[0].id)} className="opacity-80 hover:opacity-100" aria-label="Dismiss reminder"><X size={15} /></button>
        </div>
      )}
      {sessionSaveFailed && (
        <div className="bg-warn/90 text-white text-[12px] font-semibold px-4 py-1.5 flex items-center gap-2" role="alert">
          <FileText size={12} /> Storage full — session history may not persist.
        </div>
      )}

      {/* Top bar */}
      <header className="h-14 px-4 sm:px-6 flex items-center gap-3 border-b border-line bg-card/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0" style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
          <Activity size={17} className="text-white" strokeWidth={2.2} />
        </div>
        <div className="font-bold text-[16px] tracking-[-0.3px]">Tech <span className="text-accent">Assistant</span></div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setIsReminderOpen(true); setHasUnreadAlarm(false); }} className="relative w-9 h-9 grid place-items-center rounded-full border border-line bg-card hover:border-line-strong" aria-label="Reminders">
            <Bell size={16} className="text-muted" />
            {hasUnreadAlarm && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />}
          </button>
          <div className="hidden sm:inline-flex items-center gap-2 text-[12.5px] text-muted bg-card border border-line px-3 py-1.5 rounded-full">
            <span className={`w-2 h-2 rounded-full ${isSystemOnline ? 'bg-ok' : 'bg-danger'}`} style={isSystemOnline ? { boxShadow: '0 0 8px var(--ok)' } : {}} />
            {isSystemOnline ? 'System online' : 'Offline'}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 w-full max-w-[1500px] mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-0">
        {/* Chat */}
        <section className="bg-card border border-line rounded-xl2 flex flex-col overflow-hidden min-h-[70vh] lg:min-h-0">
          <div ref={streamRef} role="log" aria-live="polite" aria-busy={isLoading} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 scrollbar-hide">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === MessageRole.USER ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-[9px] shrink-0 grid place-items-center text-[13px] font-semibold ${
                  msg.role === MessageRole.USER ? 'bg-card-2 text-muted' : msg.role === MessageRole.SYSTEM ? 'bg-danger/15 text-danger' : 'text-accent'
                }`} style={msg.role === MessageRole.MODEL ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : {}}>
                  {msg.role === MessageRole.USER ? 'You' : msg.role === MessageRole.SYSTEM ? '!' : '◆'}
                </div>
                <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed ${
                  msg.role === MessageRole.USER ? 'text-white' : 'bg-card-2 border border-line'
                }`} style={msg.role === MessageRole.USER ? { background: 'linear-gradient(155deg, var(--accent-2), var(--accent))' } : {}}>
                  {msg.role === MessageRole.USER
                    ? <span className="whitespace-pre-wrap">{msg.text}{msg.images?.map((im, i) => <img key={i} src={im} alt="" className="mt-2 max-w-[220px] rounded-lg" />)}</span>
                    : <MessageContent text={msg.text} isStreaming={msg.isStreaming} images={msg.images} />}
                </div>
              </div>
            ))}
          </div>

          {/* Suggestion chips */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 px-4 sm:px-6 pb-3">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => processMessage(s)} className="text-[12.5px] text-muted bg-card-2 border border-line hover:border-accent hover:text-ink px-3 py-2 rounded-full transition-colors">{s}</button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="p-3 sm:p-4 border-t border-line">
            {attachment && (
              <div className="flex items-center gap-2 mb-2 text-[12px] text-muted">
                <img src={attachment.base64} alt="" className="w-9 h-9 rounded-md object-cover border border-line" />
                Image attached
                <button onClick={() => setAttachment(null)} className="text-faint hover:text-danger" aria-label="Remove attachment"><X size={14} /></button>
              </div>
            )}
            <div className="flex items-center gap-2 bg-card-2 border border-line-strong rounded-2xl pl-3 pr-2 py-1.5 focus-ring transition-shadow">
              <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg text-muted hover:text-accent" aria-label="Attach image"><Paperclip size={18} /></button>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
              <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()} onPaste={handlePaste}
                placeholder="Ask anything, or paste logs…" aria-label="Message the assistant" disabled={isLoading}
                className="flex-1 bg-transparent border-0 outline-none text-ink placeholder:text-faint text-[15px] py-2"
              />
              <button onClick={handleSend} disabled={(!input.trim() && !attachment) || isLoading} aria-label="Send"
                className="w-10 h-10 grid place-items-center rounded-xl text-white shadow-accent disabled:opacity-40 transition-opacity"
                style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
                {isLoading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </div>
          </div>
        </section>

        {/* Rail */}
        <aside className="flex flex-col gap-4">
          <div className="bg-card border border-line rounded-xl2 p-4">
            <h3 className="text-[12px] uppercase tracking-[0.6px] text-muted font-semibold mb-3">Shift</h3>
            <div className="bg-card-2 border border-line rounded-xl px-3.5 py-3 mb-3">
              <div className="text-[26px] font-bold tracking-[-1px]">{shiftElapsed}</div>
              <div className="text-[10.5px] uppercase tracking-[0.5px] text-muted font-semibold mt-0.5">Elapsed</div>
            </div>
            <button onClick={() => processMessage('Generate my shift handover report.')}
              className="w-full py-3 rounded-xl text-white text-[14px] font-semibold shadow-accent transition-all hover:brightness-105"
              style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
              Generate handover
            </button>
            <button onClick={() => processMessage('Start a new shift.')}
              className="w-full mt-2 py-2.5 rounded-xl text-ink text-[13.5px] font-semibold bg-card-2 border border-line hover:border-line-strong flex items-center justify-center gap-2">
              <RotateCcw size={14} /> New shift
            </button>
          </div>

          <div className="bg-card border border-line rounded-xl2 p-4">
            <h3 className="text-[12px] uppercase tracking-[0.6px] text-muted font-semibold mb-1">Quick tools</h3>
            <button onClick={() => setIsLibraryOpen(true)} className="w-full flex items-center gap-3 py-3 border-t border-line text-[14px] hover:text-accent transition-colors">
              <BookOpen size={16} className="text-muted" /> <span className="flex-1 text-left">Command library</span> <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={() => setIsManualsOpen(true)} className="w-full flex items-center gap-3 py-3 border-t border-line text-[14px] hover:text-accent transition-colors">
              <BookText size={16} className="text-muted" /> <span className="flex-1 text-left">Equipment manuals</span> <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={() => setIsPhotosOpen(true)} className="w-full flex items-center gap-3 py-3 border-t border-line text-[14px] hover:text-accent transition-colors">
              <Camera size={16} className="text-muted" /> <span className="flex-1 text-left">Site photos</span> <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={() => setIsNotesOpen(true)} className="w-full flex items-center gap-3 py-3 border-t border-line text-[14px] hover:text-accent transition-colors">
              <StickyNote size={16} className="text-muted" /> <span className="flex-1 text-left">Scratchpad notes</span>
              {notes && <span className="text-[11px] text-faint">{notes.length}</span>} <ChevronRight size={15} className="text-faint" />
            </button>
          </div>
        </aside>
      </div>

      {/* Modals */}
      {isLibraryOpen && <CommandLibraryModal onClose={() => setIsLibraryOpen(false)} onExplainCommand={handleExplainCommand} onSimulateCommand={handleSimulateCommand} />}
      {isManualsOpen && <Suspense fallback={null}><ManualsModal onClose={() => setIsManualsOpen(false)} /></Suspense>}
      {isPhotosOpen && <Suspense fallback={null}><PhotosModal onClose={() => setIsPhotosOpen(false)} /></Suspense>}
      {isReminderOpen && <ReminderModal reminders={reminders} onClose={() => setIsReminderOpen(false)} onAdd={(r) => setReminders(prev => [...prev, r].sort((a, b) => a.time - b.time))} onDelete={handleDismissAlarm} />}

      {/* Notes drawer */}
      {isNotesOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setIsNotesOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md h-full bg-card border-l border-line p-5 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-bold flex items-center gap-2"><StickyNote size={16} className="text-accent" /> Scratchpad</h3>
              <button onClick={() => setIsNotesOpen(false)} className="text-muted hover:text-ink" aria-label="Close notes"><X size={18} /></button>
            </div>
            <textarea value={notes} onChange={e => handleNotesChange(e.target.value)} placeholder="Jot down anything for this shift…"
              className="flex-1 w-full resize-none bg-card-2 border border-line rounded-xl p-3 text-[14px] text-ink outline-none focus-ring transition-shadow placeholder:text-faint" />
            <p className="text-[11.5px] text-faint mt-2">The assistant can read and update these notes.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
