import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  private getCtx() {
    if (Platform.OS !== 'web') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    return this.ctx;
  }

  /**
   * Short high-pitched blip for countdown ticks (5, 4, 3, 2, 1)
   */
  playTick() {
    if (this.isMuted) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }

  /**
   * Resonant multi-harmonic Boxing Bell for start signal
   */
  playBoxingBell() {
    if (this.isMuted) return;
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
  }

  /**
   * Harsh square-wave digital buzzer for AMRAP/Timeout finish signal
   */
  playDigitalBuzzer(times: number = 2) {
    if (this.isMuted) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    try {
      for (let i = 0; i < times; i++) {
        const startTime = ctx.currentTime + (i * 0.8);
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
  }
}

export const SoundServiceInstance = new SoundService();
