import { clamp } from '../utils/math';
import type { TrackData } from './TrackDef';

// Гоночная линия: целевая скорость и боковое смещение по дистанции трассы.
export class RacingLine {
  speeds: Float32Array;
  offsets: Float32Array;
  private track: TrackData;

  constructor(track: TrackData, latAccMax: number, topSpeed: number) {
    this.track = track;
    const N = track.samples.length;
    const ds = track.ds;
    const speeds = new Float32Array(N);
    const offsets = new Float32Array(N);
    const minV = 9;
    for (let i = 0; i < N; i++) {
      const k = Math.abs(track.samples[i].curv);
      const v = k > 1e-5 ? Math.sqrt(latAccMax / k) : topSpeed;
      speeds[i] = clamp(v, minV, topSpeed);
    }
    // backward pass: учесть тормозной путь
    const brakeA = 22;
    for (let pass = 0; pass < 4; pass++) {
      for (let step = 0; step < N; step++) {
        const i = (N - step) % N; // назад по трассе
        const j = (i + 1) % N;
        const vAllowed = Math.sqrt(speeds[j] * speeds[j] + 2 * brakeA * ds);
        if (speeds[i] > vAllowed) speeds[i] = vAllowed;
      }
    }
    // forward pass: учесть разгон
    const accelA = 12;
    for (let pass = 0; pass < 2; pass++) {
      for (let step = 0; step < N; step++) {
        const i = step % N;
        const j = (i + 1) % N;
        const vAllowed = Math.sqrt(speeds[i] * speeds[i] + 2 * accelA * ds);
        if (speeds[j] > vAllowed) speeds[j] = vAllowed;
      }
    }
    // apex-смещение: внутрь поворота
    const maxOff = track.roadHalf - 2.0;
    for (let i = 0; i < N; i++) {
      const k = track.samples[i].curv;
      offsets[i] = clamp(-k * 320, -maxOff, maxOff);
    }
    // сгладить смещения
    const sm = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let j = -10; j <= 10; j++) acc += offsets[(i + j + N) % N];
      sm[i] = acc / 21;
    }
    this.speeds = speeds;
    this.offsets = sm;
  }

  speedAt(s: number): number {
    return this.track.samples[this.track.indexAt(s)].curv !== undefined
      ? this.speeds[this.track.indexAt(s)]
      : 30;
  }

  offsetAt(s: number): number {
    return this.offsets[this.track.indexAt(s)];
  }

  pointAt(s: number, extraLat = 0): { x: number; y: number; z: number } {
    return this.track.pointAt(s, this.offsetAt(s) + extraLat);
  }
}
