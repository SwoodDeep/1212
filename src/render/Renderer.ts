import * as THREE from 'three';
import type { QualityPreset } from '../config';

export class GameRenderer {
  renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = true;
  }

  applyQuality(q: QualityPreset): void {
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatioMax);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
