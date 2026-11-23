import { clamp } from '../utils/math';
import type { TrackData } from '../track/TrackDef';
import type { CarSpec } from '../config';
import { CAR_HALF_WIDTH, CAR_WHEELBASE } from '../config';

export interface VehicleInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1, +1 = вправо
  handbrake: boolean;
  nitro: boolean;
}
export const EMPTY_INPUT: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

export interface StepResult {
  s: number;
  lateral: number;
  onRoad: boolean;
  onCurb: boolean;
  offroad: boolean;
  wallHit: number;
  slip: number;
  groundY: number;
  curv: number;
}

const ZERO: StepResult = {
  s: 0, lateral: 0, onRoad: true, onCurb: true, offroad: false, wallHit: 0, slip: 0, groundY: 0, curv: 0,
};

export class Vehicle {
  spec: CarSpec;
  pos = { x: 0, y: 0, z: 0 };
  heading = 0;
  vel = { x: 0, z: 0 };
  steerVisual = 0;
  wheelDist = 0; // пройденный колёсами путь (для вращения)
  nitro = 1;
  rpm = 0;
  gear = 1;
  isReverse = false;
  last: StepResult = { ...ZERO };

  constructor(spec: CarSpec) {
    this.spec = spec;
  }

  forward(): { x: number; z: number } {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  get speedKmh(): number {
    return this.speed * 3.6;
  }
  get forwardSpeed(): number {
    const f = this.forward();
    return this.vel.x * f.x + this.vel.z * f.z;
  }

  respawn(track: TrackData, s: number, lateral = 0): void {
    const p = track.pointAt(s, lateral);
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.pos.y = track.groundHeight(p.x, p.z);
    this.heading = Math.atan2(p.tx, p.tz);
    this.vel.x = 0;
    this.vel.z = 0;
    this.last = { ...ZERO, s: track.wrapS(s), lateral, groundY: this.pos.y };
  }

  step(dt: number, input: VehicleInput, track: TrackData): StepResult {
    const spec = this.spec;
    const c = track.closest(this.pos.x, this.pos.z);
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let rx = -fz;
    let rz = fx;
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vr = this.vel.x * rx + this.vel.z * rz;

    const al = Math.abs(c.lateral);
    const onRoad = al <= track.roadHalf;
    const onCurb = al <= track.roadHalf + track.curb;
    const offroad = !onCurb;

    // --- руль ---
    const speed = Math.abs(vf);
    const steerMaxEff = spec.steerMax / (1 + speed * 0.042);
    const steerTarget = clamp(input.steer, -1, 1);
    this.steerVisual += (steerTarget - this.steerVisual) * Math.min(1, dt * 9);
    const steerAngle = this.steerVisual * steerMaxEff;
    const turnMul = input.handbrake ? 1.5 : 1;
    this.heading += (-(vf / CAR_WHEELBASE) * Math.tan(steerAngle) * turnMul) * dt;
    if (input.handbrake && Math.abs(input.steer) > 0.25) {
      this.heading += -Math.sign(input.steer) * 1.15 * clamp(speed / 16, 0, 1) * dt;
    }
    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    rx = -fz;
    rz = fx;

    // --- продольная динамика ---
    const top = spec.topSpeed;
    if (input.throttle > 0) {
      let a = spec.accel * input.throttle;
      if (input.nitro && this.nitro > 0.01) {
        a += spec.nitroPower;
        this.nitro = Math.max(0, this.nitro - dt * 0.34);
      }
      vf += a * dt * clamp(1 - vf / (top * 1.08), 0.1, 1);
    } else if (this.nitro < 1) {
      this.nitro = Math.min(1, this.nitro + dt * 0.05);
    }
    if (input.brake > 0) {
      if (vf > 0.4) vf -= spec.brake * input.brake * dt;
      else vf = Math.max(-9, vf - spec.accel * 0.6 * input.brake * dt);
    }
    let drag = 0.1 * vf + 0.0028 * vf * Math.abs(vf);
    if (offroad) drag += 2.4 * Math.sign(vf || 1) + 0.85 * vf;
    vf -= drag * dt;
    if (Math.abs(vf) < 0.06 && input.throttle === 0 && input.brake === 0) vf = 0;
    if (vf > top) vf = Math.max(top, vf - (vf - top) * 3.5 * dt);

    // --- поперечное сцепление ( занос ) ---
    let grip = onRoad ? spec.grip : onCurb ? spec.grip * 0.72 : spec.grip * 0.3;
    if (input.handbrake) grip *= 0.28;
    vr *= Math.max(0, 1 - grip * dt);

    this.vel.x = fx * vf + rx * vr;
    this.vel.z = fz * vf + rz * vr;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = track.groundHeight(this.pos.x, this.pos.z);
    this.wheelDist += vf * dt;

    // --- стены ---
    let wallHit = 0;
    const c2 = track.closest(this.pos.x, this.pos.z);
    const limit = track.wallLateral() - CAR_HALF_WIDTH * 0.8;
    const lat2 = c2.lateral;
    if (Math.abs(lat2) > limit) {
      const sign = Math.sign(lat2);
      const nx = c2.nx;
      const nz = c2.nz;
      this.pos.x = c2.x + nx * (sign * limit - lat2);
      this.pos.z = c2.z + nz * (sign * limit - lat2);
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn * sign > 0) {
        wallHit = vn * sign;
        this.vel.x -= nx * vn * 1.35;
        this.vel.z -= nz * vn * 1.35;
        this.vel.x *= 0.88;
        this.vel.z *= 0.88;
      }
      this.pos.y = track.groundHeight(this.pos.x, this.pos.z);
    }

    // --- трансмиссия / обороты ---
    const aSpeed = Math.abs(vf);
    this.isReverse = vf < -0.5;
    const gearSpan = top / 6;
    this.gear = this.isReverse ? -1 : clamp(Math.ceil(aSpeed / gearSpan) || 1, 1, 6);
    const inGear = aSpeed / gearSpan - (this.gear - 1);
    this.rpm = this.isReverse ? clamp(-vf / 9, 0, 1) : clamp(0.22 + 0.78 * clamp(inGear, 0, 1), 0, 1);

    const res: StepResult = {
      s: track.wrapS(c2.s),
      lateral: c2.lateral,
      onRoad,
      onCurb,
      offroad,
      wallHit,
      slip: Math.abs(vr),
      groundY: this.pos.y,
      curv: c2.curv,
    };
    this.last = res;
    return res;
  }
}
