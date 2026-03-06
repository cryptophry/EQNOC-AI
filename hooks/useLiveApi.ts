import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { EQNOC_KNOWLEDGE_BASE } from '../constants';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audioUtils';

interface UseLiveApiProps {
  onTranscription?: (text: string, type: 'user' | 'model') => void;
}

export function useLiveApi({ onTranscription }: UseLiveApiProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    // Initialize GenAI client
    if (process.env.GEMINI_API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (!aiRef.current) return;

    try {
      // Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Connect to Live API
      sessionPromiseRef.current = aiRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: EQNOC_KNOWLEDGE_BASE,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: { model: 'gemini-2.5-flash-native-audio-preview-09-2025' },
          outputAudioTranscription: { model: 'gemini-2.5-flash-native-audio-preview-09-2025' }
        },
        callbacks: {
          onopen: () => {
            console.log('Live API Connected');
            setIsConnected(true);
            setupAudioInput(stream);
          },
          onmessage: handleServerMessage,
          onclose: () => {
            console.log('Live API Closed');
            setIsConnected(false);
            stopAudio();
          },
          onerror: (e) => {
            console.error('Live API Error', e);
            setIsConnected(false);
            stopAudio();
          }
        }
      });

    } catch (error) {
      console.error('Connection failed:', error);
      setIsConnected(false);
    }
  };

  const setupAudioInput = (stream: MediaStream) => {
    if (!inputAudioContextRef.current) return;

    const ctx = inputAudioContextRef.current;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualization
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      setVolume(Math.sqrt(sum / inputData.length));

      const blob = createPcmBlob(inputData);
      
      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
          session.sendRealtimeInput({ media: blob });
        });
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    inputSourceRef.current = source;
    processorRef.current = processor;
  };

  const handleServerMessage = async (message: LiveServerMessage) => {
    // Transcription
    if (onTranscription) {
      if (message.serverContent?.inputTranscription?.text) {
        onTranscription(message.serverContent.inputTranscription.text, 'user');
      }
      if (message.serverContent?.outputTranscription?.text) {
        onTranscription(message.serverContent.outputTranscription.text, 'model');
      }
    }

    // Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && outputAudioContextRef.current) {
        setIsSpeaking(true);
        const ctx = outputAudioContextRef.current;
        
        // Ensure nextStartTime is valid
        if (nextStartTimeRef.current < ctx.currentTime) {
            nextStartTimeRef.current = ctx.currentTime;
        }

        const audioBuffer = await decodeAudioData(
            base64ToUint8Array(audioData),
            ctx
        );

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        source.onended = () => {
            // Check if this was the last source playing
            if (ctx.currentTime >= nextStartTimeRef.current - 0.1) {
                setIsSpeaking(false);
            }
        };

        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += audioBuffer.duration;
        audioQueueRef.current.push(source);
    }

    // Interruption
    if (message.serverContent?.interrupted) {
        stopPlayback();
    }
  };

  const stopPlayback = () => {
    audioQueueRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    audioQueueRef.current = [];
    if (outputAudioContextRef.current) {
        nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
    }
    setIsSpeaking(false);
  };

  const stopAudio = () => {
    if (inputSourceRef.current) {
        inputSourceRef.current.disconnect();
        inputSourceRef.current = null;
    }
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    stopPlayback();
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
  };

  const disconnect = async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }
    stopAudio();
    setIsConnected(false);
  };

  return {
    isConnected,
    isSpeaking,
    volume,
    connect,
    disconnect
  };
}
