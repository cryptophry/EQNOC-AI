// Futuristic alert sound for fired reminders.
// A single shared AudioContext is reused across alarms — creating a new one on
// every fire leaks contexts (browsers cap ~6, after which creation throws and
// alarms go silent).

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function playAlertSound(): void {
  const ctx = getContext();
  if (!ctx) return;

  const playPulse = (start: number, freq: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Sci-fi sawtooth texture with a pitch drop (laser effect)
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, start + 0.25);

    // Filter sweep for "futuristic" resonance
    filter.type = 'lowpass';
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(3000, start);
    filter.frequency.exponentialRampToValueAtTime(200, start + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // Fast attack, exponential decay
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

    osc.start(start);
    osc.stop(start + 0.3);
  };

  const t = ctx.currentTime;
  playPulse(t, 1200);
  playPulse(t + 0.15, 1200);
}
