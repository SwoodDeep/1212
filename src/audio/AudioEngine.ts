import { ASSETS } from '../config';
import { clamp } from '../utils/math';

// Web Audio: синтезированный двигатель/занос/ветр + CC0 сэмплы (Kenney/OGA).
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private buffers: Record<string, AudioBuffer> = {};
  private engineNodes: { osc1: OscillatorNode; osc2: OscillatorNode; sub: OscillatorNode; filt: BiquadFilterNode; noise: AudioBufferSourceNode; noiseFilt: BiquadFilterNode; gain: GainNode; loopGain: GainNode; loopSrc: AudioBufferSourceNode | null } | null = null;
  private skid: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private nitroOsc: OscillatorNode | null = null;
  private nitroGain: GainNode | null = null;
  private aiOsc: OscillatorNode | null = null;
  private aiGain: GainNode | null = null;
  private volume = 0.8;
  private sfxVolume = 0.9;
  private engineVolume = 0.8;
  private noiseBuf: AudioBuffer | null = null;
  ready = false;

  // Создаём контекст по жесту пользователя (autoplay policy).
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.engineBus = this.ctx.createGain();
    this.engineBus.connect(this.master);
    // белый шум (общий буфер)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startBeds();
  }

  async loadAll(): Promise<void> {
    this.ensure();
    if (!this.ctx) return;
    const entries = Object.entries(ASSETS.audio);
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          this.buffers[key] = await this.ctx!.decodeAudioData(buf);
        } catch {
          /* ассет звука не загрузился — тихо пропускаем */
        }
      })
    );
    this.ready = true;
    this.startEngineLoop();
  }

  setVolumes(volume: number, sfx: number, engine: number): void {
    this.volume = volume;
    this.sfxVolume = sfx;
    this.engineVolume = engine;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.master || !this.sfxBus || !this.engineBus) return;
    this.master.gain.value = this.volume;
    this.sfxBus.gain.value = this.sfxVolume;
    this.engineBus.gain.value = this.engineVolume;
  }

  private makeNoiseSrc(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  private startBeds(): void {
    const ctx = this.ctx;
    const engineBus = this.engineBus;
    const sfxBus = this.sfxBus;
    if (!ctx || !engineBus || !sfxBus) return;
    // --- двигатель игрока (синтез) ---
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const noise = this.makeNoiseSrc()!;
    const noiseFilt = ctx.createBiquadFilter();
    noiseFilt.type = 'lowpass';
    noiseFilt.frequency.value = 1200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;
    osc1.connect(filt);
    osc2.connect(filt);
    sub.connect(filt);
    filt.connect(gain);
    noise.connect(noiseFilt);
    noiseFilt.connect(noiseGain);
    noiseGain.connect(gain);
    gain.connect(engineBus);
    osc1.start();
    osc2.start();
    sub.start();
    noise.start();
    this.engineNodes = { osc1, osc2, sub, filt, noise, noiseFilt, gain, loopGain: ctx.createGain(), loopSrc: null };
    this.engineNodes.loopGain.gain.value = 0;
    this.engineNodes.loopGain.connect(engineBus);
    // --- визг шин ---
    const skidSrc = this.makeNoiseSrc()!;
    const skidFilt = ctx.createBiquadFilter();
    skidFilt.type = 'bandpass';
    skidFilt.frequency.value = 1400;
    skidFilt.Q.value = 1.6;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidFilt);
    skidFilt.connect(skidGain);
    skidGain.connect(sfxBus);
    skidSrc.start();
    this.skid = { src: skidSrc, filt: skidFilt, gain: skidGain };
    // --- ветер ---
    const windSrc = this.makeNoiseSrc()!;
    const windFilt = ctx.createBiquadFilter();
    windFilt.type = 'highpass';
    windFilt.frequency.value = 500;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilt);
    windFilt.connect(windGain);
    windGain.connect(sfxBus);
    windSrc.start();
    this.wind = { src: windSrc, filt: windFilt, gain: windGain };
    // --- двигатель ближайшего AI ---
    const aiOsc = ctx.createOscillator();
    aiOsc.type = 'sawtooth';
    aiOsc.frequency.value = 90;
    const aiGain = ctx.createGain();
    aiGain.gain.value = 0;
    const aiFilt = ctx.createBiquadFilter();
    aiFilt.type = 'lowpass';
    aiFilt.frequency.value = 500;
    aiOsc.connect(aiFilt);
    aiFilt.connect(aiGain);
    aiGain.connect(sfxBus);
    aiOsc.start();
    this.aiOsc = aiOsc;
    this.aiGain = aiGain;
  }

  private startEngineLoop(): void {
    // доп. слой — реальный луп мотора (OGA CC0), низкая громкость
    if (!this.ctx || !this.engineNodes) return;
    const buf = this.buffers.engineLoopA;
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.8;
    src.connect(this.engineNodes.loopGain);
    src.start();
    this.engineNodes.loopSrc = src;
  }

  updateEngine(rpm: number, throttle: number, speedKmh: number): void {
    if (!this.ctx || !this.engineNodes) return;
    const e = this.engineNodes;
    const f = 52 + rpm * 235;
    e.osc1.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
    e.osc2.frequency.setTargetAtTime(f * 0.5 + 4, this.ctx.currentTime, 0.03);
    e.sub.frequency.setTargetAtTime(f * 0.25, this.ctx.currentTime, 0.03);
    e.filt.frequency.setTargetAtTime(500 + rpm * 3200 + throttle * 600, this.ctx.currentTime, 0.05);
    e.gain.gain.setTargetAtTime(0.05 + throttle * 0.075 + rpm * 0.035, this.ctx.currentTime, 0.06);
    if (e.loopSrc) e.loopSrc.playbackRate.setTargetAtTime(0.55 + rpm * 1.05, this.ctx.currentTime, 0.05);
    e.loopGain.gain.setTargetAtTime(0.05 + rpm * 0.03, this.ctx.currentTime, 0.08);
    this.setSkid(0);
    this.setWind(speedKmh);
  }

  setSkid(slip: number): void {
    if (!this.skid || !this.ctx) return;
    const g = clamp(slip / 9, 0, 1) * 0.22;
    this.skid.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05);
    this.skid.filt.frequency.setTargetAtTime(1100 + slip * 60, this.ctx.currentTime, 0.1);
  }

  setWind(speedKmh: number): void {
    if (!this.wind || !this.ctx) return;
    const g = clamp(speedKmh / 280, 0, 1) * 0.14;
    this.wind.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.1);
    this.wind.filt.frequency.setTargetAtTime(400 + speedKmh * 3, this.ctx.currentTime, 0.2);
  }

  updateAI(dist: number, rpm: number): void {
    if (!this.aiOsc || !this.aiGain || !this.ctx) return;
    const g = clamp(1 - dist / 90, 0, 1) * 0.1;
    this.aiGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.1);
    this.aiOsc.frequency.setTargetAtTime(60 + rpm * 190, this.ctx.currentTime, 0.1);
  }

  play(name: keyof typeof ASSETS.audio, volume = 1, rate = 1): void {
    if (!this.ctx || !this.sfxBus) return;
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.sfxBus);
    src.start();
  }

  crash(impact: number): void {
    const v = clamp(impact / 16, 0.15, 1);
    const names = ['crash0', 'crash1', 'crash2'] as const;
    this.play(names[Math.floor(Math.random() * 3)], v, 0.85 + Math.random() * 0.3);
    if (impact > 6) this.play('scrape', v * 0.7, 1.2);
  }

  ui(kind: 'click' | 'select' | 'confirm' | 'back' | 'error' | 'drop'): void {
    const map = { click: 'uiClick', select: 'uiSelect', confirm: 'uiConfirm', back: 'uiBack', error: 'uiError', drop: 'uiDrop' } as const;
    this.play(map[kind], 0.7);
  }

  countdownBeep(): void {
    this.play('beepLow', 0.8, 1);
  }

  goBeep(): void {
    this.play('beepGo', 0.9, 1);
  }

  finishJingle(): void {
    this.play('powerUp', 0.9, 1);
    this.play('threeTone', 0.6, 1);
  }

  setNitro(on: boolean): void {
    if (!this.ctx || !this.sfxBus) return;
    if (on && !this.nitroOsc) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 240;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      osc.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      osc.start();
      osc.frequency.setTargetAtTime(760, this.ctx.currentTime, 0.35);
      g.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.1);
      this.nitroOsc = osc;
      this.nitroGain = g;
    } else if (!on && this.nitroOsc) {
      const osc = this.nitroOsc;
      const g = this.nitroGain!;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      osc.frequency.setTargetAtTime(120, this.ctx.currentTime, 0.15);
      setTimeout(() => {
        try { osc.stop(); } catch { /* ok */ }
      }, 400);
      this.nitroOsc = null;
      this.nitroGain = null;
    }
  }
}
