import { clamp, lerp, smoothstep, wrapAngle, fbm2 } from '../utils/math';

export interface CtrlPoint {
  x: number;
  y: number;
  z: number;
}

export interface TrackSample {
  s: number; // дистанция вдоль трассы, м
  x: number;
  y: number;
  z: number;
  tx: number; // единичный тангенс (xz)
  tz: number;
  nx: number; // "левая" нормаль (xz): n = (tz, -tx)
  nz: number;
  curv: number; // знаковая кривизна 1/м
}

export interface ClosestResult {
  index: number;
  s: number; // непрерывная дистанция (может быть <0 или >length после wrap)
  lateral: number; // >0 — слева от оси
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  curv: number;
}

const CELL = 30;

export class TrackData {
  samples: TrackSample[] = [];
  length = 0;
  ds = 1;
  roadHalf: number;
  curb: number;
  minX = Infinity;
  maxX = -Infinity;
  minZ = Infinity;
  maxZ = -Infinity;
  private grid = new Map<string, number[]>();

  constructor(ctrl: CtrlPoint[], count: number, roadHalf: number, curb: number) {
    this.roadHalf = roadHalf;
    this.curb = curb;
    this.build(ctrl, count);
  }

  private build(ctrl: CtrlPoint[], count: number): void {
    const n = ctrl.length;
    const STEPS = 32;
    const raw: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n];
      const p1 = ctrl[i];
      const p2 = ctrl[(i + 1) % n];
      const p3 = ctrl[(i + 2) % n];
      for (let j = 0; j < STEPS; j++) {
        const t = j / STEPS;
        const t2 = t * t;
        const t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number): number =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        raw.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), z: cr(p0.z, p1.z, p2.z, p3.z) });
      }
    }
    // кумулятивная длина
    const m = raw.length;
    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const a = raw[i];
      const b = raw[(i + 1) % m];
      cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.z - a.z);
    }
    const total = cum[m];
    this.length = total;
    this.ds = total / count;
    // равномерный ресемпл по дуге
    const samples: TrackSample[] = [];
    let seg = 0;
    for (let k = 0; k < count; k++) {
      const target = (k / count) * total;
      while (seg < m - 1 && cum[seg + 1] < target) seg++;
      const a = raw[seg];
      const b = raw[(seg + 1) % m];
      const segLen = cum[seg + 1] - cum[seg] || 1e-6;
      const t = clamp((target - cum[seg]) / segLen, 0, 1);
      samples.push({ s: target, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), tx: 0, tz: 1, nx: 1, nz: 0, curv: 0 });
    }
    const N = samples.length;
    for (let i = 0; i < N; i++) {
      const prev = samples[(i - 1 + N) % N];
      const next = samples[(i + 1) % N];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      const s = samples[i];
      s.tx = dx / len;
      s.tz = dz / len;
      s.nx = s.tz; // left = (tz, -tx)
      s.nz = -s.tx;
      this.minX = Math.min(this.minX, s.x);
      this.maxX = Math.max(this.maxX, s.x);
      this.minZ = Math.min(this.minZ, s.z);
      this.maxZ = Math.max(this.maxZ, s.z);
    }
    for (let i = 0; i < N; i++) {
      const prev = samples[(i - 1 + N) % N];
      const next = samples[(i + 1) % N];
      const hPrev = Math.atan2(prev.tx, prev.tz);
      const hNext = Math.atan2(next.tx, next.tz);
      samples[i].curv = wrapAngle(hNext - hPrev) / (2 * this.ds);
    }
    // сглаживание кривизны
    const sm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let j = -6; j <= 6; j++) acc += samples[(i + j + N) % N].curv;
      sm[i] = acc / 13;
    }
    for (let i = 0; i < N; i++) samples[i].curv = sm[i];
    this.samples = samples;
    // пространственный хеш
    for (let i = 0; i < N; i++) {
      const key = `${Math.floor(samples[i].x / CELL)},${Math.floor(samples[i].z / CELL)}`;
      let arr = this.grid.get(key);
      if (!arr) {
        arr = [];
        this.grid.set(key, arr);
      }
      arr.push(i);
    }
  }

  wrapS(s: number): number {
    const L = this.length;
    s = s % L;
    if (s < 0) s += L;
    return s;
  }

  indexAt(s: number): number {
    const i = Math.round(this.wrapS(s) / this.ds);
    return ((i % this.samples.length) + this.samples.length) % this.samples.length;
  }

  sampleAt(s: number): TrackSample {
    return this.samples[this.indexAt(s)];
  }

  pointAt(s: number, lateral = 0): { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number } {
    const sm = this.sampleAt(s);
    return {
      x: sm.x + sm.nx * lateral,
      y: sm.y,
      z: sm.z + sm.nz * lateral,
      tx: sm.tx,
      tz: sm.tz,
      nx: sm.nx,
      nz: sm.nz,
    };
  }

  // Ближайшая точка на оси трассы для (x,z). lateral>0 — слева.
  closest(x: number, z: number): ClosestResult {
    const samples = this.samples;
    const N = samples.length;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = -1;
    let bestD2 = Infinity;
    outer: for (let ring = 0; ring <= 10; ring++) {
      for (let ix = cx - ring; ix <= cx + ring; ix++) {
        for (let iz = cz - ring; iz <= cz + ring; iz++) {
          if (ring > 0 && Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== ring) continue;
          const arr = this.grid.get(`${ix},${iz}`);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const i = arr[k];
            const dx = x - samples[i].x;
            const dz = z - samples[i].z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = i;
            }
          }
        }
      }
      const minPossible = ring > 0 ? (ring - 1) * CELL : 0;
      if (best >= 0 && bestD2 < minPossible * minPossible) break outer;
    }
    if (best < 0) best = 0;
    // локальное уточнение проекцией на сегменты
    let bestS = 0;
    let bestLat = 0;
    let bestD = Infinity;
    let bestIdx = best;
    for (let j = best - 6; j <= best + 6; j++) {
      const i0 = ((j % N) + N) % N;
      const i1 = (i0 + 1) % N;
      const a = samples[i0];
      const b = samples[i1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const apx = x - a.x;
      const apz = z - a.z;
      const len2 = abx * abx + abz * abz || 1e-9;
      const t = clamp((apx * abx + apz * abz) / len2, 0, 1);
      const qx = a.x + abx * t;
      const qz = a.z + abz * t;
      const dx = x - qx;
      const dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        bestIdx = i0;
        const len = Math.sqrt(len2) || 1e-9;
        bestS = a.s + t * (b.s > a.s ? b.s - a.s : b.s + this.length - a.s);
        bestLat = ((abz * apx - abx * apz) / len) * (b.s > a.s ? 1 : 1);
        // знак: cross(ab, ap) = abx*apz - abz*apx; left normal n=(tz,-tx)=(abz,-abx)/len
        bestLat = (abz * apx - abx * apz) / len;
      }
    }
    const sm = samples[bestIdx];
    return {
      index: bestIdx,
      s: bestS,
      lateral: bestLat,
      x: sm.x + sm.nx * bestLat,
      y: sm.y,
      z: sm.z + sm.nz * bestLat,
      tx: sm.tx,
      tz: sm.tz,
      nx: sm.nx,
      nz: sm.nz,
      curv: sm.curv,
    };
  }

  terrainBase(x: number, z: number): number {
    return fbm2(x * 0.005, z * 0.005, 3) * 20 + fbm2(x * 0.021 + 13.7, z * 0.021 + 7.1, 2) * 4.5 - 6;
  }

  // Высота поверхности (дорога/поребрик/грунт) в точке.
  groundHeight(x: number, z: number): number {
    const c = this.closest(x, z);
    const edge = this.roadHalf + this.curb;
    let roadY = c.y;
    const al = Math.abs(c.lateral);
    if (al > this.roadHalf && al <= edge) roadY += 0.06; // поребрик
    if (al <= edge + 0.4) return roadY;
    const blend = smoothstep(edge + 0.4, edge + 32, al);
    return lerp(roadY, this.terrainBase(x, z), blend);
  }

  // Предел для колёс: дальше стены.
  wallLateral(): number {
    return this.roadHalf + this.curb + 0.15;
  }
}
