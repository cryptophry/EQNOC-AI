import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, Activity, ChevronRight, AlertCircle, Scan, Cpu } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bootSequence, setBootSequence] = useState<string[]>([]);

  useEffect(() => {
    // Initial boot text animation
    const steps = [
      'INITIALIZING SECURITY PROTOCOLS...',
      'ESTABLISHING SECURE CONNECTION...',
      'VERIFYING BIOMETRIC SIGNATURES...',
      'SYSTEM READY. AUTHENTICATION REQUIRED.'
    ];

    let delay = 0;
    steps.forEach((step, index) => {
      delay += 400;
      setTimeout(() => {
        setBootSequence(prev => [...prev, step]);
      }, delay);
    });
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    // Simulate network check
    setTimeout(() => {
      if (password.toLowerCase() === 'eqnoc' || password.toLowerCase() === 'admin') {
        onLogin();
      } else {
        setError(true);
        setIsLoading(false);
        setPassword('');
      }
    }, 800);
  };

  return (
    <div className="h-screen w-full bg-slate-950 flex items-center justify-center relative overflow-hidden selection:bg-cyan-500/30 font-sans">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:30px_30px]"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)]"></div>
      
      <div className="relative z-10 w-full max-w-md p-6">
        
        {/* Main Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.1)] overflow-hidden animate-in zoom-in-95 duration-700">
          
          {/* Header */}
          <div className="h-2 bg-gradient-to-r from-cyan-600 via-cyan-400 to-cyan-600 animate-pulse"></div>
          
          <div className="p-8 flex flex-col items-center">
            <div className="w-16 h-16 bg-cyan-950/50 rounded-full border border-cyan-500/50 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,211,238,0.2)] relative group">
              <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-spin-slow border-dashed"></div>
              <ShieldCheck size={32} className="text-cyan-400" />
              <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1 border border-slate-700">
                <Lock size={12} className="text-emerald-400" />
              </div>
            </div>

            <h1 className="font-display text-3xl font-bold text-white tracking-wider mb-1">EQNOC AI</h1>
            <p className="text-xs font-mono text-cyan-500 tracking-[0.2em] mb-8">SECURE ACCESS TERMINAL</p>

            {/* Boot Sequence Text */}
            <div className="w-full mb-8 h-24 overflow-hidden flex flex-col justify-end">
              {bootSequence.map((text, i) => (
                <div key={i} className="text-[10px] font-mono text-slate-500 flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                   <span className="text-emerald-500">OK</span>
                   <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                   {text}
                </div>
              ))}
              {bootSequence.length < 4 && (
                <div className="text-[10px] font-mono text-cyan-500 animate-pulse mt-1">_</div>
              )}
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div className="relative group">
                <div className={`absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-lg opacity-20 group-hover:opacity-40 transition duration-500 ${error ? 'from-red-500 to-red-600 opacity-50' : ''}`}></div>
                <div className="relative flex items-center bg-slate-950 rounded-lg border border-slate-700 p-1">
                   <div className="pl-3 pr-2 text-slate-500">
                      {isLoading ? <Activity size={18} className="animate-spin text-cyan-400" /> : <Scan size={18} />}
                   </div>
                   <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="ENTER ACCESS CODE"
                      className="w-full bg-transparent border-none text-center text-white font-mono text-sm tracking-[0.5em] focus:ring-0 placeholder-slate-600 py-3"
                      autoFocus
                   />
                </div>
              </div>

              {error && (
                <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-bold animate-in slide-in-from-top-1 fade-in">
                  <AlertCircle size={14} />
                  ACCESS DENIED: INVALID CREDENTIALS
                </div>
              )}

              <button 
                type="submit"
                disabled={isLoading || bootSequence.length < 4}
                className={`w-full py-4 rounded-lg font-bold text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 relative overflow-hidden group
                  ${isLoading 
                    ? 'bg-cyan-900/50 text-cyan-400 cursor-wait' 
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]'
                  }`}
              >
                 {/* Button Glitch Effect */}
                 <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1s_infinite]"></div>
                 
                 {isLoading ? (
                   <>
                     <Cpu size={16} className="animate-pulse" />
                     AUTHENTICATING...
                   </>
                 ) : (
                   <>
                     ACCESS SYSTEM <ChevronRight size={14} />
                   </>
                 )}
              </button>
            </form>

            <div className="mt-6 text-[9px] text-slate-600 font-mono text-center">
               RESTRICTED AREA. UNAUTHORIZED ACCESS ATTEMPTS ARE LOGGED.<br/>
               EQNOC SYSTEMS v2.5.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;