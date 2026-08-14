import React, { useState } from 'react';
import { Activity, Loader2, Lock } from 'lucide-react';
import { login, AuthError } from '../services/ai';

interface Props {
  onLogin: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      await login(password);
      onLogin();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const msg = err instanceof AuthError
        ? 'Incorrect passcode — try again'
        : (raw && !/^Login failed/.test(raw) ? raw : (raw || "Couldn't reach the server"));
      setError(msg);
      setIsLoading(false);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-5 py-8 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[320px] rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 28%, transparent), transparent)' }}
      />

      <main className="relative w-full max-w-[400px] text-center rounded-[28px] px-7 pt-10 pb-8 glass-panel">
        <div
          className="w-[76px] h-[76px] rounded-[22px] mx-auto mb-5 grid place-items-center shadow-accent"
          style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 55%, var(--accent-strong))' }}
        >
          <Activity size={34} className="text-white" strokeWidth={2.15} />
        </div>

        <h1 className="text-[26px] font-extrabold tracking-[-0.6px] mb-1.5">Tech Assistant</h1>
        <p className="text-muted text-[13.5px] leading-relaxed mb-7">
          Field and desk telecom support — readings, CLI, safety, and reports.
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <label className="relative block">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoFocus
              autoComplete="current-password"
              aria-label="Team passcode"
              placeholder="Passcode"
              className="w-full text-[16px] rounded-[14px] pl-10 pr-4 py-3.5 outline-none
                         bg-card-2 text-ink border border-line focus-ring transition-shadow
                         placeholder:text-faint"
            />
          </label>
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full text-[16px] font-semibold text-white rounded-[14px] px-4 py-3.5
                       shadow-accent transition-all hover:brightness-105 active:translate-y-px disabled:opacity-50"
            style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 55%, var(--accent-strong))' }}
          >
            {isLoading
              ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Signing in…</span>
              : 'Sign in'}
          </button>
          <div className="min-h-[18px] text-[13.5px] font-semibold text-danger" role="alert">
            {error}
          </div>
        </form>

        <p className="mt-1 text-faint text-[12px]">Authorised staff only</p>
      </main>
    </div>
  );
};

export default LoginScreen;
