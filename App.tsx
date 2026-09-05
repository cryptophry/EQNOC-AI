import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  createChatSession, checkAiHealth, StreamChunk,
  isAuthenticated as hasAuthToken, clearAuth, AuthError, refreshAuthToken, logout,
} from './services/ai';
import { Message, MessageRole, Session } from './types';
import {
  Activity, Send, Paperclip, X, Bell, BookOpen, BookText, StickyNote,
  FileText, ChevronRight, Loader2, ImageIcon, LogOut, User, AlertTriangle,
  Calculator, Mic, Copy, Check, MapPin, ClipboardList,
} from 'lucide-react';
import MessageContent from './components/MessageContent';
import SourcesPanel from './components/SourcesPanel';
import LoginScreen from './components/LoginScreen';
import CommandLibraryModal from './components/CommandLibraryModal';
import SessionList from './components/SessionList';
// Lazy — pulls in pdf.js only when a tech opens the manuals uploader.
const ManualsModal = lazy(() => import('./components/ManualsModal'));
const PhotosModal = lazy(() => import('./components/PhotosModal'));
import ReminderModal, { Reminder } from './components/ReminderModal';
import FieldKitModal from './components/FieldKitModal';
import ColumnSplitter from './components/ColumnSplitter';
import {
  clampLayout, contentBoxWidth, loadLayoutWidths, notesLimits, railLimits, saveLayoutWidths,
  type LayoutWidths,
} from './utils/layoutWidths';
import { ingestPhotoFromDataUrl } from './services/photos';
import { downscaleImage } from './utils/image';
import { playAlertSound } from './utils/audio';
import { opticalBudget as calcOptical } from './utils/fieldKit';
import { canDictate, startDictation } from './utils/speech';
import { parseCustomTitle, titleForSave } from './utils/sessionTitle';

const nid = () => {
  try { return crypto.randomUUID(); } catch { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
};

const INIT_MSG = (): Message => ({
  id: 'init', role: MessageRole.MODEL,
  text: "Tech Assistant ready — desk or field, what are you working on?",
  timestamp: new Date(),
});

const MAX_SESSIONS = 30;

function messagesToHistory(msgs: Message[]) {
  return msgs
    .filter(m => (m.role === MessageRole.USER || m.role === MessageRole.MODEL) && m.id !== 'init')
    .map(m => ({
      role: m.role === MessageRole.USER ? 'user' : 'assistant',
      content: m.text || '',
    }));
}

const SUGGESTIONS = [
  'Interpret an OTDR or power reading',
  'Fibre colour code & connector guide',
  'Safety check for a site job',
  'Draft a job or defect report',
  'Explain a Cisco vs Juniper command',
  'Draft a job handover I can paste into a ticket',
];

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasAuthToken());

  // Silently renew the session on app open so an actively-used device never
  // expires mid-shift; if the stored token has already expired, drop straight
  // to the login screen instead of surfacing 401s from features later.
  useEffect(() => {
    if (!hasAuthToken()) return;
    refreshAuthToken().then((ok) => { if (!ok) setIsAuthenticated(false); }).catch(() => {});
  }, []);

  // Chat
  const [messages, setMessages] = useState<Message[]>([INIT_MSG()]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; type: string } | null>(null);
  const [rememberImage, setRememberImage] = useState(false);
  const [imgSaveNote, setImgSaveNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatSession = useRef<ReturnType<typeof createChatSession> | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // Notes
  const [notes, setNotes] = useState(() => { try { return localStorage.getItem('eqnoc_notes') || ''; } catch { return ''; } });
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutWidths>(() => loadLayoutWidths());
  const [frameW, setFrameW] = useState(0);
  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;
    const measure = () => setFrameW(contentBoxWidth(el));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isAuthenticated]);
  const shown = clampLayout(layout, frameW || 1440, isNotesOpen);
  const railBound = railLimits(frameW || 1440, isNotesOpen, shown.notes);
  const notesBound = notesLimits(frameW || 1440, shown.rail);
  const updateLayout = (patch: Partial<LayoutWidths>) => {
    setLayout(prev => {
      const next = { ...prev, ...patch };
      saveLayoutWidths(next);
      return next;
    });
  };
  const handleNotesChange = (v: string) => {
    setNotes(v);
    try { localStorage.setItem('eqnoc_notes', v); } catch { /* ignore */ }
  };

  // Command library
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isManualsOpen, setIsManualsOpen] = useState(false);
  const [isPhotosOpen, setIsPhotosOpen] = useState(false);
  const [isKitOpen, setIsKitOpen] = useState(false);
  const [site, setSite] = useState(() => { try { return localStorage.getItem('eqnoc_site') || ''; } catch { return ''; } });
  const saveSite = (v: string) => {
    setSite(v);
    try { localStorage.setItem('eqnoc_site', v); } catch { /* ignore */ }
  };
  const [listening, setListening] = useState(false);
  const stopListen = useRef<(() => void) | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    const next = reminders.filter(r => !r.fired).sort((a, b) => a.time - b.time)[0];
    if (!next) return;
    const delay = Math.min(Math.max(0, next.time - Date.now()), 2_147_000_000);
    const t = setTimeout(() => {
      const now = Date.now();
      setReminders(prev => {
        let firedAny = false;
        const updated = prev.map(r => {
          if (!r.fired && r.time <= now) { firedAny = true; return { ...r, fired: true }; }
          return r;
        });
        if (firedAny) { setHasUnreadAlarm(true); playAlertSound(); }
        return firedAny ? updated : prev;
      });
    }, delay);
    return () => clearTimeout(t);
  }, [reminders]);

  const handleDismissAlarm = (id: string) => setReminders(prev => prev.filter(r => r.id !== id));

  // Sessions (chat history persistence)
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => nid());
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
    const lean = list
      .slice(0, MAX_SESSIONS)
      .map(s => ({ ...s, messages: s.messages.map(m => (m.images ? { ...m, images: undefined } : m)) }));
    try { localStorage.setItem('eqnoc_sessions', JSON.stringify(lean)); return true; }
    catch (e) { console.warn('session save failed (quota?)', e); return false; }
  };

  const openSession = (id: string) => {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    chatSession.current?.abort();
    setCurrentSessionId(s.id);
    setMessages(s.messages.length ? s.messages : [INIT_MSG()]);
    try { chatSession.current = createChatSession(messagesToHistory(s.messages)); } catch (e) { console.error(e); }
  };

  const newChat = () => {
    chatSession.current?.abort();
    setCurrentSessionId(nid());
    setMessages([INIT_MSG()]);
    try { chatSession.current = createChatSession(); } catch (e) { console.error(e); }
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      persistSessions(next);
      return next;
    });
    if (id === currentSessionId) newChat();
  };

  const renameSession = (id: string, name: string) => {
    const title = parseCustomTitle(name);
    if (!title) return;
    setSessions(prev => {
      const next = prev.map(s => (s.id === id ? { ...s, title, customTitle: true } : s));
      persistSessions(next);
      return next;
    });
  };

  const handleSignOut = async () => {
    chatSession.current?.abort();
    await logout();
    setIsAuthenticated(false);
  };

  const saveCurrentSession = useCallback((msgs: Message[]) => {
    if (msgs.length <= 1 && msgs[0]?.id === 'init') return;
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === currentSessionId);
      const existing = idx >= 0 ? prev[idx] : undefined;
      const { title, customTitle } = titleForSave(msgs, existing);
      const updated: Session = {
        id: currentSessionId,
        title,
        timestamp: Date.now(),
        messages: msgs,
        ...(customTitle ? { customTitle: true } : {}),
      };
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
    return () => { stopListen.current?.(); };
  }, []);

  const scrollToBottom = () => requestAnimationFrame(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; });

  const getSystemStateContext = () => {
    return `[SYSTEM STATE]\n- Current site/job: ${site.trim() ? `"${site.trim()}"` : '(not set)'}\n- Scratchpad notes: ${notes ? `"${notes.slice(0, 1000)}"` : 'empty'}\n[/SYSTEM STATE]`;
  };

  const appendMessage = (m: Message) => setMessages(prev => [...prev, m]);

  // Downscale on attach so large photos don't blow past the serverless body
  // limit (413) when sent to the AI. Falls back to the raw image if it fails.
  const attachImage = async (file: File) => {
    try { setAttachment({ base64: await downscaleImage(file), type: 'image/jpeg' }); }
    catch (err) {
      console.error('downscale failed', err);
      alert('Couldn’t read that image. Try a smaller JPEG or PNG.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { alert('Only image files are supported.'); return; }
      await attachImage(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await attachImage(file);
        break;
      }
    }
  };

  const opticalBudget = (a: Record<string, number | string>) => calcOptical({
    txPower: Number(a.txPower),
    rxSensitivity: Number(a.rxSensitivity),
    distance: Number(a.distance),
    wavelength: a.wavelength != null ? String(a.wavelength) : undefined,
    connectorCount: a.connectorCount != null ? Number(a.connectorCount) : undefined,
    spliceCount: a.spliceCount != null ? Number(a.spliceCount) : undefined,
  });

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  };

  const toggleListen = () => {
    if (listening) {
      stopListen.current?.();
      stopListen.current = null;
      setListening(false);
      return;
    }
    if (!canDictate()) return;
    const seed = input.replace(/\s+$/, '');
    setListening(true);
    stopListen.current = startDictation((text, done) => {
      setInput(text ? (seed ? seed + ' ' + text : text) : seed);
      if (done) {
        setListening(false);
        stopListen.current = null;
      }
    });
  };

  const processMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || isLoading) return;

    const currentAttachment = attachment;
    const rememberThis = rememberImage;
    setAttachment(null);
    setRememberImage(false);

    // Paste-to-remember: if the tech opted in, save the image to the Reference
    // images store (using their message as the caption) so it's queryable later.
    if (currentAttachment && rememberThis) {
      setImgSaveNote('Saving to Reference images…');
      ingestPhotoFromDataUrl(currentAttachment.base64, text.trim() || undefined, site.trim() || undefined)
        .then(() => setImgSaveNote('Saved to Reference images ✓'))
        .catch((err) => setImgSaveNote(`Couldn't save image: ${(err as Error).message}`))
        .finally(() => setTimeout(() => setImgSaveNote(null), 4000));
    }

    const userMsg: Message = {
      id: nid(), role: MessageRole.USER, text, timestamp: new Date(),
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

      const botMsgId = nid();
      streamingMsgId = botMsgId;
      const botMsg: Message = { id: botMsgId, role: MessageRole.MODEL, text: '', timestamp: new Date(), isStreaming: true };
      setMessages(prev => [...prev, botMsg]);

      let fullText = '';
      let msgSources: Message['sources'];
      const functionCalls: { id?: string; name: string; args: Record<string, unknown> }[] = [];
      for await (const chunk of result) {
        const c = chunk as StreamChunk;
        fullText += c.text || '';
        if (c.sources) msgSources = c.sources;
        if (c.functionCalls) c.functionCalls.forEach(fc => functionCalls.push(fc));
        setMessages(prev => prev.map(m => (m.id === botMsgId ? { ...m, text: fullText, sources: msgSources } : m)));
        scrollToBottom();
      }

      // Handle tool calls (loop for chained calls)
      let pending = functionCalls;
      let rounds = 0;
      let workingNotes = notesRef.current;
      while (pending.length > 0 && rounds++ < 5) {
        const toolResponses = [];
        for (const fc of pending) {
          const args = (fc.args || {}) as Record<string, unknown>;
          let toolResult = 'Done.';

          if (fc.name === 'set_alarm') {
            const { message, type, timeValue } = args as { message: string; type: string; timeValue: string };
            let target = 0, display = '';
            if (type === 'RELATIVE_MINUTES') {
              const mins = parseInt(timeValue, 10);
              if (Number.isFinite(mins) && mins > 0 && mins < 24 * 60) {
                target = Date.now() + mins * 60000;
                display = `in ${mins} minutes`;
              }
            } else if (type === 'ABSOLUTE_TIME') {
              const [h, m] = String(timeValue || '').split(':').map(Number);
              if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h < 24 && m >= 0 && m < 60) {
                const dt = new Date();
                dt.setHours(h, m, 0, 0);
                if (dt.getTime() < Date.now()) dt.setDate(dt.getDate() + 1);
                target = dt.getTime();
                display = `at ${timeValue}`;
              }
            }
            if (target > 0) {
              setReminders(prev => [...prev, { id: nid(), text: String(message || 'Reminder'), time: target, fired: false }].sort((a, b) => a.time - b.time));
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
          if (sc.sources) msgSources = sc.sources;
          if (sc.functionCalls) sc.functionCalls.forEach(fc => next.push(fc));
          setMessages(prev => prev.map(m => (m.id === botMsgId ? { ...m, text: fullText, sources: msgSources } : m)));
        }
        pending = next;
      }

      const completed: Message[] = [
        ...withUser,
        { ...botMsg, text: fullText, isStreaming: false, sources: msgSources },
      ];
      setMessages(completed);
      saveCurrentSession(completed);
      scrollToBottom();
    } catch (error: unknown) {
      if (error instanceof AuthError) { clearAuth(); setIsAuthenticated(false); setIsLoading(false); return; }
      console.error('AI API Error:', error);
      if (streamingMsgId) setMessages(prev => prev.map(m => (m.id === streamingMsgId ? { ...m, isStreaming: false } : m)));
      appendMessage({ id: nid(), role: MessageRole.SYSTEM, text: `Communication error. ${(error as Error)?.message || ''}`, timestamp: new Date() });
      checkAiHealth().then(h => setIsSystemOnline(h.ok && h.configured)).catch(() => setIsSystemOnline(false));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => { processMessage(input); };
  const handleExplainCommand = (cmd: string, ctx: string) => { setIsLibraryOpen(false); processMessage(`Explain the ${ctx} command: "${cmd}".`); };
  const handleSimulateCommand = (cmd: string, ctx: string) => { setIsLibraryOpen(false); processMessage(`Show simulated CLI output for the ${ctx} command: "${cmd}".`); };
  const handleHandover = () => {
    const where = site.trim() ? ` Site/job: ${site.trim()}.` : '';
    processMessage(`Draft a concise job handover I can paste into a ticket.${where} Use: site/asset, what was done, readings (before/after), outstanding, who to tell. Use only facts from this conversation and the scratchpad. If something is unknown, leave a blank.`);
  };

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const isFresh = messages.length <= 1 && messages[0]?.id === 'init' && !isLoading;

  return (
    <div className="min-h-screen lg:h-[100dvh] w-full flex flex-col lg:overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {activeAlarms.length > 0 && (
        <div className="bg-danger text-white text-[13px] font-semibold px-4 py-2.5 flex items-center gap-2" role="alert">
          <Bell size={14} className="shrink-0" />
          <span className="flex-1 truncate">
            {activeAlarms.length === 1 ? `Reminder: ${activeAlarms[0].text}` : `${activeAlarms.length} active reminders`}
          </span>
          <button onClick={() => handleDismissAlarm(activeAlarms[0].id)} className="opacity-80 hover:opacity-100" aria-label="Dismiss reminder"><X size={15} /></button>
        </div>
      )}
      {sessionSaveFailed && (
        <div className="bg-warn text-white text-[12px] font-semibold px-4 py-1.5 flex items-center gap-2" role="alert">
          <FileText size={12} /> Storage full — session history may not persist.
        </div>
      )}

      <header className="h-[60px] px-4 sm:px-6 flex items-center gap-3 sticky top-0 z-20"
        style={{ background: 'color-mix(in srgb, var(--app-bg) 72%, transparent)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid var(--line)' }}>
        <div className="w-9 h-9 rounded-[11px] grid place-items-center shrink-0 shadow-accent"
          style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
          <Activity size={18} className="text-white" strokeWidth={2.2} />
        </div>
        <div>
          <div className="font-bold text-[15.5px] tracking-[-0.35px] leading-none">Tech Assistant</div>
          <div className="text-[11px] text-faint mt-1 hidden sm:block">Desk &amp; field telecom</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setIsReminderOpen(true); setHasUnreadAlarm(false); }} className="icon-btn relative" aria-label="Reminders">
            <Bell size={16} />
            {hasUnreadAlarm && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" style={{ boxShadow: '0 0 0 2px var(--card-solid)' }} />}
          </button>
          <div className="hidden sm:inline-flex items-center gap-2 text-[12px] text-muted bg-card-solid/60 border border-line px-2.5 py-1.5 rounded-full">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isSystemOnline ? 'bg-ok' : 'bg-danger'}`}
              style={isSystemOnline ? { boxShadow: '0 0 8px var(--ok)', animation: 'pulse-dot 1.8s ease-in-out infinite' } : {}}
            />
            {isSystemOnline ? 'Online' : 'Offline'}
          </div>
          <button onClick={handleSignOut} className="icon-btn" aria-label="Sign out" title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <div
        ref={layoutRef}
        className={`flex-1 w-full p-3 sm:p-5 grid grid-cols-1 gap-4 lg:gap-0 min-h-0 ${isNotesOpen ? 'lg:grid-cols-[minmax(0,1fr)_16px_var(--rail-w)_16px_var(--notes-w)]' : 'lg:grid-cols-[minmax(0,1fr)_16px_var(--rail-w)]'}`}
        style={{ '--rail-w': `${shown.rail}px`, '--notes-w': `${shown.notes}px` } as React.CSSProperties}
      >
        <section className="glass-panel rounded-xl2 flex flex-col overflow-hidden min-h-[70vh] lg:min-h-0 min-w-0">
          <div ref={streamRef} role="log" aria-live="polite" aria-busy={isLoading} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 nice-scroll">
            {isFresh ? (
              <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-2">
                <div className="w-14 h-14 rounded-[18px] grid place-items-center mb-4 shadow-accent"
                  style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
                  <Activity size={26} className="text-white" strokeWidth={2.1} />
                </div>
                <h2 className="text-[22px] font-bold tracking-[-0.4px] mb-1.5">What are you working on?</h2>
                <p className="text-muted text-[13.5px] max-w-[380px] leading-relaxed mb-6">
                  Readings, CLI, nameplates, safety checks, or a report — paste a photo or start from a prompt.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-[520px]">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => processMessage(s)}
                      className="text-[12.5px] text-muted bg-card-2/80 border border-line hover:border-accent hover:text-ink px-3.5 py-2 rounded-full transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.filter(m => m.id !== 'init' || messages.length > 1).map(msg => (
                  <div key={msg.id} className={`msg-in flex gap-2.5 sm:gap-3 ${msg.role === MessageRole.USER ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-[10px] shrink-0 grid place-items-center ${
                      msg.role === MessageRole.USER ? 'bg-card-2 text-muted' : msg.role === MessageRole.SYSTEM ? 'bg-danger/15 text-danger' : 'text-accent'
                    }`} style={msg.role === MessageRole.MODEL ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : {}}>
                      {msg.role === MessageRole.USER
                        ? <User size={15} />
                        : msg.role === MessageRole.SYSTEM
                          ? <AlertTriangle size={15} />
                          : <Activity size={15} strokeWidth={2.3} />}
                    </div>
                    <div className={`relative max-w-[88%] sm:max-w-[84%] rounded-[18px] px-3.5 py-2.5 sm:px-4 sm:py-3 text-[13.5px] sm:text-[14.5px] leading-[1.55] ${
                      msg.role === MessageRole.USER ? 'text-white' : msg.role === MessageRole.SYSTEM ? 'bg-danger/10 border border-danger/20 text-danger' : 'bg-card-2/90 border border-line'
                    }`} style={msg.role === MessageRole.USER ? { background: 'linear-gradient(160deg, var(--accent-2), var(--accent) 70%)' } : {}}>
                      {msg.role === MessageRole.USER
                        ? <span className="whitespace-pre-wrap">{msg.text}{msg.images?.map((im, i) => <img key={i} src={im} alt="" className="mt-2 max-w-[220px] rounded-xl border border-white/20" />)}</span>
                        : <>
                            <MessageContent text={msg.text} isStreaming={msg.isStreaming} images={msg.images} />
                            {msg.role === MessageRole.MODEL && !msg.isStreaming && msg.sources && <SourcesPanel sources={msg.sources} />}
                            {msg.role === MessageRole.MODEL && !msg.isStreaming && msg.text && (
                              <button
                                onClick={() => copyMessage(msg.id, msg.text)}
                                className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-faint hover:text-accent"
                              >
                                {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                {copiedId === msg.id ? 'Copied' : 'Copy'}
                              </button>
                            )}
                          </>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 sm:p-4" style={{ borderTop: '1px solid var(--line)', background: 'color-mix(in srgb, var(--card-2) 35%, transparent)' }}>
            {attachment && (
              <div className="flex items-center gap-2.5 mb-2.5 text-[12.5px] text-muted flex-wrap">
                <img src={attachment.base64} alt="" className="w-11 h-11 rounded-xl object-cover border border-line" />
                <span>Image attached</span>
                <button onClick={() => { setAttachment(null); setRememberImage(false); }} className="text-faint hover:text-danger" aria-label="Remove attachment"><X size={14} /></button>
                <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none hover:text-ink transition-colors" title="Save this image to Reference images so you can ask about it in future chats">
                  <input type="checkbox" checked={rememberImage} onChange={e => setRememberImage(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer" />
                  <ImageIcon size={13} /> Remember
                </label>
              </div>
            )}
            {imgSaveNote && (
              <div className="mb-2 text-[12px] text-muted flex items-center gap-1.5">
                <ImageIcon size={13} className="text-accent" /> {imgSaveNote}
              </div>
            )}
            <div className="flex items-end gap-2 bg-card-solid border border-line-strong rounded-[18px] pl-2 pr-1.5 py-1.5 focus-ring transition-shadow">
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl text-muted hover:text-accent hover:bg-card-2 transition-colors" aria-label="Attach image"><Paperclip size={18} /></button>
              {canDictate() && (
                <button
                  onClick={toggleListen}
                  className={`p-2.5 rounded-xl transition-colors ${listening ? 'text-danger bg-danger/10' : 'text-muted hover:text-accent hover:bg-card-2'}`}
                  aria-label={listening ? 'Stop dictation' : 'Dictate'}
                  title={listening ? 'Listening… tap to stop' : 'Dictate'}
                >
                  <Mic size={18} />
                </button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
              <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()} onPaste={handlePaste}
                placeholder="Ask anything, or paste a photo / logs…" aria-label="Message the assistant" disabled={isLoading}
                className="flex-1 bg-transparent border-0 outline-none text-ink placeholder:text-faint text-[15px] py-2.5 min-w-0"
              />
              <button onClick={handleSend} disabled={(!input.trim() && !attachment) || isLoading} aria-label="Send"
                className="w-11 h-11 grid place-items-center rounded-[14px] text-white shadow-accent disabled:opacity-35 disabled:shadow-none transition-all hover:enabled:brightness-105"
                style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
                {isLoading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </div>
          </div>
        </section>

        <ColumnSplitter
          label="Resize chat and tools"
          value={shown.rail}
          min={railBound.min}
          max={railBound.max}
          controls="tools-rail"
          onChange={(rail) => updateLayout({ rail })}
        />

        <aside id="tools-rail" className="flex flex-col gap-3.5 min-w-0">
          <SessionList
            sessions={sessions}
            currentId={currentSessionId}
            onOpen={openSession}
            onNew={newChat}
            onDelete={deleteSession}
            onRename={renameSession}
          />
          <div className="glass-panel rounded-xl2 p-3">
            <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold px-2 mb-1.5">On site</h3>
            <label className="flex items-center gap-2 mx-1 mb-3 bg-card-2 border border-line rounded-xl px-2.5 py-2 focus-ring">
              <MapPin size={14} className="text-faint shrink-0" />
              <input
                value={site}
                onChange={e => saveSite(e.target.value)}
                placeholder="Site / asset ID"
                aria-label="Current site or asset"
                className="flex-1 bg-transparent outline-none text-[13.5px] text-ink placeholder:text-faint min-w-0"
              />
            </label>
            <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold px-2 mb-1">Tools</h3>
            <button onClick={() => setIsKitOpen(true)} className="tool-row">
              <span className="tool-well"><Calculator size={15} /></span>
              <span className="flex-1">Field kit</span>
              <span className="text-[10.5px] text-faint">offline</span>
              <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={handleHandover} className="tool-row" disabled={isLoading}>
              <span className="tool-well"><ClipboardList size={15} /></span>
              <span className="flex-1">Draft handover</span>
              <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={() => setIsLibraryOpen(true)} className="tool-row">
              <span className="tool-well"><BookOpen size={15} /></span>
              <span className="flex-1">Command library</span>
              <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={() => setIsManualsOpen(true)} className="tool-row">
              <span className="tool-well"><BookText size={15} /></span>
              <span className="flex-1">Manuals &amp; guides</span>
              <ChevronRight size={15} className="text-faint" />
            </button>
            <button onClick={() => setIsPhotosOpen(true)} className="tool-row">
              <span className="tool-well"><ImageIcon size={15} /></span>
              <span className="flex-1">Reference images</span>
              <ChevronRight size={15} className="text-faint" />
            </button>
            <button
              onClick={() => setIsNotesOpen(open => !open)}
              className={`tool-row ${isNotesOpen ? 'bg-card-2 text-accent' : ''}`}
              aria-expanded={isNotesOpen}
              aria-controls="scratchpad-panel"
            >
              <span className="tool-well"><StickyNote size={15} /></span>
              <span className="flex-1">Scratchpad</span>
              {notes && <span className="text-[11px] text-faint">{notes.length}</span>}
              {isNotesOpen ? <X size={15} className="text-faint" /> : <ChevronRight size={15} className="text-faint" />}
            </button>
          </div>
        </aside>

        {isNotesOpen && (
          <ColumnSplitter
            label="Resize scratchpad"
            value={shown.notes}
            min={notesBound.min}
            max={notesBound.max}
            controls="scratchpad-panel"
            onChange={(notes) => updateLayout({ notes })}
          />
        )}

        {isNotesOpen && (
          <aside
            id="scratchpad-panel"
            aria-label="Scratchpad"
            className="glass-panel rounded-xl2 p-4 flex flex-col min-h-[240px] min-w-0 lg:min-h-0
              max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-[min(22rem,86vw)] max-lg:rounded-none max-lg:border-y-0 max-lg:border-r-0"
            style={{ animation: 'dock-in .22s cubic-bezier(.32,.85,.35,1) both' }}
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-[15px] font-bold flex items-center gap-2"><StickyNote size={16} className="text-accent" /> Scratchpad</h3>
              <button onClick={() => setIsNotesOpen(false)} className="icon-btn" aria-label="Close notes"><X size={16} /></button>
            </div>
            <textarea value={notes} onChange={e => handleNotesChange(e.target.value)} placeholder="Jot down anything…"
              className="flex-1 min-h-[12rem] lg:min-h-0 w-full resize-none bg-card-2 border border-line rounded-xl p-3.5 text-[14px] text-ink outline-none focus-ring transition-shadow placeholder:text-faint" />
            <p className="text-[11.5px] text-faint mt-2.5 shrink-0">The assistant can read and update these notes.</p>
          </aside>
        )}
      </div>

      {isLibraryOpen && <CommandLibraryModal onClose={() => setIsLibraryOpen(false)} onExplainCommand={handleExplainCommand} onSimulateCommand={handleSimulateCommand} />}
      {isManualsOpen && <Suspense fallback={null}><ManualsModal onClose={() => setIsManualsOpen(false)} /></Suspense>}
      {isPhotosOpen && <Suspense fallback={null}><PhotosModal onClose={() => setIsPhotosOpen(false)} /></Suspense>}
      {isReminderOpen && <ReminderModal reminders={reminders} onClose={() => setIsReminderOpen(false)} onAdd={(r) => setReminders(prev => [...prev, r].sort((a, b) => a.time - b.time))} onDelete={handleDismissAlarm} />}
      {isKitOpen && <FieldKitModal onClose={() => setIsKitOpen(false)} />}
    </div>
  );
};

export default App;
