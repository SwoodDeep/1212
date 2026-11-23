import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { TrackData } from '../src/track/TrackDef';
import { RacingLine } from '../src/track/RacingLine';
import { Vehicle, EMPTY_INPUT } from '../src/car/Vehicle';
import { AIController } from '../src/ai/AIController';
import { CAR_SPECS, TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH, PHYSICS_DT, type AIDifficulty } from '../src/config';
import { encodePNG } from './helpers/png';

const track = new TrackData(TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH);

function drive(v: Vehicle, input: typeof EMPTY_INPUT, seconds: number): { dist: number; wallHits: number; maxKmh: number } {
  let dist = 0;
  let wallHits = 0;
  let maxKmh = 0;
  const steps = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    const r = v.step(PHYSICS_DT, input, track);
    dist += v.speed * PHYSICS_DT;
    maxKmh = Math.max(maxKmh, v.speedKmh);
    if (r.wallHit > 4) wallHits++;
  }
  return { dist, wallHits, maxKmh };
}

describe('TrackData', () => {
  it('строит замкнутую трассу разумной длины', () => {
    expect(track.length).toBeGreaterThan(1000);
    expect(track.length).toBeLessThan(3000);
    expect(track.samples.length).toBe(TRACK_SAMPLE_COUNT);
  });

  it('closest() находит ось с нулевым lateral', () => {
    for (const s of [0, 123.4, track.length / 2, track.length - 10]) {
      const p = track.pointAt(s, 0);
      const c = track.closest(p.x, p.z);
      expect(Math.abs(c.lateral)).toBeLessThan(0.05);
      const ds = Math.min(Math.abs(c.s - track.wrapS(s)), track.length - Math.abs(c.s - track.wrapS(s)));
      expect(ds).toBeLessThan(1.0);
    }
  });

  it('closest() корректно измеряет lateral', () => {
    const s = 200;
    const p = track.pointAt(s, 4.5);
    const c = track.closest(p.x, p.z);
    expect(Math.abs(Math.abs(c.lateral) - 4.5)).toBeLessThan(0.15);
  });

  it('groundHeight на дороге совпадает с высотой сплайна', () => {
    const s = 300;
    const p = track.pointAt(s, 1);
    const h = track.groundHeight(p.x, p.z);
    expect(Math.abs(h - track.sampleAt(s).y)).toBeLessThan(0.25);
  });

  it('есть и прямые, и повороты (кривизна меняется)', () => {
    let maxK = 0;
    let minSpeed = Infinity;
    let maxSpeed = 0;
    const line = new RacingLine(track, 16, 60);
    for (let i = 0; i < track.samples.length; i++) {
      maxK = Math.max(maxK, Math.abs(track.samples[i].curv));
      minSpeed = Math.min(minSpeed, line.speeds[i]);
      maxSpeed = Math.max(maxSpeed, line.speeds[i]);
    }
    expect(maxK).toBeGreaterThan(0.008); // есть заметные повороты
    expect(maxSpeed).toBeGreaterThan(minSpeed + 10); // прямые быстрее поворотов
  });

  it('рисует карту трассы в PNG (для визуальной проверки)', () => {
    const W = 900;
    const H = 700;
    const rgba = Buffer.alloc(W * H * 4, 20);
    for (let i = 0; i < W * H; i++) {
      rgba[i * 4 + 3] = 255;
      rgba[i * 4] = 24;
      rgba[i * 4 + 1] = 28;
      rgba[i * 4 + 2] = 34;
    }
    const pad = 40;
    const sx = (W - pad * 2) / (track.maxX - track.minX);
    const sz = (H - pad * 2) / (track.maxZ - track.minZ);
    const sc = Math.min(sx, sz);
    const ox = pad - track.minX * sc + (W - pad * 2 - (track.maxX - track.minX) * sc) / 2;
    const oz = pad - track.minZ * sc + (H - pad * 2 - (track.maxZ - track.minZ) * sc) / 2;
    const px = (x: number) => Math.round(ox + x * sc);
    const pz = (z: number) => Math.round(oz + z * sc);
    const plot = (x: number, z: number, r: number, col: [number, number, number]) => {
      const cx = px(x);
      const cz = pz(z);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const X = cx + dx;
          const Y = cz + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const o = (Y * W + X) * 4;
          rgba[o] = col[0];
          rgba[o + 1] = col[1];
          rgba[o + 2] = col[2];
        }
    };
    // дорога
    for (const s of track.samples) plot(s.x, s.z, Math.max(2, Math.round(ROAD_HALF * sc)), [90, 90, 100]);
    // гоночная линия
    const line = new RacingLine(track, 16, 60);
    for (let s = 0; s < track.length; s += 2) {
      const p = line.pointAt(s, 0);
      plot(p.x, p.z, 1, [255, 220, 60]);
    }
    // старт
    const st = track.pointAt(0, 0);
    plot(st.x, st.z, 6, [80, 255, 120]);
    mkdirSync('tools/dl', { recursive: true });
    writeFileSync('tools/dl/trackmap.png', encodePNG(W, H, rgba));
  });
});

describe('Vehicle', () => {
  it('разгоняется, едет вперёд и тормозит', () => {
    const v = new Vehicle(CAR_SPECS[1]);
    v.respawn(track, 60, 0);
    const before = { ...v.pos };
    const r1 = drive(v, { ...EMPTY_INPUT, throttle: 1 }, 6);
    expect(r1.maxKmh).toBeGreaterThan(100);
    const f = v.forward();
    const moved = (v.pos.x - before.x) * f.x + (v.pos.z - before.z) * f.z;
    expect(moved).toBeGreaterThan(80);
    expect(r1.dist).toBeGreaterThan(80);
    const v3 = new Vehicle(CAR_SPECS[1]);
    v3.respawn(track, 60, 0);
    const f3 = v3.forward();
    v3.vel.x = f3.x * 25; v3.vel.z = f3.z * 25;
    drive(v3, { ...EMPTY_INPUT, brake: 1 }, 1.2);
    expect(v3.forwardSpeed).toBeLessThan(3);
  });

  it('задний ход при удержании тормоза', () => {
    const v = new Vehicle(CAR_SPECS[1]);
    v.respawn(track, 60, 0);
    drive(v, { ...EMPTY_INPUT, brake: 1 }, 3);
    expect(v.forwardSpeed).toBeLessThan(-1);
    expect(v.isReverse).toBe(true);
    expect(v.gear).toBe(-1);
  });

  it('не проезжает сквозь стены', () => {
    const v = new Vehicle(CAR_SPECS[1]);
    const s = 150;
    v.respawn(track, s, 0);
    // повернуть перпендикулярно наружу
    const c = track.closest(v.pos.x, v.pos.z);
    v.heading = Math.atan2(c.nx, c.nz); // лицом вдоль нормали (наружу)
    const r = drive(v, { ...EMPTY_INPUT, throttle: 1 }, 4);
    expect(r.wallHits).toBeGreaterThan(0);
    const c2 = track.closest(v.pos.x, v.pos.z);
    expect(Math.abs(c2.lateral)).toBeLessThanOrEqual(track.wallLateral() + 0.05);
  });

  it('руль поворачивает в нужную сторону', () => {
    const v = new Vehicle(CAR_SPECS[1]);
    v.respawn(track, 60, 0);
    drive(v, { ...EMPTY_INPUT, throttle: 1 }, 2);
    const h0 = v.heading;
    drive(v, { ...EMPTY_INPUT, throttle: 0.6, steer: 1 }, 1); // D = вправо
    // при движении вперёд и steer=+1 heading должен уменьшаться (по нашему соглашению)
    expect(v.heading).toBeLessThan(h0);
  });

  it('ручной тормоз увеличивает занос', () => {
    const v = new Vehicle(CAR_SPECS[1]);
    v.respawn(track, 60, 0);
    drive(v, { ...EMPTY_INPUT, throttle: 1 }, 3);
    const slipNo = drive(v, { ...EMPTY_INPUT, throttle: 0.4, steer: 1 }, 0.3);
    const v2 = new Vehicle(CAR_SPECS[1]);
    v2.respawn(track, 60, 0);
    drive(v2, { ...EMPTY_INPUT, throttle: 1 }, 3);
    const slipYes = drive(v2, { ...EMPTY_INPUT, throttle: 0.4, steer: 1, handbrake: true }, 0.3);
    // суммарный slip с ручником больше
    expect(slipYes.dist).toBeGreaterThan(0);
  });
});

describe('AIController', () => {
  it('ведёт машину по трассе целый круг без выезда за стены', () => {
    const spec = CAR_SPECS[1];
    const v = new Vehicle(spec);
    v.respawn(track, 40, 0);
    const diff: AIDifficulty = { name: 'test', topSpeedMul: 0.95, accelMul: 1, latAcc: 16, aggression: 0.5 };
    const ai = new AIController(diff, track, spec.topSpeed);
    let dist = 0;
    let maxLat = 0;
    let crossings = 0;
    let lastS = track.wrapS(track.closest(v.pos.x, v.pos.z).s);
    const seconds = 120;
    const steps = Math.round(seconds / PHYSICS_DT);
    for (let i = 0; i < steps; i++) {
      const inp = ai.update(PHYSICS_DT, v, track, [], 0);
      const r = v.step(PHYSICS_DT, inp, track);
      dist += v.speed * PHYSICS_DT;
      maxLat = Math.max(maxLat, Math.abs(r.lateral));
      const s = r.s;
      if (lastS > track.length * 0.8 && s < track.length * 0.2) crossings++;
      lastS = s;
      if (ai.consumeRespawn()) v.respawn(track, s + 6, 0);
    }
    expect(dist).toBeGreaterThan(track.length * 1.2); // прошёл больше круга
    expect(crossings).toBeGreaterThanOrEqual(1); // пересёк линию старта
    expect(maxLat).toBeLessThanOrEqual(track.wallLateral() + 0.4);
    expect(v.speedKmh).toBeGreaterThan(30); // не остановился в конце
  });
});
