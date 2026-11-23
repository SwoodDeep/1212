import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { QualityPreset } from '../config';

// Небо (HDRI), солнце с тенями, туман, окружающий свет.
export class Sky {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  pmrem: THREE.PMREMGenerator;
  hdriTex: THREE.Texture | null = null;
  hdriLowTex: THREE.Texture | null = null;
  envRT: THREE.WebGLRenderTarget | null = null;
  sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
  skyColor = new THREE.Color(0x8fc3ee);
  fogColor = new THREE.Color(0xa8c8e0);
  private hdriEnabled = true;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a6b4a, 0.55);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(this.fogColor, 80, 500);
    scene.background = this.skyColor;
  }

  async loadHdri(urlHigh: string, urlLow: string): Promise<void> {
    const loader = new RGBELoader();
    const [high, low] = await Promise.all([
      loader.loadAsync(urlHigh).catch(() => null),
      loader.loadAsync(urlLow).catch(() => null),
    ]);
    if (high) {
      high.mapping = THREE.EquirectangularReflectionMapping;
      this.hdriTex = high;
    }
    if (low) {
      low.mapping = THREE.EquirectangularReflectionMapping;
      this.hdriLowTex = low;
    }
    this.applyHdri();
  }

  setHdriEnabled(on: boolean): void {
    this.hdriEnabled = on;
    this.applyHdri();
  }

  private applyHdri(): void {
    if (this.hdriEnabled && this.hdriTex) {
      this.scene.background = this.hdriTex;
      this.scene.backgroundIntensity = 1.0;
      this.scene.environmentIntensity = 0.55;
      if (!this.envRT) {
        this.envRT = this.pmrem.fromEquirectangular(this.hdriTex);
        this.scene.environment = this.envRT.texture;
      }
      (this.scene.background as THREE.Texture).rotation = 0;
      if ('rotation' in (this.scene.background as object)) {
        (this.scene.background as THREE.Texture).rotation = 2.4;
      }
    } else {
      this.scene.background = this.skyColor;
      this.scene.environment = null;
      this.scene.environmentIntensity = 1;
    }
  }

  applyQuality(q: QualityPreset, dpr: number): void {
    this.sun.castShadow = q.shadows;
    if (q.shadowMapSize > 0 && this.sun.shadow.mapSize.x !== q.shadowMapSize) {
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    const half = q.shadowDistance;
    this.sun.shadow.camera.left = -half;
    this.sun.shadow.camera.right = half;
    this.sun.shadow.camera.top = half;
    this.sun.shadow.camera.bottom = -half;
    this.sun.shadow.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = q.fogNear;
    fog.far = q.fogFar;
    fog.color.copy(this.fogColor);
    this.scene.backgroundIntensity = 1.0;
  }

  // Солнце и shadow-камера следуют за игроком (с округлением до texel — меньше дрожания теней).
  follow(pos: THREE.Vector3, snap = 4): void {
    const sp = this.sunDir;
    this.sun.position.set(pos.x + sp.x * 220, pos.y + sp.y * 220, pos.z + sp.z * 220);
    const tx = Math.round(pos.x / snap) * snap;
    const tz = Math.round(pos.z / snap) * snap;
    this.sun.target.position.set(tx, pos.y, tz);
  }
}
