import * as THREE from 'three';

// Следы шин: кольцевой буфер кводов над дорогой, один draw call.
export class SkidMarks {
  mesh: THREE.Mesh;
  maxQuads: number;
  private positions: Float32Array;
  private colors: Float32Array;
  private uvs: Float32Array;
  private head = 0;
  private count = 0;
  private fade = 1;

  constructor(scene: THREE.Scene, maxQuads: number) {
    this.maxQuads = maxQuads;
    this.positions = new Float32Array(maxQuads * 4 * 3);
    this.colors = new Float32Array(maxQuads * 4 * 4);
    this.uvs = new Float32Array(maxQuads * 4 * 2);
    const indices = new Uint32Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i++) {
      const v = i * 4;
      const o = i * 6;
      indices[o] = v; indices[o + 1] = v + 1; indices[o + 2] = v + 2;
      indices[o + 3] = v + 1; indices[o + 4] = v + 3; indices[o + 5] = v + 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.setBudget(maxQuads);
  }

  setBudget(n: number): void {
    this.maxQuads = n;
    this.mesh.geometry.setDrawRange(0, n * 6);
  }

  // сегмент от (x0,z0) до (x1,z1), ширина w, яркость alpha
  addSegment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, alpha: number): void {
    if (this.head >= this.maxQuads) this.head = 0;
    const q = this.head++;
    if (this.count < this.maxQuads) this.count++;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const nx = (-dz / len) * w * 0.5;
    const nz = (dx / len) * w * 0.5;
    const v = q * 12;
    const ymid = (y0 + y1) / 2 + 0.02;
    this.positions[v] = x0 - nx; this.positions[v + 1] = y0 + 0.02; this.positions[v + 2] = z0 - nz;
    this.positions[v + 3] = x0 + nx; this.positions[v + 4] = y0 + 0.02; this.positions[v + 5] = z0 + nz;
    this.positions[v + 6] = x1 - nx; this.positions[v + 7] = y1 + 0.02; this.positions[v + 8] = z1 - nz;
    this.positions[v + 9] = x1 + nx; this.positions[v + 10] = y1 + 0.02; this.positions[v + 11] = z1 + nz;
    for (let k = 0; k < 4; k++) {
      this.colors[(q * 4 + k) * 4] = 0.04;
      this.colors[(q * 4 + k) * 4 + 1] = 0.04;
      this.colors[(q * 4 + k) * 4 + 2] = 0.045;
      this.colors[(q * 4 + k) * 4 + 3] = alpha;
    }
    this.uvs[q * 8] = 0; this.uvs[q * 8 + 1] = 0;
    this.uvs[q * 8 + 2] = 1; this.uvs[q * 8 + 3] = 0;
    this.uvs[q * 8 + 4] = 0; this.uvs[q * 8 + 5] = 1;
    this.uvs[q * 8 + 6] = 1; this.uvs[q * 8 + 7] = 1;
  }

  update(dt: number): void {
    const f = Math.exp(-dt * 0.055);
    if (Math.abs(f - 1) > 1e-6) {
      for (let i = 0; i < this.count * 4; i++) this.colors[i * 4 + 3] *= f;
      (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.count * 6);
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}
