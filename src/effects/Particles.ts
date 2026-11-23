import * as THREE from 'three';

interface ParticleOpts {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number;
  r: number; g: number; b: number;
  a?: number;
  gravity?: number;
  drag?: number;
  grow?: number;
}

// Пул частиц на одном THREE.Points (без аллокаций в кадре).
export class ParticlePool {
  points: THREE.Points;
  budget: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private size0: Float32Array;
  private grow: Float32Array;
  private col: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private head = 0;
  active = 0;

  private static MAX = 768;

  constructor(scene: THREE.Scene, budget: number, texture: THREE.Texture, additive: boolean) {
    this.budget = Math.min(budget, ParticlePool.MAX);
    const alloc = ParticlePool.MAX;
    this.pos = new Float32Array(alloc * 3);
    this.vel = new Float32Array(alloc * 3);
    this.life = new Float32Array(alloc);
    this.maxLife = new Float32Array(alloc);
    this.size = new Float32Array(alloc);
    this.size0 = new Float32Array(alloc);
    this.grow = new Float32Array(alloc);
    this.col = new Float32Array(alloc * 4);
    this.grav = new Float32Array(alloc);
    this.drag = new Float32Array(alloc);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: `
        attribute float aSize;
        attribute vec4 aColor;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec4 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          float lum = dot(t.rgb, vec3(0.333));
          float a = max(t.a, lum);
          gl_FragColor = vec4(vColor.rgb * t.rgb * 2.0, vColor.a * a);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.setBudget(budget);
  }

  setBudget(n: number): void {
    this.budget = Math.min(n, ParticlePool.MAX);
    this.points.geometry.setDrawRange(0, this.budget);
    for (let i = this.budget; i < this.life.length; i++) this.life[i] = 0;
  }

  spawn(o: ParticleOpts): void {
    if (this.head >= this.budget) this.head = 0;
    const i = this.head++;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0; this.vel[i * 3 + 1] = o.vy ?? 0; this.vel[i * 3 + 2] = o.vz ?? 0;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.size0[i] = o.size;
    this.size[i] = o.size;
    this.grow[i] = o.grow ?? 0;
    this.col[i * 4] = o.r; this.col[i * 4 + 1] = o.g; this.col[i * 4 + 2] = o.b;
    this.col[i * 4 + 3] = o.a ?? 0.8;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt: number): void {
    for (let i = 0; i < this.budget; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr + this.grav[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] = this.size0[i] + this.grow[i] * (1 - t);
      this.col[i * 4 + 3] = (this.col[i * 4 + 3] / Math.max(0.0001, this.maxLife[i] / Math.max(0.0001, this.life[i] + dt))) * 0 + this.col[i * 4 + 3]; // оставляем как есть
      this.col[i * 4 + 3] *= Math.max(0, Math.min(1, t * 1.6));
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.size.fill(0);
  }
}
