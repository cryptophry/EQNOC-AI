import React, { useState } from 'react';
import { Activity } from 'lucide-react';
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
      setError(err instanceof AuthError ? 'Incorrect passcode — try again' : "Couldn't reach the server");
      setIsLoading(false);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-5 py-8">
      <main
        className="w-full max-w-[380px] text-center rounded-[24px] p-9 px-7 pb-7
                   bg-card/80 border border-line-strong shadow-glass backdrop-blur-2xl"
        style={{ animation: 'card-in .5s cubic-bezier(.32,.85,.35,1) backwards' }}
      >
        <div className="w-[74px] h-[74px] rounded-[20px] mx-auto mb-4 grid place-items-center shadow-accent"
             style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}>
          <Activity size={34} className="text-white" strokeWidth={2.2} />
        </div>

        <h1 className="text-[22px] font-extrabold tracking-[-0.3px] mb-1">EQNOC Assistant</h1>
        <p className="text-muted text-[13px] mb-6">Network &amp; field telecom assistant</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoFocus
            autoComplete="current-password"
            aria-label="Team passcode"
            placeholder="Passcode"
            className="w-full text-center text-[16px] rounded-[13px] px-4 py-3.5 outline-none
                       bg-card-2 text-ink border-[1.5px] border-line focus-ring transition-shadow
                       placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full text-[16px] font-semibold text-white rounded-[13px] px-4 py-3.5
                       shadow-accent transition-all hover:brightness-105 active:translate-y-px disabled:opacity-60"
            style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 55%, var(--accent-strong))' }}
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="min-h-[18px] text-[13.5px] font-semibold text-danger" role="alert">
            {error}
          </div>
        </form>

        <p className="mt-2 text-faint text-[12px]">Authorised EQNOC staff only</p>
      </main>

      <style>{`@keyframes card-in { from { opacity: 0; transform: translateY(16px) scale(.985); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
};

export default LoginScreen;
