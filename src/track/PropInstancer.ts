import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Разбивает GLTF-сцену на геометрии по материалам и создаёт InstancedMesh.
export class PropInstancer {
  meshes: THREE.InstancedMesh[] = [];
  transforms: THREE.Matrix4[] = [];
  capacity: number;

  constructor(gltfScene: THREE.Group, capacity: number, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}) {
    this.capacity = capacity;
    gltfScene.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    gltfScene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const { geom, mat } of splitByMaterial(mesh)) {
        let arr = byMat.get(mat);
        if (!arr) {
          arr = [];
          byMat.set(mat, arr);
        }
        arr.push(geom);
      }
    });
    // общий bbox по всем геометриям — центрируем проп
    const box = new THREE.Box3();
    for (const geoms of byMat.values()) for (const g of geoms) box.expandByObject(new THREE.Mesh(g));
    const center = box.getCenter(new THREE.Vector3());
    const off = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
    const dummy = new THREE.Object3D();
    for (const [mat, geoms] of byMat) {
      for (const g of geoms) g.applyMatrix4(off);
      const merged = mergeGeometries(geoms, false);
      if (!merged) continue;
      const im = new THREE.InstancedMesh(merged, mat, capacity);
      im.count = 0;
      im.castShadow = opts.castShadow ?? false;
      im.receiveShadow = opts.receiveShadow ?? true;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(im);
    }
    this._dummy = dummy;
  }

  private _dummy: THREE.Object3D;

  set(index: number, x: number, y: number, z: number, rotY: number, scale: number): void {
    if (index >= this.capacity) return;
    const d = this._dummy;
    d.position.set(x, y, z);
    d.rotation.set(0, rotY, 0);
    d.scale.setScalar(scale);
    d.updateMatrix();
    this.transforms[index] = d.matrix.clone();
    for (const m of this.meshes) m.setMatrixAt(index, d.matrix);
  }

  applyCount(n: number): void {
    for (const m of this.meshes) {
      m.count = Math.min(n, this.capacity);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  addTo(scene: THREE.Scene | THREE.Group): void {
    for (const m of this.meshes) scene.add(m);
  }
}

function splitByMaterial(mesh: THREE.Mesh): { geom: THREE.BufferGeometry; mat: THREE.Material }[] {
  const g = mesh.geometry;
  const nonIndexed = g.index ? g.toNonIndexed() : g.clone();
  nonIndexed.applyMatrix4(mesh.matrixWorld);
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const out: { geom: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  if (!g.index || g.groups.length === 0) {
    out.push({ geom: nonIndexed, mat: mats[0] });
    return out;
  }
  // toNonIndexed сохраняет группы (в терминах вершин)
  for (const grp of nonIndexed.groups) {
    const sub = new THREE.BufferGeometry();
    for (const name of Object.keys(nonIndexed.attributes)) {
      const attr = nonIndexed.attributes[name] as THREE.BufferAttribute;
      const start = grp.start * attr.itemSize;
      const count = grp.count * attr.itemSize;
      sub.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(start, start + count), attr.itemSize));
    }
    if (!sub.attributes.uv) {
      sub.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((sub.attributes.position.count) * 2), 2));
    }
    out.push({ geom: sub, mat: mats[grp.materialIndex ?? 0] ?? mats[0] });
  }
  return out;
}

export function rotYForTangent(tx: number, tz: number): number {
  return Math.atan2(-tz, tx);
}
