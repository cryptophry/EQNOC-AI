import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, Activity, ChevronRight, AlertCircle, Scan, Cpu, Power, Fingerprint, Globe, Radio, Zap, Terminal } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [isBooting, setIsBooting] = useState(true);

  const terminalRef = useRef<HTMLDivElement>(null);

  // Boot Sequence Simulation
  useEffect(() => {
    const sysLogs = [
      "INITIALIZING KERNEL...",
      "LOADING NEURAL ENGINE v2.5...",
      "MOUNTING SECURE VOLUMES [ENCRYPTED]...",
      "ESTABLISHING UPLINK TO SATELLITE ARRAY...",
      "BYPASSING PROXY PROTOCOLS...",
      "VERIFYING BIOMETRIC HASHES...",
      "SYSTEM INTEGRITY: 100%",
      "ACCESS REQUESTED...",
    ];

    let delay = 0;
    sysLogs.forEach((line, i) => {
      delay += Math.random() * 300 + 100;
      setTimeout(() => {
        setBootLines(prev => [...prev, line]);
        if (i === sysLogs.length - 1) {
          setTimeout(() => setIsBooting(false), 800);
        }
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      }, delay);
    });
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    // Simulate network latency & auth check
    setTimeout(() => {
      if (password.toLowerCase() === 'eqnoc' || password.toLowerCase() === 'admin') {
        onLogin();
      } else {
        setError(true);
        setIsLoading(false);
        setPassword('');
        // Shake effect or red flash could be added here
      }
    }, 1200);
  };

  return (
    <div className="h-screen w-full bg-[#020617] text-cyan-500 overflow-hidden relative font-mono selection:bg-cyan-500/30">
      
      {/* --- BACKGROUND LAYERS --- */}
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30"></div>
      
      {/* Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.15)_0%,transparent_70%)] pointer-events-none"></div>

      {/* Floating Particles / Stars (CSS only for simplicity) */}
      <div className="absolute inset-0 animate-[pulse_4s_infinite] opacity-40">
        <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_cyan]"></div>
        <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_cyan]"></div>
        <div className="absolute bottom-1/4 left-1/2 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_cyan]"></div>
      </div>

      {/* --- HUD OVERLAYS --- */}
      
      {/* Top Left Stats */}
      <div className="absolute top-8 left-8 flex flex-col gap-1 opacity-70 hidden md:flex">
         <div className="flex items-center gap-2 text-xs font-bold tracking-widest">
            <Activity size={14} /> SYSTEM STATUS: <span className="text-emerald-400">NOMINAL</span>
         </div>
         <div className="w-48 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-cyan-500 w-2/3 animate-[pulse_2s_infinite]"></div>
         </div>
         <div className="text-[10px] text-slate-500 mt-1">CPU: 12% | MEM: 3.4GB | NET: UP</div>
      </div>

      {/* Top Right Time */}
      <div className="absolute top-8 right-8 text-right hidden md:block opacity-70">
         <div className="text-2xl font-display font-bold tracking-widest text-white">EQNOC<span className="text-cyan-400">.AI</span></div>
         <div className="text-[10px] tracking-[0.3em] text-cyan-600">SECURE TERMINAL ACCESS</div>
      </div>

      {/* Bottom Left Terminal */}
      <div className="absolute bottom-8 left-8 w-64 h-32 bg-slate-950/80 border border-slate-800 p-3 rounded-lg font-mono text-[10px] text-cyan-600/80 overflow-hidden hidden md:block shadow-[0_0_20px_rgba(0,0,0,0.5)]">
         <div className="flex items-center gap-2 border-b border-slate-800 pb-1 mb-2 text-cyan-400 font-bold">
            <Terminal size={10} /> BOOT LOG
         </div>
         <div ref={terminalRef} className="h-full overflow-hidden flex flex-col justify-end">
            {bootLines.map((line, i) => (
               <div key={i} className="truncate animate-in slide-in-from-left-2 fade-in duration-300">
                  <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {line}
               </div>
            ))}
         </div>
      </div>

      {/* --- CENTRAL LOGIN CONSTRUCT --- */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
         
         {/* Rotating Rings Container */}
         <div className="relative w-[500px] h-[500px] flex items-center justify-center">
            
            {/* Ring 1: Outer Dashed */}
            <div className="absolute inset-0 rounded-full border border-dashed border-cyan-900/50 animate-[spin_60s_linear_infinite]"></div>
            
            {/* Ring 2: Scanner Segments */}
            <div className="absolute inset-[20px] rounded-full border border-transparent border-t-cyan-500/20 border-b-cyan-500/20 animate-[spin_10s_linear_infinite_reverse]"></div>
            
            {/* Ring 3: Inner Glow */}
            <div className="absolute inset-[80px] rounded-full border border-cyan-500/10 shadow-[0_0_50px_rgba(6,182,212,0.1)] animate-pulse"></div>

            {/* Main Login Card */}
            <div className="relative w-80 bg-slate-950/80 backdrop-blur-xl border border-cyan-500/30 p-8 clip-path-polygon shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-1000">
               
               {/* Decorative Corner Markers */}
               <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
               <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
               <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
               <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>

               {/* Center Icon */}
               <div className="flex justify-center mb-6 relative">
                  <div className="w-20 h-20 rounded-full bg-cyan-950/30 border border-cyan-400/30 flex items-center justify-center relative group">
                     {/* Rotating border inside icon */}
                     <div className="absolute inset-0 rounded-full border-t border-cyan-400 animate-spin"></div>
                     <ShieldCheck size={32} className={`text-cyan-400 transition-all duration-500 ${isLoading ? 'scale-90 opacity-50' : 'scale-100'}`} />
                     
                     {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <Cpu size={32} className="text-white animate-pulse" />
                        </div>
                     )}
                  </div>
               </div>

               <h2 className="text-center font-display text-2xl font-bold text-white tracking-widest mb-1">IDENTIFY</h2>
               <p className="text-center text-[10px] text-cyan-600 tracking-[0.3em] font-mono mb-8 uppercase">
                  {isBooting ? "INITIALIZING..." : "ENTER CREDENTIALS"}
               </p>

               <form onSubmit={handleLogin} className="space-y-6 relative z-10">
                  <div className="relative group">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock size={16} className={`text-slate-500 transition-colors ${error ? 'text-red-500' : 'group-focus-within:text-cyan-400'}`} />
                     </div>
                     <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isBooting || isLoading}
                        className={`w-full bg-slate-900/80 border ${error ? 'border-red-500/50 text-red-400 placeholder-red-800' : 'border-slate-700 text-white placeholder-slate-600 focus:border-cyan-500/50'} rounded px-10 py-3 text-center font-mono text-sm tracking-[0.5em] focus:outline-none transition-all focus:bg-slate-900 shadow-inner`}
                        placeholder="••••••"
                        autoFocus
                     />
                     {/* Scanning Line Effect on Input */}
                     <div className="absolute bottom-0 left-0 h-[1px] bg-cyan-500 w-full scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500"></div>
                  </div>

                  {error && (
                     <div className="text-center text-[10px] font-bold text-red-400 animate-pulse flex items-center justify-center gap-2">
                        <AlertCircle size={12} /> AUTHENTICATION FAILED
                     </div>
                  )}

                  <button
                     type="submit"
                     disabled={isBooting || isLoading || !password}
                     className="w-full bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 rounded py-3 text-xs font-bold tracking-widest uppercase transition-all hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] flex items-center justify-center gap-2 group disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                     {isLoading ? (
                        <>
                           <Scan size={14} className="animate-spin" /> VERIFYING...
                        </>
                     ) : (
                        <>
                           INITIATE LINK <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </>
                     )}
                  </button>
               </form>

               {/* Decorative footer lines */}
               <div className="mt-6 flex justify-between items-center opacity-50">
                  <div className="h-[1px] w-8 bg-cyan-800"></div>
                  <div className="text-[8px] text-cyan-700 font-mono tracking-widest">EQNOC-SEC-V2</div>
                  <div className="h-[1px] w-8 bg-cyan-800"></div>
               </div>
            </div>
         </div>
      </div>

      {/* --- FLOATING WIDGETS --- */}

      {/* Network Map Placeholder (Bottom Right) */}
      <div className="absolute bottom-8 right-8 w-40 h-40 opacity-40 hidden md:block animate-[pulse_5s_infinite]">
         <Globe size={160} className="text-cyan-900" strokeWidth={0.5} />
         <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping absolute top-10 right-10"></div>
            <div className="w-2 h-2 bg-cyan-500 rounded-full absolute bottom-12 left-12"></div>
         </div>
      </div>

    </div>
  );
};

export default LoginScreen;