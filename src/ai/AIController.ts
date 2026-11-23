import { clamp, wrapAngle } from '../utils/math';
import type { TrackData } from '../track/TrackDef';
import { RacingLine } from '../track/RacingLine';
import type { Vehicle, VehicleInput } from '../car/Vehicle';
import type { AIDifficulty } from '../config';

export interface OtherCar {
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  speed: number;
}

// Контроллер AI: pure-pursuit по гоночной линии + целевая скорость по кривизне + избегание + восстановление.
export class AIController {
  diff: AIDifficulty;
  line: RacingLine;
  input: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
  personalLat: number;
  avoidLat = 0;
  stuckTime = 0;
  respawnRequested = false;
  private wanderT = 0;

  constructor(diff: AIDifficulty, track: TrackData, topSpeed: number) {
    this.diff = diff;
    this.line = new RacingLine(track, diff.latAcc, topSpeed * diff.topSpeedMul);
    this.personalLat = (Math.random() - 0.5) * 3.4;
  }

  update(dt: number, vehicle: Vehicle, track: TrackData, others: OtherCar[], playerAhead: number): VehicleInput {
    const inp = this.input;
    const c = track.closest(vehicle.pos.x, vehicle.pos.z);
    const s = track.wrapS(c.s);
    const vf = vehicle.forwardSpeed;
    const speed = Math.abs(vf);

    // блуждающее личное смещение (обгоны/разъезд)
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 2 + Math.random() * 4;
      this.personalLat = (Math.random() - 0.5) * 3.6;
    }

    // --- избегание столкновений ---
    let avoid = 0;
    let hardBrake = false;
    const f = vehicle.forward();
    for (const o of others) {
      const ox = o.pos.x - vehicle.pos.x;
      const oz = o.pos.z - vehicle.pos.z;
      const dist = Math.hypot(ox, oz);
      if (dist > 30 || dist < 1e-3) continue;
      const ahead = ox * f.x + oz * f.z;
      if (ahead < -3) continue;
      const side = ox * -f.z + oz * f.x; // >0 — справа от нас (r=(-fz,fx))
      if (Math.abs(side) < 2.8 && ahead < 9 + speed * 0.55) {
        avoid = side > 0 ? -3.4 : 3.4;
        if (ahead < 4.5 + speed * 0.3 && o.speed < speed + 2) hardBrake = true;
      }
    }
    this.avoidLat += (avoid - this.avoidLat) * Math.min(1, dt * 3);

    const lat = this.line.offsetAt(s) + this.personalLat + this.avoidLat;
    const look = 6 + speed * 0.55;
    const p = track.pointAt(s + look, this.line.offsetAt(s + look) + this.personalLat + this.avoidLat);
    const dx = p.x - vehicle.pos.x;
    const dz = p.z - vehicle.pos.z;
    const desired = Math.atan2(dx, dz);
    const err = wrapAngle(desired - vehicle.heading);
    inp.steer = clamp(-err * 1.7, -1, 1);

    // --- целевая скорость ---
    let targetV = Math.min(this.line.speedAt(s + look * 1.7), this.line.speedAt(s + look * 0.7) * 1.15 + 6);
    // резиновая нить к игроку (мягкая)
    if (playerAhead > 140) targetV *= 1.05;
    else if (playerAhead < -140) targetV *= 0.96;
    if (hardBrake) targetV *= 0.5;
    // в крутых поворотах не гнать
    if (Math.abs(err) > 0.55 && speed > targetV) targetV = Math.min(targetV, speed * 0.9);

    if (vf > targetV + 1.2) {
      inp.throttle = 0;
      inp.brake = clamp((vf - targetV) * 0.22, 0.25, 1);
    } else {
      inp.brake = 0;
      inp.throttle = clamp((targetV - vf) * 0.28 + 0.3, 0, 1);
    }
    inp.handbrake = Math.abs(err) > 0.95 && speed > 20 && this.diff.aggression > 0.65;
    inp.nitro = Math.abs(err) < 0.12 && vf > vehicle.spec.topSpeed * 0.62 && this.diff.aggression > 0.5;

    // --- застревание ---
    if (speed < 3) this.stuckTime += dt;
    else this.stuckTime = 0;
    if (this.stuckTime > 2.2) {
      this.respawnRequested = true;
      this.stuckTime = 0;
    }
    return inp;
  }

  consumeRespawn(): boolean {
    if (this.respawnRequested) {
      this.respawnRequested = false;
      return true;
    }
    return false;
  }
}
