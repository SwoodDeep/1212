import * as THREE from 'three';
import { clamp, damp } from '../utils/math';
import type { TrackData } from '../track/TrackDef';

interface CamMode {
  dist: number;
  h: number;
  look: number;
  hood: boolean;
}
const MODES: CamMode[] = [
  { dist: 8.8, h: 3.5, look: 7.5, hood: false },
  { dist: 6.0, h: 2.3, look: 6.0, hood: false },
  { dist: 1.6, h: 1.28, look: 12.0, hood: true },
];

export class CameraRig {
  mode = 0;
  pos = new THREE.Vector3(0, 5, -10);
  fov = 62;
  shake = 0;
  private lookAt = new THREE.Vector3();
  private desired = new THREE.Vector3();

  cycleMode(): number {
    this.mode = (this.mode + 1) % MODES.length;
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, carPos: THREE.Vector3, heading: number, speedKmh: number, nitroActive: boolean, track: TrackData): void {
    const m = MODES[this.mode];
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const dist = m.hood ? m.dist : m.dist + clamp(speedKmh / 260, 0, 1) * 1.6;
    this.desired.set(carPos.x - fx * dist, carPos.y + m.h, carPos.z - fz * dist);
    const minY = track.groundHeight(this.desired.x, this.desired.z) + 0.55;
    if (this.desired.y < minY) this.desired.y = minY;
    const lambda = m.hood ? 30 : 5.5;
    this.pos.x = damp(this.pos.x, this.desired.x, lambda, dt);
    this.pos.y = damp(this.pos.y, this.desired.y, lambda, dt);
    this.pos.z = damp(this.pos.z, this.desired.z, lambda, dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake * 0.22;
    camera.position.set(
      this.pos.x + (Math.random() - 0.5) * sh,
      this.pos.y + (Math.random() - 0.5) * sh * 0.7,
      this.pos.z + (Math.random() - 0.5) * sh
    );
    this.lookAt.set(carPos.x + fx * m.look, carPos.y + 1.15, carPos.z + fz * m.look);
    camera.lookAt(this.lookAt);
    const targetFov = 62 + clamp(speedKmh, 0, 280) * 0.05 + (nitroActive ? 7 : 0);
    this.fov = damp(this.fov, targetFov, 3.5, dt);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  menuOrbit(dt: number, camera: THREE.PerspectiveCamera, center: THREE.Vector3, radius: number, height: number, angleRef: { a: number }): void {
    angleRef.a += dt * 0.12;
    camera.position.set(center.x + Math.sin(angleRef.a) * radius, center.y + height, center.z + Math.cos(angleRef.a) * radius);
    camera.lookAt(center.x, center.y + 1.5, center.z);
    if (Math.abs(camera.fov - 55) > 0.01) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
  }
}
