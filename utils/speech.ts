// Browser dictation for the composer. Missing API → no button shown.

type RecCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function ctor(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function canDictate(): boolean {
  return typeof window !== 'undefined' && !!ctor();
}

export function startDictation(onText: (text: string, final: boolean) => void): () => void {
  const C = ctor();
  if (!C) return () => {};
  const r = new C();
  r.lang = 'en-AU';
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (ev) => {
    let text = '';
    let final = false;
    for (let i = 0; i < ev.results.length; i++) {
      const row = ev.results[i] as ArrayLike<{ transcript: string }> & { isFinal?: boolean };
      text += row[0].transcript;
      if (row.isFinal) final = true;
    }
    onText(text.trim(), final);
  };
  r.onerror = () => {};
  r.start();
  return () => { try { r.stop(); } catch { /* already stopped */ } };
}
