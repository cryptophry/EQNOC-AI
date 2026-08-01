import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChatSession, findRelevantHistory, generateShiftHandover, generateTroubleshootingFlow, checkAiHealth, StreamChunk, isAuthenticated as hasAuthToken, clearAuth, AuthError } from './services/ai';
import { Message, MessageRole, TriageStatus, FlowNode, Session, ActivityItem } from './types';
import { Send, Bot, User, Activity, Wifi, LayoutDashboard, BrainCircuit, GitBranch, Loader2, ScanSearch, Paperclip, X, ClipboardList, Lightbulb, Terminal, Bell, AlertTriangle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CommandPanel from './components/CommandPanel';
import MessageContent from './components/MessageContent';
import NetworkTools from './components/NetworkTools';
import DiagnosticGrid from './components/DiagnosticGrid';
import FaultAssistant from './components/FaultAssistant';
import LogAnalyzer from './components/LogAnalyzer';
import ShiftHandoverDashboard from './components/ShiftHandoverDashboard';
import ReminderModal, { Reminder } from './components/ReminderModal';
import LoginScreen from './components/LoginScreen';
import CommandLibraryModal from './components/CommandLibraryModal';
import { playAlertSound } from './utils/audio';
import { useResizablePanels } from './hooks/useResizablePanels';

const App: React.FC = () => {
  // Authentication State — start authenticated if a stored token exists;
  // an expired/invalid token surfaces as a 401 on the first AI call and bounces back to login.
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasAuthToken());

  const [triageStatus, setTriageStatus] = useState<TriageStatus>('pending');
  const [leftPanelMode, setLeftPanelMode] = useState<'DASHBOARD' | 'FAULT_ASSIST' | 'LOGS' | 'HANDOVER'>('DASHBOARD');

  // Resizable panel layout (splits, minimized flags, persistence, drag handling)
  const {
    leftPanelWidth,
    dashboardSplitV,
    dashboardSplitH,
    activeResizer, setActiveResizer,
    isDiagnosticMinimized, setIsDiagnosticMinimized,
    isCommandPanelMinimized, setIsCommandPanelMinimized,
  } = useResizablePanels();

  // State for active diagnostic module (filtering commands)
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  
  // State for NetworkTools active tab control
  const [networkToolTab, setNetworkToolTab] = useState('notes');

  // Persistent State for Tools
  const [persistentLogs, setPersistentLogs] = useState('');
  const [logAnalysisResult, setLogAnalysisResult] = useState<string | null>(null); // New: Store X-Ray result for AI context
  
  // Notes State (Lifted)
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem('eqnoc_notes') || ''; } catch { return ''; }
  });

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    try { localStorage.setItem('eqnoc_notes', newNotes); } catch {}
  };

  // Refs mirror the latest notes/sessions so async tool handlers read current
  // values instead of the ones captured when processMessage was invoked.
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  const [faultAssistantState, setFaultAssistantState] = useState<{input: string, tree: FlowNode | null}>({
    input: '',
    tree: null
  });
  const [isFaultAnalysisLoading, setIsFaultAnalysisLoading] = useState(false); // Track loading state for FaultAssistant

  const [shiftState, setShiftState] = useState<{
    report: string;
    reportTitle: string;
    activeCardId: string | null;
    smartCache: Record<string, { timestamp: number, items: ActivityItem[] }>;
    deletedIds: string[];
  }>({
    report: '',
    reportTitle: 'GENERATED REPORT',
    activeCardId: null,
    smartCache: {},
    deletedIds: []
  });

  // Global Shift Timer
  const [shiftStartTime, setShiftStartTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('eqnoc_shift_start');
      const parsed = saved ? parseInt(saved, 10) : NaN;
      return isNaN(parsed) ? 0 : parsed;
    } catch {
      return 0;
    }
  });

  const handleShiftReset = () => {
    const now = Date.now();
    setShiftStartTime(now);
    try { localStorage.setItem('eqnoc_shift_start', now.toString()); } catch {}
    
    // Clear shift state
    setShiftState({
        report: '',
        reportTitle: 'GENERATED REPORT',
        activeCardId: null,
        smartCache: {},
        deletedIds: []
    });
  };

  const handleSimulateShift = () => {
    const now = Date.now();
    // Rewind shift start by 4 hours to make the mock data appear "within shift"
    const newStart = now - (4 * 60 * 60 * 1000);
    setShiftStartTime(newStart);
    
    // Create mock sessions
    const mockSessions: Session[] = [
        {
            id: 'mock-1',
            title: 'Core Router BGP Flap',
            timestamp: now - (1000 * 60 * 120), // 2 hours ago
            messages: [
                { id: 'm1', role: MessageRole.USER, text: 'Alert: BGP neighbor 10.1.1.1 is down on Core-A.', timestamp: new Date(now - (1000 * 60 * 120)) },
                { id: 'm2', role: MessageRole.MODEL, text: 'Checking logs. Found hold timer expired. Interface Gi0/0/1 has errors.', timestamp: new Date(now - (1000 * 60 * 119)) },
                { id: 'm3', role: MessageRole.USER, text: 'Resetting interface counters and bouncing BGP peer.', timestamp: new Date(now - (1000 * 60 * 118)) },
                { id: 'm4', role: MessageRole.MODEL, text: 'BGP session established. Adjacency is Up. Issue resolved.', timestamp: new Date(now - (1000 * 60 * 115)) }
            ]
        },
        {
            id: 'mock-2',
            title: 'Optical High Loss Link B',
            timestamp: now - (1000 * 60 * 30), // 30 mins ago
            messages: [
                { id: 'm5', role: MessageRole.USER, text: 'Alert: High optical loss on Link B to Distribution-South.', timestamp: new Date(now - (1000 * 60 * 30)) },
                { id: 'm6', role: MessageRole.MODEL, text: 'Current Rx power is -28dBm. Threshold is -27dBm. Recommend cleaning fibers.', timestamp: new Date(now - (1000 * 60 * 29)) },
                { id: 'm7', role: MessageRole.USER, text: 'Field tech dispatched to site. Ticket #INC12345 raised. Monitoring.', timestamp: new Date(now - (1000 * 60 * 25)) }
            ]
        },
        {
            id: 'mock-3',
            title: 'Routine Health Check',
            timestamp: now - (1000 * 60 * 200), // 3.5 hours ago
            messages: [
                { id: 'm8', role: MessageRole.USER, text: 'Perform routine morning health check on Core Network.', timestamp: new Date(now - (1000 * 60 * 200)) },
                { id: 'm9', role: MessageRole.MODEL, text: 'Scanning... All core links nominal. No active alarms. CPU usage normal.', timestamp: new Date(now - (1000 * 60 * 199)) }
            ]
        }
    ];

    setSessions(mockSessions);
    // Switch view to Handover so user sees the change
    setLeftPanelMode('HANDOVER');
  };

  // Reminders / Alarms
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    try { return JSON.parse(localStorage.getItem('eqnoc_reminders') || '[]'); } catch { return []; }
  });
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [hasUnreadAlarm, setHasUnreadAlarm] = useState(false);

  // Computed active alarms for banner
  const activeAlarms = reminders.filter(r => r.fired);

  useEffect(() => {
    try { localStorage.setItem('eqnoc_reminders', JSON.stringify(reminders)); } catch (e) { console.warn('Failed to save reminders', e); }
  }, [reminders]);

  useEffect(() => {
    const interval = setInterval(() => {
        const now = Date.now();
        let changed = false;
        const updated = reminders.map(r => {
            if (!r.fired && r.time <= now) {
                changed = true;
                return { ...r, fired: true };
            }
            return r;
        });

        if (changed) {
            setReminders(updated);
            setHasUnreadAlarm(true);
            playAlertSound();
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [reminders]);

  const handleDismissAlarm = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  // Session Management
  const [sessions, setSessions] = useState<Session[]>([]);
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Date.now().toString());
  
  // RAG State
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [ragContext, setRagContext] = useState<boolean>(false); // Visual indicator

  // Command Library Modal State
  const [isCommandLibraryOpen, setIsCommandLibraryOpen] = useState(false);

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
  
  const chatSession = useRef<any>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('eqnoc_sessions');
      if (saved) {
        const parsed: Session[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            const revived = parsed.map(s => ({
              ...s,
              messages: s.messages.map(m => ({
                ...m,
                timestamp: new Date(m.timestamp)
              }))
            }));
            setSessions(revived);
        }
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  }, []);

  // Strip base64 images before persisting — a couple of pasted screenshots
  // otherwise blow the ~5MB localStorage quota and silently kill ALL session
  // saving. Images stay in memory for the current view; they're transient.
  const persistSessions = (list: Session[]): boolean => {
    const lean = list.map(s => ({
      ...s,
      messages: s.messages.map(m => (m.images ? { ...m, images: undefined } : m)),
    }));
    try {
      localStorage.setItem('eqnoc_sessions', JSON.stringify(lean));
      return true;
    } catch (e) {
      console.warn('Session save failed (storage quota?)', e);
      return false;
    }
  };

  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);

  // Save Session logic
  const saveCurrentSession = useCallback((msgs: Message[]) => {
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
        };

        let newSessions;
        if (existingIdx >= 0) {
            newSessions = [...prev];
            newSessions[existingIdx] = updatedSession;
        } else {
            newSessions = [updatedSession, ...prev];
        }
        setSessionSaveFailed(!persistSessions(newSessions));
        return newSessions;
      });
  }, [currentSessionId]);

  // ONLINE indicator now reflects whether the /api/ai proxy is configured.
  const [isSystemOnline, setIsSystemOnline] = useState(false);
  useEffect(() => {
    checkAiHealth().then(h => setIsSystemOnline(h.ok && h.configured));
  }, []);

  useEffect(() => {
    try {
      chatSession.current = createChatSession();
    } catch (e) {
      console.error("Failed to init chat", e);
    }
  }, []);

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          try {
            const base64 = await convertFileToBase64(file);
            setAttachment({ base64, type: file.type });
          } catch (err) {
            console.error("Paste failed", err);
          }
        }
        break; // Only take the first image
      }
    }
  };

  const getSystemStateContext = () => {
    const shiftDiff = Math.max(0, Date.now() - shiftStartTime);
    const shiftHours = shiftStartTime === 0 ? 0 : Math.floor(shiftDiff / (1000 * 60 * 60));
    const activeIncidents: ActivityItem[] = [];
    Object.values(shiftState.smartCache).forEach((cache: any) => {
        if (cache.items) {
            cache.items.forEach((item: ActivityItem) => {
                if (!shiftState.deletedIds.includes(item.uniqueId)) {
                    activeIncidents.push(item);
                }
            });
        }
    });

    let incidentContext = "No active shift incidents.";
    if (activeIncidents.length > 0) {
        incidentContext = activeIncidents.map((inc) => 
            `- ID: ${inc.uniqueId} | Title: ${inc.text} | Status: ${inc.status}`
        ).join('\n');
    }

    return `
[SYSTEM STATE START]
- **Current View:** ${leftPanelMode}
- **Active Diagnostic Module:** ${activeModuleId || 'None'}
- **Shift Duration:** ${shiftHours} hours
**SHIFT INCIDENTS (Active):**
${incidentContext}
- **Log Analyzer:** ${persistentLogs.length > 0 ? `${persistentLogs.length} chars loaded` : 'Empty'}
- **Scratchpad Notes:** ${notes ? `(Contains ${notes.length} chars)\nContent: "${notes.substring(0, 1000)}..."` : 'Empty'}
${logAnalysisResult ? `**LATEST X-RAY ANALYSIS FINDINGS (User can see this):**\n${logAnalysisResult}` : ''}
[SYSTEM STATE END]
`;
  };

  const processMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || isLoading) return;
    if (triageStatus === 'pending') setTriageStatus('active');

    const currentAttachment = attachment;
    setAttachment(null);
    setRagContext(false);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      text: text,
      timestamp: new Date(),
      images: currentAttachment ? [currentAttachment.base64] : undefined
    };

    const newMessages = [userMsg, ...messages];
    setMessages(newMessages);
    saveCurrentSession(newMessages);

    setInput('');
    setIsLoading(true);

    requestAnimationFrame(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = 0;
    });

    let streamingMsgId: string | null = null;
    try {
      if (!chatSession.current) {
          chatSession.current = createChatSession();
      }
      
      let relevantHistory = '';
      if (!currentAttachment) {
          setIsRetrieving(true);
          const historyText = await findRelevantHistory(text, sessions.filter(s => s.id !== currentSessionId));
          if (historyText) {
              relevantHistory = historyText;
              setRagContext(true);
          }
          setIsRetrieving(false);
      }

      const systemContext = getSystemStateContext();
      const finalPrompt = `${systemContext}\n\n${relevantHistory}\n\nUser Query: ${text}`;

      let result;
      if (currentAttachment) {
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
      streamingMsgId = botMsgId;
      const botMsg: Message = {
        id: botMsgId,
        role: MessageRole.MODEL,
        text: '',
        timestamp: new Date(),
        isStreaming: true
      };

      setMessages(prev => [botMsg, ...prev]);
      
      let fullText = '';
      const groundingMetadata: any = null;
      const functionCalls: any[] = [];

      // Exhaust stream first to ensure the Model turn is recorded in history
      for await (const chunk of result) {
        const c = chunk as StreamChunk;

        const chunkText = c.text || '';
        fullText += chunkText;

        // Accumulate function calls from ANY chunk
        if (c.functionCalls) {
            c.functionCalls.forEach(fc => {
                functionCalls.push(fc);
            });
        }

        setMessages(prev => prev.map(m => 
          m.id === botMsgId ? { ...m, text: fullText, groundingMetadata } : m
        ));
      }

      // Process function calls — loop so chained tool calls (the model issuing
      // another tool call in response to a tool result) are all handled. Without
      // this loop the assistant's tool_calls turn is left without matching tool
      // responses and every subsequent request is rejected by the API.
      let pendingCalls = functionCalls;
      let toolRounds = 0;
      let workingNotes = notesRef.current;
      while (pendingCalls.length > 0 && toolRounds++ < 5) {
            const toolResponses = [];

            for (const fc of pendingCalls) {
                const args = fc.args;
                let toolResult: any = "Action failed";

                if (fc.name === 'manage_incident') {
                    const { incidentId, action } = args as any;
                    if (action === 'DELETE') {
                        setShiftState(prev => ({ ...prev, deletedIds: [...prev.deletedIds, incidentId] }));
                        toolResult = `Incident ${incidentId} deleted.`;
                    } else {
                        setShiftState(prev => {
                            const newCache = { ...prev.smartCache };
                            for (const key in newCache) {
                                const items = newCache[key].items;
                                const idx = items.findIndex(i => i.uniqueId === incidentId);
                                if (idx !== -1) {
                                    const newItems = [...items];
                                    newItems[idx] = { ...newItems[idx], status: action };
                                    newCache[key] = { ...newCache[key], items: newItems };
                                    break;
                                }
                            }
                            return { ...prev, smartCache: newCache };
                        });
                        toolResult = `Incident ${incidentId} status updated to ${action}.`;
                    }
                } else if (fc.name === 'generate_shift_report') {
                    const recentSessions = sessionsRef.current.filter(s => s.timestamp >= shiftStartTime).sort((a, b) => b.timestamp - a.timestamp);
                    if (recentSessions.length === 0) {
                        toolResult = "No active sessions in shift.";
                    } else {
                        setLeftPanelMode('HANDOVER');
                        try {
                          const reportText = await generateShiftHandover(recentSessions);
                          setShiftState(prev => ({ ...prev, report: reportText, reportTitle: 'GLOBAL SHIFT HANDOVER', activeCardId: null }));
                          toolResult = "Global report generated and displayed in the SHIFT dashboard.";
                        } catch (e) { toolResult = "Failed to generate report text."; }
                    }
                } else if (fc.name === 'start_triage_flow') {
                    const { faultDescription } = args as any;
                    setLeftPanelMode('FAULT_ASSIST');
                    setFaultAssistantState({ input: faultDescription, tree: null });
                    setIsFaultAnalysisLoading(true); // START LOADING
                    
                    try {
                        const flowResult = await generateTroubleshootingFlow(faultDescription);
                        setFaultAssistantState({ input: faultDescription, tree: flowResult });
                        toolResult = `Technical triage flow visualized for: "${faultDescription}". TRIAGE dashboard is now open.`;
                    } catch (e) { 
                        toolResult = "Failed to generate visual triage flow."; 
                    } finally {
                        setIsFaultAnalysisLoading(false); // STOP LOADING
                    }
                } else if (fc.name === 'start_new_shift') {
                    handleShiftReset();
                    setLeftPanelMode('HANDOVER');
                    toolResult = "New shift started. Timer reset and logs cleared.";
                } else if (fc.name === 'set_alarm') {
                    const { message, type, timeValue } = args as any;
                    let targetTime = 0;
                    let displayTime = '';

                    if (type === 'RELATIVE_MINUTES') {
                        const mins = parseInt(timeValue, 10);
                        targetTime = Date.now() + (mins * 60 * 1000);
                        displayTime = `in ${mins} minutes`;
                    } else if (type === 'ABSOLUTE_TIME') {
                        const [h, m] = timeValue.split(':').map(Number);
                        const date = new Date();
                        date.setHours(h, m, 0, 0);
                        if (date.getTime() < Date.now()) {
                            date.setDate(date.getDate() + 1); // Assume tomorrow if time passed
                        }
                        targetTime = date.getTime();
                        displayTime = `at ${timeValue}`;
                    }

                    if (targetTime > 0) {
                        const newReminder: Reminder = {
                            id: Date.now().toString(),
                            text: message,
                            time: targetTime,
                            fired: false
                        };
                        setReminders(prev => [...prev, newReminder].sort((a, b) => a.time - b.time));
                        toolResult = `Alarm successfully set for "${message}" ${displayTime}.`;
                        setHasUnreadAlarm(true); // Flash the bell to indicate success
                    } else {
                        toolResult = "Failed to parse time for alarm.";
                    }
                } else if (fc.name === 'calculate_optical_budget') {
                    const { txPower, rxSensitivity, distance, wavelength = '1310', connectorCount = 2, spliceCount = 2, safetyMargin = 3 } = args as any;
                    
                    let attenuation = 0.35;
                    if (wavelength === '1550') attenuation = 0.25;
                    if (wavelength === '850') attenuation = 3.0;

                    const fiberLoss = distance * attenuation;
                    const passiveLoss = (connectorCount * 0.5) + (spliceCount * 0.1);
                    const totalLoss = fiberLoss + passiveLoss;
                    const estRx = txPower - totalLoss;
                    const margin = estRx - rxSensitivity - safetyMargin;
                    
                    const result = {
                        fiberLoss: fiberLoss.toFixed(2),
                        passiveLoss: passiveLoss.toFixed(2),
                        totalLinkLoss: totalLoss.toFixed(2),
                        estimatedRxPower: estRx.toFixed(2),
                        margin: margin.toFixed(2),
                        status: margin >= 0 ? 'PASS' : 'FAIL',
                        wavelength,
                        distance
                    };
                    
                    // Switch UI to Dashboard and Optical Tab
                    setLeftPanelMode('DASHBOARD');
                    setNetworkToolTab('optical');
                    
                    toolResult = JSON.stringify(result);
                } else if (fc.name === 'update_notes') {
                    const { content, mode = 'APPEND' } = args as any;
                    // Accumulate across repeated update_notes calls in one response
                    // (workingNotes carries the running value; notesRef seeds it).
                    if (mode === 'OVERWRITE') {
                        workingNotes = content;
                    } else {
                        workingNotes = (workingNotes + '\n' + content).trim();
                    }
                    handleNotesChange(workingNotes);

                    // Switch view to Dashboard -> Notes so user sees it
                    setLeftPanelMode('DASHBOARD');
                    setNetworkToolTab('notes');

                    toolResult = `Notes updated successfully. Current size: ${workingNotes.length} chars.`;
                }

                const functionResponse: any = {
                    name: fc.name,
                    response: { result: toolResult }
                };
                if (fc.id) {
                    functionResponse.id = fc.id;
                }
                toolResponses.push({ functionResponse });
            }

            // Send tool responses and read the follow-up stream, collecting any
            // further tool calls to handle on the next loop iteration.
            const resStream = await chatSession.current.sendMessageStream({ message: toolResponses });

            const nextCalls: any[] = [];
            for await (const subChunk of resStream) {
                const sc = subChunk as StreamChunk;
                fullText += sc.text || '';
                if (sc.functionCalls) sc.functionCalls.forEach(fc => nextCalls.push(fc));
                setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: fullText } : m));
            }
            pendingCalls = nextCalls;
      }

      const completedMessages = [{ ...botMsg, text: fullText, isStreaming: false, groundingMetadata }, userMsg, ...messages];
      setMessages(completedMessages);
      saveCurrentSession(completedMessages);

    } catch (error: any) {
      // An expired/invalid token bounces the operator back to the login screen.
      if (error instanceof AuthError) {
        clearAuth();
        setIsAuthenticated(false);
        setIsRetrieving(false);
        setIsLoading(false);
        return;
      }
      console.error("AI API Error:", error);
      // Clear the stuck "streaming" indicator on any partial bot message.
      if (streamingMsgId) {
        setMessages(prev => prev.map(m => m.id === streamingMsgId ? { ...m, isStreaming: false } : m));
      }
      setMessages(prev => [{
        id: Date.now().toString(),
        role: MessageRole.SYSTEM,
        text: `Communication protocol error. Check network and API configuration. Details: ${error?.message || String(error)}`,
        timestamp: new Date()
      }, ...prev]);
      setIsRetrieving(false);
      // A failed call may mean the proxy went down — re-check the ONLINE badge.
      checkAiHealth().then(h => setIsSystemOnline(h.ok && h.configured)).catch(() => setIsSystemOnline(false));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    processMessage(input);
    setInput('');
  };

  const handleDiagnosticClick = (id: string, title: string) => {
     setActiveModuleId(prev => prev === id ? null : id);
     processMessage(`Initiate diagnostic sequence for ${title}.`);
  };

  const handleExplainCommand = (cmd: string, context: string) => {
    setIsCommandLibraryOpen(false); // Close library if open
    processMessage(`Explain the ${context} command: "${cmd}".`);
  };

  const handleSimulateCommand = (cmd: string, context: string) => {
    setIsCommandLibraryOpen(false); // Close library if open
    processMessage(`Simulate CLI output for ${context} command: "${cmd}".`);
  };

  const handleFaultNodeClick = (node: FlowNode) => {
    processMessage(`Explain troubleshooting step "${node.title}": ${node.description || ''}`);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  const renderChatInterface = () => (
    <div className={`flex flex-col h-full bg-slate-950/50 relative border-l border-slate-800 transition-colors duration-500 ${isLoading ? 'thinking-state' : ''}`}>
        <div className="h-14 border-b border-slate-800/50 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm shrink-0">
        <h2 className="text-slate-300 font-bold text-sm flex items-center gap-2 tracking-wide">
            <BrainCircuit size={18} className="text-cyan-500" /> 
            ASSISTANT LOG
        </h2>
        
        <div className="flex items-center gap-2">
            {ragContext && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 animate-in fade-in zoom-in">
                    <Lightbulb size={12} className="text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Memory Active</span>
                </div>
            )}
        </div>
        </div>

        <div className="flex-1 overflow-hidden relative flex flex-col">
        <div ref={chatContainerRef} role="log" aria-live="polite" aria-label="Assistant conversation" aria-busy={isLoading} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide flex flex-col">
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
        
        <div className="p-4 bg-slate-900/50 border-t border-slate-800 backdrop-blur-md shrink-0">
             {attachment && (
                 <div className="mb-3 flex items-center gap-3 bg-slate-900/80 border border-slate-700 rounded-lg p-2 animate-in slide-in-from-bottom-2">
                     <div className="relative group">
                         <img src={attachment.base64} alt="Preview" className="h-16 w-16 object-cover rounded-md border border-slate-600" />
                         <button onClick={() => setAttachment(null)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600"><X size={12} /></button>
                     </div>
                     <div className="flex-1">
                         <div className="text-xs font-bold text-cyan-400">OPTICAL RECON READY</div>
                         <div className="text-[10px] text-slate-500 font-mono">Image attached for analysis</div>
                     </div>
                 </div>
             )}
            <div className="flex items-center gap-3 bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 transition-all focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 shadow-lg">
                <button onClick={() => fileInputRef.current?.click()} aria-label="Upload image" className="p-2.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors" title="Upload Image"><Paperclip size={20} /></button>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} onPaste={handlePaste} placeholder="Type query..." aria-label="Message the assistant" disabled={isLoading} className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-500 text-base h-full" />
                <button onClick={handleSendMessage} aria-label="Send message" disabled={(!input.trim() && !attachment) || isLoading} className="p-2.5 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 transition-colors"><Send size={20} /></button>
            </div>
            {isRetrieving && <div className="absolute top-0 right-4 -mt-3 text-[10px] text-indigo-400 flex items-center gap-1 font-mono"><Loader2 size={8} className="animate-spin" /> Recalling...</div>}
        </div>
        </div>
    </div>
  );

  return (
    <div className={`h-screen overflow-hidden bg-slate-950 text-gray-100 font-sans flex flex-col selection:bg-cyan-500/30 ${activeResizer ? 'select-none pointer-events-auto' : ''}`}>
      <div className="scanlines"></div>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 25s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* ACTIVE ALARM BANNER (SCROLLING) */}
      {activeAlarms.length > 0 && (
         <div className="bg-red-600 text-white text-xs font-bold font-mono py-1 overflow-hidden relative z-50 shadow-[0_0_20px_rgba(220,38,38,0.5)] border-b border-red-400/50">
            <div className="animate-marquee whitespace-nowrap flex gap-12 px-4 items-center cursor-pointer">
               {/* Loop active alarms to create ticker content */}
               {activeAlarms.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => handleDismissAlarm(a.id)}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    title="Click to dismiss"
                  >
                     <AlertTriangle size={14} className="fill-white text-red-600 animate-pulse" />
                     <span className="tracking-widest">CRITICAL REMINDER:</span> 
                     <span className="text-white">{a.text.toUpperCase()}</span>
                     <span className="opacity-70">[{new Date(a.time).toLocaleTimeString()}]</span>
                  </div>
               ))}
               {/* Duplicate for visual continuity if list is short */}
               {activeAlarms.length < 3 && activeAlarms.map((a) => (
                  <div
                    key={`dup-${a.id}`}
                    onClick={() => handleDismissAlarm(a.id)}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    title="Click to dismiss"
                  >
                     <AlertTriangle size={14} className="fill-white text-red-600 animate-pulse" />
                     <span className="tracking-widest">CRITICAL REMINDER:</span> 
                     <span className="text-white">{a.text.toUpperCase()}</span>
                     <span className="opacity-70">[{new Date(a.time).toLocaleTimeString()}]</span>
                  </div>
               ))}
            </div>
         </div>
      )}

      {sessionSaveFailed && (
        <div className="bg-amber-600/90 text-white text-[11px] font-mono font-bold py-1 px-4 z-50 flex items-center gap-2" role="alert">
          <AlertTriangle size={12} className="shrink-0" />
          Session history couldn't be saved (storage full). Older sessions may not persist — export anything important.
        </div>
      )}

      <header className={`h-16 backdrop-blur-md border-b flex items-center justify-between px-6 z-20 sticky top-0 shrink-0 transition-colors duration-500 bg-slate-950/80 border-slate-800/50`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all duration-500 bg-cyan-500/10 border-cyan-500/20 text-cyan-400`}>
             <Activity size={20} />
          </div>
          <h1 className="font-display text-xl font-bold tracking-wide text-white">EQNOC <span className={`font-normal transition-colors duration-500 text-cyan-400`}>AI</span></h1>
        </div>
        <div className="flex items-center gap-4">
           {/* ALARM BUTTON - EXPANDING VARIANT */}
           <button 
             onClick={() => { setIsReminderOpen(true); setHasUnreadAlarm(false); }} 
             className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500 text-xs font-bold overflow-hidden whitespace-nowrap
                ${activeAlarms.length > 0
                  ? 'bg-red-600 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse w-auto max-w-[300px] hover:bg-red-500' 
                  : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 w-auto'
                }
             `}
           >
             <Bell size={14} className={activeAlarms.length > 0 ? 'animate-bounce shrink-0' : 'shrink-0'} />
             {activeAlarms.length > 0 ? (
                 <span className="truncate">
                    {activeAlarms.length === 1
                      ? `ALERT: ${activeAlarms[0].text}`
                      : `${activeAlarms.length} ACTIVE ALARMS`
                    }
                 </span>
             ) : (
                 <span className="hidden sm:inline">ALARMS</span>
             )}
             {reminders.filter(r => !r.fired).length > 0 && activeAlarms.length === 0 && (
                <span className="ml-1 text-[9px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">{reminders.filter(r => !r.fired).length}</span>
             )}
           </button>

           <button onClick={() => setIsCommandLibraryOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900/50 hover:bg-slate-800 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-400 transition-all text-xs font-bold"><Terminal size={14} /><span className="hidden sm:inline">COMMANDS</span></button>
           
          <div className={`flex items-center gap-2 text-xs font-mono font-bold px-3 py-1.5 rounded-full border transition-all ${isSystemOnline ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.1)]' : 'bg-red-900/10 text-red-500 border-red-900/30'}`}>
            <Wifi size={14} /> {isSystemOnline ? 'SYSTEM ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </header>
      <main className={`flex-1 flex overflow-hidden relative transition-colors duration-500 z-10`}>
        {isCommandLibraryOpen && <CommandLibraryModal onClose={() => setIsCommandLibraryOpen(false)} onExplainCommand={handleExplainCommand} onSimulateCommand={handleSimulateCommand} />}
        {isReminderOpen && <ReminderModal reminders={reminders} setReminders={setReminders} onClose={() => setIsReminderOpen(false)} shiftStartTime={shiftStartTime} />}
        
        <div className="hidden lg:flex flex-col bg-slate-900/30 min-w-[300px]" style={{ width: `${leftPanelWidth}%` }}>
        <div className="flex border-b border-slate-800 bg-slate-950/40 shrink-0 overflow-x-auto scrollbar-hide">
            <button onClick={() => setLeftPanelMode('DASHBOARD')} className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'DASHBOARD' ? 'border-cyan-400 text-cyan-400 bg-cyan-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}><LayoutDashboard size={16} /> OPS</button>
            <button onClick={() => setLeftPanelMode('FAULT_ASSIST')} className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'FAULT_ASSIST' ? 'border-amber-400 text-amber-400 bg-amber-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}><GitBranch size={16} /> TRIAGE</button>
            <button onClick={() => setLeftPanelMode('HANDOVER')} className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'HANDOVER' ? 'border-teal-400 text-teal-400 bg-teal-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}><ClipboardList size={16} /> SHIFT</button>
            <button onClick={() => setLeftPanelMode('LOGS')} className={`flex-1 py-4 px-2 min-w-fit text-xs font-bold tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 ${leftPanelMode === 'LOGS' ? 'border-blue-400 text-blue-400 bg-blue-950/10' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}><ScanSearch size={16} /> X-RAY</button>
        </div>
        <div className="flex-1 overflow-hidden relative p-6">
            {leftPanelMode === 'DASHBOARD' ? (
            <div className="flex flex-col h-full">
                {/* Top Section */}
                <div 
                    style={{ 
                        height: isDiagnosticMinimized ? '0px' : `${dashboardSplitV}%`, 
                        minHeight: isDiagnosticMinimized ? '0px' : undefined,
                        opacity: isDiagnosticMinimized ? 0 : 1
                    }} 
                    className={`overflow-y-auto scrollbar-hide pb-2 transition-all duration-300 ease-in-out ${isDiagnosticMinimized ? 'overflow-hidden' : ''}`}
                >
                    <DiagnosticGrid onModuleClick={handleDiagnosticClick} activeModuleId={activeModuleId} />
                </div>
                
                {/* Vertical Resizer with Toggle */}
                <div 
                    className={`relative z-10 flex items-center justify-center bg-slate-900 border-y border-slate-800/50 transition-colors shrink-0 group ${isDiagnosticMinimized ? 'h-8' : 'h-5 -my-2 cursor-row-resize hover:bg-slate-800'}`}
                    onMouseDown={(e) => { 
                        if(isDiagnosticMinimized) return; // Disable resize when minimized
                        setActiveResizer('DASH_V'); 
                        document.body.style.cursor = 'row-resize'; 
                    }}
                >
                    {/* Visual Grip Handle (only when not minimized) */}
                    {!isDiagnosticMinimized && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-16 h-1 rounded-full bg-slate-700 group-hover:bg-cyan-500 transition-colors" />
                        </div>
                    )}

                    {/* Toggle Button */}
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsDiagnosticMinimized(!isDiagnosticMinimized); }}
                        className="z-20 p-0.5 rounded bg-slate-800 text-slate-400 hover:text-white border border-slate-700 shadow-sm transition-all hover:bg-cyan-900/50 hover:border-cyan-500/50"
                        title={isDiagnosticMinimized ? "Show Diagnostics" : "Hide Diagnostics"}
                    >
                        {isDiagnosticMinimized ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </button>
                </div>

                {/* Bottom Section */}
                <div className="flex-1 flex min-h-0 pt-2">
                    <div style={{ width: isCommandPanelMinimized ? '100%' : `${dashboardSplitH}%` }} className="h-full overflow-hidden transition-all duration-300">
                        <NetworkTools activeTab={networkToolTab} onTabChange={setNetworkToolTab} notes={notes} onNotesChange={handleNotesChange} />
                    </div>
                    
                    {/* Horizontal Resizer with Toggle */}
                    <div 
                        className={`relative z-10 flex flex-col items-center justify-center transition-colors shrink-0 group ${isCommandPanelMinimized ? 'w-8 bg-slate-900 border-l border-slate-800/50' : 'w-4 -mx-2 cursor-col-resize hover:bg-slate-800/50'}`}
                        onMouseDown={(e) => { 
                            if(isCommandPanelMinimized) return;
                            setActiveResizer('DASH_H'); 
                            document.body.style.cursor = 'col-resize'; 
                        }}
                    >
                        {!isCommandPanelMinimized && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="h-16 w-1 rounded-full bg-slate-700 group-hover:bg-cyan-500 transition-colors" />
                            </div>
                        )}

                        {/* Toggle Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsCommandPanelMinimized(!isCommandPanelMinimized); }}
                            className="z-20 p-0.5 rounded bg-slate-800 text-slate-400 hover:text-white border border-slate-700 shadow-sm transition-all hover:bg-cyan-900/50 hover:border-cyan-500/50"
                            title={isCommandPanelMinimized ? "Show Command Library" : "Hide Command Library"}
                        >
                            {isCommandPanelMinimized ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                        </button>
                    </div>

                    <div 
                        style={{ width: isCommandPanelMinimized ? '0px' : undefined, opacity: isCommandPanelMinimized ? 0 : 1 }}
                        className={`transition-all duration-300 ease-in-out ${isCommandPanelMinimized ? 'overflow-hidden border-none min-w-0' : 'flex-1 h-full overflow-hidden bg-slate-900/40 rounded-xl border border-slate-800/50 shadow-sm min-w-[200px]'}`}
                    >
                        <CommandPanel activeModuleId={activeModuleId} onCategoryChange={setActiveModuleId} onExplainCommand={handleExplainCommand} onSimulateCommand={handleSimulateCommand} isProcessing={isLoading} />
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
                    isExternalLoading={isFaultAnalysisLoading}
                />
            </div>
            ) : leftPanelMode === 'LOGS' ? (
                <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <LogAnalyzer 
                        persistedLogs={persistentLogs} 
                        onLogsChange={setPersistentLogs} 
                        analysisResult={logAnalysisResult}
                        onAnalysisChange={setLogAnalysisResult}
                    />
                </div>
            ) : (
                <div className="h-full w-full bg-slate-900/40 rounded-xl border border-slate-800/50 overflow-hidden shadow-sm">
                    <ShiftHandoverDashboard 
                        sessions={sessions} 
                        persistedState={shiftState} 
                        onStateChange={setShiftState} 
                        shiftStartTime={shiftStartTime} 
                        onShiftReset={handleShiftReset}
                        onSimulateShift={handleSimulateShift}
                    />
                </div>
            )}
        </div>
        </div>
        <div className={`hidden lg:flex w-1 bg-slate-800 hover:bg-cyan-500 cursor-col-resize transition-colors items-center justify-center z-50 ${activeResizer === 'MAIN' ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : ''} ${isCommandLibraryOpen ? 'opacity-0 pointer-events-none' : ''}`} onMouseDown={() => setActiveResizer('MAIN')}><div className={`h-8 w-0.5 rounded-full transition-colors ${activeResizer === 'MAIN' ? 'bg-white' : 'bg-slate-600'}`} /></div>
        <div className="flex-1 flex flex-col bg-slate-950 relative min-w-[300px]">{renderChatInterface()}</div>
      </main>
    </div>
  );
};

export default App;