import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

// ---------------------------------------------------------------------------
// Minimal WAV generation helpers (PCM 16-bit mono 44100 Hz)
// ---------------------------------------------------------------------------

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function encodeWAV(samples: Float32Array, sampleRate = 44100): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // React Native's btoa equivalent via Buffer
  if (typeof btoa !== 'undefined') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

/**
 * Synthesise a tone as a base64 WAV data URI (for expo-av).
 * type: 'sine' | 'square' | 'triangle'
 */
function synthesizeWAV(
  durationMs: number,
  frequencies: number[],
  amplitudes: number[],
  type: 'sine' | 'square' | 'triangle' = 'sine',
  fadeOutRatio = 0.7,
  sampleRate = 44100,
): string {
  const numSamples = Math.ceil((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  const fadeOutStart = Math.floor(numSamples * fadeOutRatio);

  for (let i = 0; i < numSamples; i++) {
    let value = 0;
    for (let h = 0; h < frequencies.length; h++) {
      const freq = frequencies[h];
      const amp = amplitudes[h] ?? 0.3;
      const t = i / sampleRate;
      let wave = 0;
      if (type === 'sine') {
        wave = Math.sin(2 * Math.PI * freq * t);
      } else if (type === 'square') {
        wave = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;
      } else {
        // triangle
        wave = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
      }
      value += amp * wave;
    }
    // fade out
    if (i >= fadeOutStart) {
      const fadeProgress = (i - fadeOutStart) / (numSamples - fadeOutStart);
      value *= 1 - fadeProgress;
    }
    samples[i] = Math.max(-1, Math.min(1, value));
  }

  const wav = encodeWAV(samples, sampleRate);
  const b64 = arrayBufferToBase64(wav);
  return `data:audio/wav;base64,${b64}`;
}

// ---------------------------------------------------------------------------
// SoundService
// ---------------------------------------------------------------------------

class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    this.loadMuteState();
  }

  private async loadMuteState() {
    try {
      const val = await AsyncStorage.getItem('arena_sound_muted');
      this.isMuted = val === 'true';
    } catch (e) {}
  }

  async setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      await AsyncStorage.setItem('arena_sound_muted', muted.toString());
    } catch (e) {}
  }

  getMuted() {
    return this.isMuted;
  }

  // -------------------------------------------------------------------------
  // Web Audio API helpers (web only)
  // -------------------------------------------------------------------------
  private getCtx() {
    if (Platform.OS !== 'web') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    return this.ctx;
  }

  // -------------------------------------------------------------------------
  // Mobile (expo-av) helper: play a synthesised WAV data URI
  // -------------------------------------------------------------------------
  private async playMobileSound(
    durationMs: number,
    frequencies: number[],
    amplitudes: number[],
    type: 'sine' | 'square' | 'triangle' = 'sine',
    fadeOutRatio = 0.7,
  ) {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const uri = synthesizeWAV(durationMs, frequencies, amplitudes, type, fadeOutRatio);
      const { sound } = await Audio.Sound.createAsync({ uri } as any, { shouldPlay: true });
      // Unload after playback to avoid memory leaks
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) {
      // Silently fail — sound is non-critical
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Short high-pitched blip for countdown ticks (5, 4, 3, 2, 1)
   */
  playTick() {
    if (this.isMuted) return;

    if (Platform.OS === 'web') {
      const ctx = this.getCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } catch (e) {}
    } else {
      // Mobile: short 880 Hz blip, 120 ms
      this.playMobileSound(120, [880], [0.15], 'sine', 0.3);
    }
  }

  /**
   * Resonant multi-harmonic Boxing Bell for start signal
   */
  playBoxingBell() {
    if (this.isMuted) return;

    if (Platform.OS === 'web') {
      const ctx = this.getCtx();
      if (!ctx) return;
      try {
        [440, 880, 1200].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          gain.gain.setValueAtTime(0.3 / (i + 1), ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 1.5);
        });
      } catch (e) {}
    } else {
      // Mobile: chord of 440 + 880 + 1200 Hz, 1500 ms, mixed amplitudes
      this.playMobileSound(1500, [440, 880, 1200], [0.30, 0.15, 0.10], 'sine', 0.2);
    }
  }

  /**
   * Harsh square-wave digital buzzer for AMRAP/Timeout finish signal
   */
  async playDigitalBuzzer(times: number = 2) {
    if (this.isMuted) return;

    if (Platform.OS === 'web') {
      const ctx = this.getCtx();
      if (!ctx) return;
      try {
        for (let i = 0; i < times; i++) {
          const startTime = ctx.currentTime + i * 0.8;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(150, startTime);
          gain.gain.setValueAtTime(0.15, startTime);
          gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.5);
        }
      } catch (e) {}
    } else {
      // Mobile: play buzzer bursts sequentially
      for (let i = 0; i < times; i++) {
        await this.playMobileSound(500, [150], [0.15], 'square', 0.1);
        // Gap between bursts
        if (i < times - 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 800));
        }
      }
    }
  }
}

export const SoundServiceInstance = new SoundService();
