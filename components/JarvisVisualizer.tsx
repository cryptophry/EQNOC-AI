import React, { useEffect, useRef } from 'react';
import { TriageStatus } from '../types';

interface Props {
  isActive: boolean; // Voice link active
  isSpeaking: boolean; // AI speaking
  volume: number; // 0 to 1
  status: TriageStatus;
}

const JarvisVisualizer: React.FC<Props> = ({ isActive, isSpeaking, volume, status }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let rotation = 0;
    let tick = 0;

    const getColors = (s: TriageStatus) => {
      switch (s) {
        case 'pending':
          return { 
            primary: '#fbbf24', // Amber-400
            secondary: '#d97706', // Amber-600
            glow: 'rgba(251, 191, 36, 0.4)',
            bg: 'rgba(251, 191, 36, 0.05)' 
          };
        case 'completed':
          return { 
            primary: '#34d399', // Emerald-400
            secondary: '#059669', // Emerald-600
            glow: 'rgba(52, 211, 153, 0.4)',
            bg: 'rgba(52, 211, 153, 0.05)'
          };
        case 'active':
        default:
          return { 
            primary: '#22d3ee', // Cyan-400
            secondary: '#0891b2', // Cyan-600
            glow: 'rgba(34, 211, 238, 0.4)',
            bg: 'rgba(34, 211, 238, 0.05)'
          };
      }
    };

    const draw = () => {
      const colors = getColors(status);
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      
      tick++;
      
      // Rotation speeds based on status
      const baseSpeed = status === 'active' ? 0.02 : status === 'pending' ? 0.01 : 0.005;
      rotation += baseSpeed + (volume * 0.1);

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Background Glow
      const gradient = ctx.createRadialGradient(cx, cy, 20, cx, cy, 120);
      gradient.addColorStop(0, colors.bg);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // --- STATUS SPECIFIC ANIMATIONS ---

      if (status === 'pending') {
        // RADAR SCAN EFFECT
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation * 2);
        
        // Radar Sweep
        const sweepGrad = ctx.createConicGradient(rotation * 2, 0, 0);
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.8, 'transparent');
        sweepGrad.addColorStop(1, colors.primary);
        
        ctx.fillStyle = sweepGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 90, 0, Math.PI * 2);
        ctx.fill();

        // Dotted circle
        ctx.beginPath();
        ctx.arc(0, 0, 90, 0, Math.PI * 2);
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 10]);
        ctx.stroke();
        ctx.restore();

        // Pulsing core
        const pulse = Math.sin(tick * 0.05) * 5;
        ctx.beginPath();
        ctx.arc(cx, cy, 30 + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 2;
        ctx.stroke();

      } else if (status === 'completed') {
        // STABLE RESONANCE EFFECT
        // Concentric ripples
        for (let i = 0; i < 3; i++) {
          const offset = (tick * 0.5 + i * 40) % 120;
          const alpha = 1 - (offset / 120);
          
          ctx.beginPath();
          ctx.arc(cx, cy, 30 + offset, 0, Math.PI * 2);
          ctx.strokeStyle = colors.primary;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Solid core check-ish shape or solid circle
        ctx.beginPath();
        ctx.arc(cx, cy, 25, 0, Math.PI * 2);
        ctx.fillStyle = colors.glow;
        ctx.fill();
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 3;
        ctx.stroke();

      } else {
        // ACTIVE (Standard Jarvis)
        // Inner Ring
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.arc(0, 0, 40 + (volume * 20), 0, Math.PI * 2);
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 20]);
        ctx.stroke();
        ctx.restore();

        // Outer Ring
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-rotation * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, 60 + (volume * 10), 0, Math.PI * 2);
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 15, 30]);
        ctx.stroke();
        ctx.restore();

        // Audio Bars (Circular)
        const bars = 48;
        const radius = 80;
        for (let i = 0; i < bars; i++) {
          const angle = (i / bars) * Math.PI * 2 + rotation;
          // Use volume if available, otherwise small idle movement
          const val = isActive ? volume : Math.sin(tick * 0.1 + i) * 0.05 + 0.05; 
          const barHeight = 5 + Math.max(0, val * 80);
          
          const x1 = cx + Math.cos(angle) * radius;
          const y1 = cy + Math.sin(angle) * radius;
          const x2 = cx + Math.cos(angle) * (radius + barHeight);
          const y2 = cy + Math.sin(angle) * (radius + barHeight);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(34, 211, 238, ${0.3 + Math.min(1, val * 2)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Center Status Text (If offline/no audio volume or specifically speaking)
      // Actually, let's always show a status label in the center if volume is low, 
      // or "TRANSMITTING" if speaking.
      
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, isSpeaking, volume, status]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={300} 
        className="w-64 h-64"
      />
      <div className="absolute mt-32 flex flex-col items-center pointer-events-none">
         <div 
           className={`font-display text-xs tracking-[0.2em] font-bold transition-colors duration-500
             ${status === 'pending' ? 'text-amber-400' : 
               status === 'completed' ? 'text-emerald-400' : 'text-cyan-400'}`}
         >
            {status.toUpperCase()}
         </div>
         {isActive && (
            <div className="text-[10px] text-slate-500 font-mono mt-1 animate-pulse">
               {isSpeaking ? 'VOICE OUTPUT' : 'LISTENING...'}
            </div>
         )}
      </div>
    </div>
  );
};

export default JarvisVisualizer;
