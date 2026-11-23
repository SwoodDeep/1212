import * as THREE from 'three';
import type { TrackData } from './TrackDef';
import { PropInstancer, rotYForTangent } from './PropInstancer';
import { ASSETS, WORLD_SIZE, TERRAIN_RES } from '../config';
import type { QualityPreset } from '../config';
import { hash2 } from '../utils/math';

export interface LoadedAssets {
  props: Record<string, THREE.Group>;
  trees: THREE.Group[];
  rocks: THREE.Group[];
  buildings: THREE.Group[];
  buildingTrees: THREE.Group[];
  buildingFence: THREE.Group;
  textures: Record<string, THREE.Texture>;
}

const ROAD_LIFT = 0.06;

interface Xf {
  i: number;
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
}

export class TrackWorld {
  group = new THREE.Group();
  track: TrackData;
  assets: LoadedAssets;
  treeInstancers: PropInstancer[] = [];
  rockInstancers: PropInstancer[] = [];
  treeTransforms: Xf[] = [];
  rockTransforms: Xf[] = [];
  private scatterSeed = 1337;

  constructor(track: TrackData, assets: LoadedAssets) {
    this.track = track;
    this.assets = assets;
    this.buildRoad();
    this.buildTerrain();
    this.buildProps();
    this.scatterNature();
  }

  // ---------- дорога ----------
  private roadGeometry(strips: { from: number; to: number; lift: number }[], vRepeat: number): THREE.BufferGeometry {
    const track = this.track;
    const N = track.samples.length;
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const stripLats = strips.map((s) => [s.from, s.to]);
    for (let i = 0; i <= N; i++) {
      const sm = track.samples[i % N];
      const sNext = i === N ? track.length : sm.s;
      for (let st = 0; st < strips.length; st++) {
        for (let e = 0; e < 2; e++) {
          const lat = stripLats[st][e];
          const x = sm.x + sm.nx * lat;
          const z = sm.z + sm.nz * lat;
          const lift = strips[st].lift + (e === 0 ? 0 : 0);
          positions.push(x, sm.y + lift + (lat > track.roadHalf && lat <= track.roadHalf + track.curb ? 0.05 : 0), z);
          uvs.push(e, sNext / vRepeat);
          colors.push(1, 1, 1);
        }
      }
    }
    const W = strips.length * 2;
    for (let i = 0; i < N; i++) {
      const a = i * W;
      const b = (i + 1) * W;
      for (let st = 0; st < strips.length; st++) {
        const o = st * 2;
        indices.push(a + o, b + o, a + o + 1, b + o, b + o + 1, a + o + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  private buildRoad(): void {
    const track = this.track;
    const rh = track.roadHalf;
    const cb = track.curb;
    const tex = this.assets.textures;
    const asphaltMat = new THREE.MeshStandardMaterial({
      map: tex.asphaltDiff, normalMap: tex.asphaltNor, roughnessMap: tex.asphaltArm, aoMap: tex.asphaltArm,
      roughness: 1.0, metalness: 0.0, color: 0xbfc3c9,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const road = new THREE.Mesh(this.roadGeometry([{ from: -rh, to: rh, lift: ROAD_LIFT }], 7), asphaltMat);
    road.receiveShadow = true;
    this.group.add(road);

    // поребрики: красно-белые сегменты по vertex color
    const curbGeo = this.roadGeometry([
      { from: -(rh + cb), to: -rh, lift: ROAD_LIFT },
      { from: rh, to: rh + cb, lift: ROAD_LIFT },
    ], 2.2);
    const colAttr = curbGeo.getAttribute('color') as THREE.BufferAttribute;
    const N = track.samples.length;
    const segLen = 4; // семплов на сегмент
    for (let i = 0; i <= N; i++) {
      const red = Math.floor((i % N) / segLen) % 2 === 0;
      for (let v = 0; v < 4; v++) {
        const idx = i * 4 + v;
        colAttr.setXYZ(idx, red ? 0.85 : 0.92, red ? 0.08 : 0.92, red ? 0.06 : 0.92);
      }
    }
    colAttr.needsUpdate = true;
    const curbMat = new THREE.MeshStandardMaterial({
      roughness: 0.9, metalness: 0.0, vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.receiveShadow = true;
    this.group.add(curb);

    // обочины (гравий)
    const sh = 2.6;
    const shoulderMat = new THREE.MeshStandardMaterial({
      map: tex.gravelDiff, normalMap: tex.gravelNor, roughness: 1.0, color: 0x9a938a,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const shoulder = new THREE.Mesh(
      this.roadGeometry([
        { from: -(rh + cb + sh), to: -(rh + cb), lift: ROAD_LIFT - 0.02 },
        { from: rh + cb, to: rh + cb + sh, lift: ROAD_LIFT - 0.02 },
      ], 4),
      shoulderMat
    );
    shoulder.receiveShadow = true;
    this.group.add(shoulder);

    // линия старта (шахматка)
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 32;
    const ctx = cv.getContext('2d')!;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 16; x++) {
        ctx.fillStyle = x % 2 === y % 2 ? '#f5f5f5' : '#141414';
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
    const startTex = new THREE.CanvasTexture(cv);
    startTex.colorSpace = THREE.SRGBColorSpace;
    startTex.anisotropy = 4;
    const p0 = track.pointAt(0, 0);
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(rh * 2, 3.2),
      new THREE.MeshBasicMaterial({ map: startTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.rotation.z = -Math.atan2(p0.tx, p0.tz);
    startLine.position.set(p0.x, p0.y + ROAD_LIFT + 0.012, p0.z);
    this.group.add(startLine);
  }

  // ---------- террейн ----------
  private buildTerrain(): void {
    const track = this.track;
    const size = WORLD_SIZE;
    const geo = new THREE.PlaneGeometry(size, size, TERRAIN_RES, TERRAIN_RES);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, track.groundHeight(x, z));
    }
    geo.computeVertexNormals();
    const tex = this.assets.textures;
    const mat = new THREE.MeshStandardMaterial({
      map: tex.grassDiff, normalMap: tex.grassNor, roughnessMap: tex.grassArm, aoMap: tex.grassArm,
      roughness: 1.0, metalness: 0,
    });
    mat.map!.repeat.set(size / 16, size / 16);
    mat.normalMap!.repeat.set(size / 16, size / 16);
    if (mat.aoMap) mat.aoMap.repeat.set(size / 16, size / 16);
    if (mat.roughnessMap) mat.roughnessMap.repeat.set(size / 16, size / 16);
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    this.group.add(terrain);
  }

  // ---------- пропсы вдоль трассы ----------
  private buildProps(): void {
    const track = this.track;
    const rh = track.roadHalf;
    const cb = track.curb;
    const N = track.samples.length;
    const A = this.assets;

    // барьеры обе стороны
    const wallLat = rh + cb + 0.75;
    const barrierEvery = 4;
    const barrierCount = Math.floor(N / barrierEvery) * 2;
    const barriers = new PropInstancer(A.props.barrierWall, barrierCount, { castShadow: false, receiveShadow: true });
    let bi = 0;
    for (let i = 0; i < N; i += barrierEvery) {
      const sm = track.samples[i];
      const y = sm.y + ROAD_LIFT;
      for (const side of [-1, 1]) {
        const lat = side * wallLat;
        barriers.set(bi++, sm.x + sm.nx * lat, y, sm.z + sm.nz * lat, rotYForTangent(sm.tx, sm.tz), 5.6);
      }
    }
    barriers.applyCount(bi);
    barriers.addTo(this.group);

    // фонари
    const postEvery = 40;
    const postCount = Math.floor(N / postEvery) * 2;
    const posts = new PropInstancer(A.props.lightPost, postCount, { castShadow: true });
    let pi = 0;
    for (let i = 0; i < N; i += postEvery) {
      const sm = track.samples[i];
      const side = (i / postEvery) % 2 === 0 ? 1 : -1;
      const lat = side * (rh + cb + 2.6);
      posts.set(pi++, sm.x + sm.nx * lat, sm.y + ROAD_LIFT, sm.z + sm.nz * lat, rotYForTangent(sm.tx, sm.tz) + Math.PI, 8);
    }
    posts.applyCount(pi);
    posts.addTo(this.group);

    // стартовый мост + флаги
    const gantry = A.props.overhead.clone();
    const p0 = track.pointAt(0, 0);
    gantry.position.set(p0.x, p0.y + ROAD_LIFT, p0.z);
    gantry.rotation.y = rotYForTangent(p0.tx, p0.tz);
    gantry.scale.setScalar(11.5);
    gantry.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
    this.group.add(gantry);
    for (const side of [-1, 1]) {
      const f = A.props.flagCheckers.clone();
      const fp = track.pointAt(0, side * (rh + 0.3));
      f.position.set(fp.x, fp.y + ROAD_LIFT, fp.z);
      f.rotation.y = rotYForTangent(fp.tx, fp.tz);
      f.scale.setScalar(3.2);
      this.group.add(f);
    }

    // трибуна и палатка у старта
    const gs = A.props.grandStand.clone();
    const gp = track.pointAt(track.length - 18, -(rh + cb + 8));
    gs.position.set(gp.x, track.groundHeight(gp.x, gp.z), gp.z);
    gs.rotation.y = rotYForTangent(gp.tx, gp.tz) + Math.PI;
    gs.scale.setScalar(11);
    gs.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.group.add(gs);
    const tent = A.props.tent.clone();
    const tp = track.pointAt(track.length - 30, rh + cb + 9);
    tent.position.set(tp.x, track.groundHeight(tp.x, tp.z), tp.z);
    tent.rotation.y = rotYForTangent(tp.tx, tp.tz) + 2.4;
    tent.scale.setScalar(7);
    this.group.add(tent);

    // билборды вдоль главной прямой
    const bbSpots = [70, 105, 140, 175];
    for (let k = 0; k < bbSpots.length; k++) {
      const s = bbSpots[k];
      const side = k % 2 === 0 ? 1 : -1;
      const bp = track.pointAt(s, side * (rh + cb + 7.5));
      const bb = A.props.billboard.clone();
      bb.position.set(bp.x, track.groundHeight(bp.x, bp.z), bp.z);
      bb.rotation.y = rotYForTangent(bp.tx, bp.tz) + (side > 0 ? Math.PI : 0);
      bb.scale.setScalar(6.5);
      bb.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.group.add(bb);
    }

    // конусы на апексе крутых поворотов
    const coneTransforms: number[][] = [];
    for (let i = 0; i < N; i++) {
      if (Math.abs(track.samples[i].curv) > 0.032 && i % 20 === 0) {
        const sm = track.samples[i];
        const side = Math.sign(track.samples[i].curv) || 1;
        for (let k = -1; k <= 1; k++) {
          const sm2 = track.samples[(i + k * 3 + N) % N];
          coneTransforms.push([sm2.x - sm2.nx * side * (rh - 0.8), sm2.y + ROAD_LIFT, sm2.z - sm2.nz * side * (rh - 0.8), rotYForTangent(sm2.tx, sm2.tz), 3.2]);
        }
      }
    }
    const cones = new PropInstancer(A.props.cone, Math.max(coneTransforms.length, 1), { castShadow: false });
    coneTransforms.forEach((t, i) => cones.set(i, t[0], t[1], t[2], t[3], t[4]));
    cones.applyCount(coneTransforms.length);
    cones.addTo(this.group);

    // пylon'ы вдоль прямых
    const pylonCount = Math.floor(N / 200) * 2;
    const pylons = new PropInstancer(A.props.pylon, pylonCount, { castShadow: true });
    let yi = 0;
    for (let i = 0; i < N; i += 200) {
      const sm = track.samples[i];
      for (const side of [-1, 1]) {
        const lat = side * (rh + cb + 16);
        pylons.set(yi++, sm.x + sm.nx * lat, track.groundHeight(sm.x + sm.nx * lat, sm.z + sm.nz * lat), sm.z + sm.nz * lat, Math.random() * 6.28, 55);
      }
    }
    pylons.applyCount(yi);
    pylons.addTo(this.group);

    // деревня неподалёку
    this.buildVillage();
  }

  private buildVillage(): void {
    const track = this.track;
    const base = track.pointAt(760, -130);
    const bx = base.x;
    const bz = base.z;
    for (let i = 0; i < 8; i++) {
      const gx = bx + (i % 4) * 22 + hash2(i, 3) * 8 - 4;
      const gz = bz + Math.floor(i / 4) * 24 + hash2(i, 7) * 8 - 4;
      const b = this.assets.buildings[i % this.assets.buildings.length].clone();
      b.position.set(gx, track.groundHeight(gx, gz), gz);
      b.rotation.y = hash2(i, 11) * Math.PI;
      b.scale.setScalar(7 + hash2(i, 5) * 3);
      b.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.group.add(b);
    }
    for (let i = 0; i < 6; i++) {
      const t = this.assets.buildingTrees[i % this.assets.buildingTrees.length].clone();
      const gx = bx - 30 + hash2(i, 21) * 90;
      const gz = bz - 25 + hash2(i, 31) * 70;
      t.position.set(gx, track.groundHeight(gx, gz), gz);
      t.rotation.y = hash2(i, 41) * 6.28;
      t.scale.setScalar(4 + hash2(i, 43) * 2);
      this.group.add(t);
    }
    for (let i = 0; i < 5; i++) {
      const f = this.assets.buildingFence.clone();
      const gx = bx - 12 + i * 18;
      const gz = bz + 30;
      f.position.set(gx, track.groundHeight(gx, gz), gz);
      f.rotation.y = 0.1 * i;
      f.scale.setScalar(6);
      this.group.add(f);
    }
  }

  // ---------- природа (instanced) ----------
  private scatterNature(): void {
    const track = this.track;
    const rh = track.roadHalf + track.curb;
    const rand = (a: number, b: number, s: number) => a + hash2(s, a * 7.13) * (b - a);
    const maxTrees = 700;
    const maxRocks = 240;
    this.treeInstancers = this.assets.trees.map((t) => new PropInstancer(t, Math.ceil(maxTrees / this.assets.trees.length), { castShadow: true, receiveShadow: true }));
    this.rockInstancers = this.assets.rocks.map((r) => new PropInstancer(r, Math.ceil(maxRocks / this.assets.rocks.length), { castShadow: true, receiveShadow: true }));
    const perSpecies: number[] = this.treeInstancers.map(() => 0);
    const perRock: number[] = this.rockInstancers.map(() => 0);
    let attempts = 0;
    while (this.treeTransforms.length < maxTrees && attempts++ < maxTrees * 30) {
      const x = rand(track.minX - 70, track.maxX + 70, attempts * 3.7);
      const z = rand(track.minZ - 70, track.maxZ + 70, attempts * 9.1);
      const c = track.closest(x, z);
      const d = Math.abs(c.lateral);
      if (d < rh + 10 || d > 480) continue;
      const sp = Math.floor(hash2(attempts, 77.7) * this.assets.trees.length) % this.assets.trees.length;
      const y = track.groundHeight(x, z);
      this.treeTransforms.push({ i: sp, x, y, z, rot: hash2(attempts, 5.5) * 6.28, s: 3.2 + hash2(attempts, 6.6) * 3.2 });
      perSpecies[sp]++;
    }
    attempts = 0;
    while (this.rockTransforms.length < maxRocks && attempts++ < maxRocks * 30) {
      const x = rand(track.minX - 50, track.maxX + 50, attempts * 4.3);
      const z = rand(track.minZ - 50, track.maxZ + 50, attempts * 8.9);
      const c = track.closest(x, z);
      const d = Math.abs(c.lateral);
      if (d < rh + 6 || d > 500) continue;
      const sp = Math.floor(hash2(attempts, 88.8) * this.assets.rocks.length) % this.assets.rocks.length;
      const y = track.groundHeight(x, z);
      this.rockTransforms.push({ i: sp, x, y, z, rot: hash2(attempts, 9.9) * 6.28, s: 2.5 + hash2(attempts, 3.3) * 4.5 });
      perRock[sp]++;
    }
    // применить трансформы
    const apply = (instancers: PropInstancer[], transforms: { i: number; x: number; y: number; z: number; rot: number; s: number }[]) => {
      const counters = instancers.map(() => 0);
      transforms.forEach((t) => {
        const inst = instancers[t.i];
        if (!inst) return;
        inst.set(counters[t.i]++, t.x, t.y, t.z, t.rot, t.s);
      });
      instancers.forEach((inst, i) => {
        inst.applyCount(counters[i]);
        inst.addTo(this.group);
      });
    };
    apply(this.treeInstancers, this.treeTransforms);
    apply(this.rockInstancers, this.rockTransforms);
  }

  applyQuality(q: QualityPreset): void {
    const apply = (instancers: PropInstancer[], transforms: Xf[], total: number) => {
      const counters = instancers.map(() => 0);
      const n = Math.min(total, transforms.length);
      for (let k = 0; k < n; k++) {
        const t = transforms[k];
        instancers[t.i].set(counters[t.i]++, t.x, t.y, t.z, t.rot, t.s);
      }
      instancers.forEach((inst, i) => inst.applyCount(counters[i]));
    };
    apply(this.treeInstancers, this.treeTransforms, q.treeCount);
    apply(this.rockInstancers, this.rockTransforms, q.rockCount);
    for (const inst of [...this.treeInstancers, ...this.rockInstancers]) {
      for (const m of inst.meshes) m.castShadow = q.shadows;
    }
  }
}
