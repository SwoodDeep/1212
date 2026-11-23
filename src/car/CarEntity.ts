import * as THREE from 'three';
import type { CarSpec } from '../config';
import { Vehicle } from './Vehicle';
import type { TrackData } from '../track/TrackDef';
import { clamp, damp } from '../utils/math';

export interface WheelRef {
  node: THREE.Object3D;
  base: THREE.Vector3;
  front: boolean;
  left: boolean;
  radius: number;
}

// Машина: GLTF-модель + физика + визуальная подвеска/колёса.
export class CarEntity {
  spec: CarSpec;
  vehicle: Vehicle;
  group = new THREE.Group();
  chassis = new THREE.Group();
  wheels: WheelRef[] = [];
  private roll = 0;
  private pitch = 0;
  private wheelBase = 2.4;
  private trackWidth = 1.9;
  private tmp = new THREE.Vector3();

  constructor(spec: CarSpec) {
    this.spec = spec;
    this.vehicle = new Vehicle(spec);
  }

  buildFrom(scene: THREE.Group): void {
    const scale = this.spec.scale;
    scene.updateMatrixWorld(true);
    const inner = new THREE.Group();
    inner.scale.setScalar(scale);
    this.group.add(inner);
    inner.add(this.chassis);

    const wheelNodes: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (/wheel/i.test(o.name)) wheelNodes.push(o);
    });
    for (const w of wheelNodes) {
      const base = w.position.clone();
      const box = new THREE.Box3().setFromObject(w);
      const radius = Math.max(0.05, (box.max.y - box.min.y) / 2);
      w.parent?.remove(w);
      w.position.copy(base);
      w.rotation.set(0, 0, 0);
      inner.add(w);
      this.wheels.push({
        node: w,
        base,
        front: base.z > 0,
        left: base.x > 0,
        radius,
      });
      (w as THREE.Mesh).castShadow = true;
    }
    this.chassis.add(scene);
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        if (this.spec.tint !== 0xffffff && Array.isArray(m.material)) {
          m.material = m.material.map((mm) => {
            const c = (mm as THREE.MeshStandardMaterial).clone();
            c.color?.multiply(new THREE.Color(this.spec.tint));
            return c;
          });
        } else if (this.spec.tint !== 0xffffff) {
          const c = (m.material as THREE.MeshStandardMaterial).clone();
          c.color?.multiply(new THREE.Color(this.spec.tint));
          m.material = c;
        }
      }
    });
    if (this.wheels.length >= 2) {
      const fronts = this.wheels.filter((w) => w.front);
      const backs = this.wheels.filter((w) => !w.front);
      if (fronts.length && backs.length) {
        this.wheelBase = Math.abs(fronts[0].base.z - backs[0].base.z) * scale;
        this.trackWidth = Math.abs(this.wheels[0].base.x - this.wheels[1].base.x) * scale || 1.9;
      }
    }
  }

  respawn(track: TrackData, s: number, lat = 0): void {
    this.vehicle.respawn(track, s, lat);
    this.syncVisual(track, 1);
  }

  syncVisual(track: TrackData, dt: number): void {
    const v = this.vehicle;
    this.group.position.set(v.pos.x, v.pos.y, v.pos.z);
    this.group.rotation.y = v.heading;
    this.group.updateMatrixWorld(true);
    const scale = this.spec.scale;
    const grounds: number[] = [];
    for (const w of this.wheels) {
      this.tmp.copy(w.base).multiplyScalar(scale);
      this.group.localToWorld(this.tmp);
      const g = track.groundHeight(this.tmp.x, this.tmp.z);
      grounds.push(g);
      const susp = clamp((g - v.pos.y) / scale, -0.13, 0.13);
      w.node.position.y = w.base.y + susp;
      w.node.rotation.y = w.front ? -v.steerVisual * 0.42 : 0;
      w.node.rotation.x = -v.wheelDist / w.radius;
    }
    if (grounds.length === 4) {
      const [fl, fr, bl, br] = grounds;
      const targetPitch = Math.atan2((bl + br) / 2 - (fl + fr) / 2, this.wheelBase);
      const targetRoll = Math.atan2((fr + br) / 2 - (fl + bl) / 2, this.trackWidth);
      this.pitch = damp(this.pitch, targetPitch * 0.8, 7, dt);
      this.roll = damp(this.roll, -targetRoll * 0.8, 7, dt);
      this.chassis.rotation.x = -this.pitch;
      this.chassis.rotation.z = this.roll;
    }
  }
}
