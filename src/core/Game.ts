import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import {
  ASSETS, CAR_SPECS, QUALITY_PRESETS, RACE_LAPS, DEFAULT_SETTINGS, PHYSICS_DT,
  TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH,
  type Settings, type RaceMode, type QualityPreset, type CarSpec,
} from '../config';
import { TrackData } from '../track/TrackDef';
import { TrackWorld, type LoadedAssets } from '../track/TrackMesh';
import { GameRenderer } from '../render/Renderer';
import { Sky } from '../render/Sky';
import { CarEntity } from '../car/CarEntity';
import { Vehicle, EMPTY_INPUT, type VehicleInput } from '../car/Vehicle';
import { AIController } from '../ai/AIController';
import { AI_LEVELS, AI_NAMES } from '../config';
import { RaceManager, type RaceCar } from '../race/RaceManager';
import { Input } from './Input';
import { UI, type Screen, type Action } from '../ui/UI';
import { AudioEngine } from '../audio/AudioEngine';
import { ParticlePool } from '../effects/Particles';
import { SkidMarks } from '../effects/SkidMarks';
import { CameraRig } from '../effects/CameraRig';
import { loadJSON, saveJSON } from '../utils/storage';
import { clamp, damp, formatTime } from '../utils/math';

export type GameState = 'loading' | 'menu' | 'race' | 'pause' | 'results';

const AI_COLORS = [0x35c4ff, 0xff8c1a, 0xb44bff, 0x4bff88];

export class Game {
  canvas: HTMLCanvasElement;
  rendererWrap: GameRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sky: Sky;
  track!: TrackData;
  race!: RaceManager;
  world: TrackWorld | null = null;
  assets: LoadedAssets | null = null;
  ui: UI;
  input = new Input();
  audio = new AudioEngine();
  cameraRig = new CameraRig();
  smoke: ParticlePool | null = null;
  dust: ParticlePool | null = null;
  sparks: ParticlePool | null = null;
  flame: ParticlePool | null = null;
  skids: SkidMarks;

  state: GameState = 'loading';
  settings: Settings;
  cars: CarEntity[] = [];
  raceCars: RaceCar[] = [];
  playerCar: CarEntity | null = null;
  playerAI: AIController | null = null;
  autopilot = false;
  private acc = 0;
  private last = 0;
  private menuAngle = { a: 0 };
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bloomEnabled = false;
  private glbCache = new Map<string, THREE.Group>();
  private texCache = new Map<string, THREE.Texture>();
  private qualityIdx = 1;
  private fpsEma = 60;
  private frameCount = 0;
  private autoWindows: number[] = [];
  private pendingResults = 0;
  private aiInputs = new Map<number, VehicleInput>();
  private wheelPrev = new Map<string, { x: number; y: number; z: number }>();
  private stats = { fps: 60, frameMs: 16, calls: 0, tris: 0 };
  debugSteps = 0;
  params: URLSearchParams;
  ready = false;
  private timeScale = 1;

  constructor(params: URLSearchParams) {
    this.params = params;
    this.timeScale = Math.max(1, Math.min(8, parseFloat(params.get('ff') || '1') || 1));
    this.track = new TrackData(TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH);
    this.race = new RaceManager(this.track);
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.rendererWrap = new GameRenderer(this.canvas);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 6, -12);
    this.sky = new Sky(this.scene, this.rendererWrap.renderer);
    this.settings = loadJSON<Settings>('settings', DEFAULT_SETTINGS);
    if (params.get('quality') === 'low' || params.get('quality') === 'medium' || params.get('quality') === 'high') {
      this.settings.quality = params.get('quality') as Settings['quality'];
    }
    this.qualityIdx = QUALITY_PRESETS.findIndex((q) => q.id === this.settings.quality);
    if (this.qualityIdx < 0) this.qualityIdx = 1;
    this.ui = new UI(document.getElementById('ui-root')!, this.settings, (a, v) => this.handleAction(a, v));
    this.skids = new SkidMarks(this.scene, 1200);
    window.addEventListener('resize', () => this.onResize());
    this.input.attach();
    window.addEventListener('pointerdown', () => this.audio.ensure(), { once: false });
    window.addEventListener('keydown', () => this.audio.ensure(), { once: false });
  }

  getStats(): { fps: number; frameMs: number; calls: number; tris: number; steps: number } {
    return { ...this.stats, steps: this.debugSteps };
  }

  debugSetQuality(q: 'low' | 'medium' | 'high'): void {
    this.handleAction('quality', q);
  }

  get quality(): QualityPreset {
    return QUALITY_PRESETS[this.qualityIdx];
  }

  async init(): Promise<void> {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => this.ui.setLoading(loaded / total, 'Загрузка ассетов…');
    const gltf = new GLTFLoader(manager);
    const texLoader = new THREE.TextureLoader(manager);

    const loadGlb = async (url: string): Promise<THREE.Group> => {
      if (this.glbCache.has(url)) return this.glbCache.get(url)!;
      const g = (await gltf.loadAsync(url)).scene;
      this.glbCache.set(url, g);
      return g;
    };
    const loadTex = async (url: string, srgb: boolean): Promise<THREE.Texture> => {
      if (this.texCache.has(url)) return this.texCache.get(url)!;
      const t = await texLoader.loadAsync(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      this.texCache.set(url, t);
      return t;
    };

    this.ui.setLoading(0.02, 'Текстуры…');
    const T = ASSETS.tex;
    const [asphaltDiff, asphaltNor, asphaltArm, grassDiff, grassNor, grassArm, gravelDiff, gravelNor, metalDiff, metalNor] = await Promise.all([
      loadTex(T.asphaltDiff, true), loadTex(T.asphaltNor, false), loadTex(T.asphaltArm, false),
      loadTex(T.grassDiff, true), loadTex(T.grassNor, false), loadTex(T.grassArm, false),
      loadTex(T.gravelDiff, true), loadTex(T.gravelNor, false),
      loadTex(T.metalDiff, true), loadTex(T.metalNor, false),
    ]);

    this.ui.setLoading(0.25, 'Небо…');
    await this.sky.loadHdri(ASSETS.hdriHigh, ASSETS.hdriLow);

    this.ui.setLoading(0.35, 'Модели машин…');
    const carGlbs = await Promise.all(CAR_SPECS.map((c) => loadGlb(c.model)));

    this.ui.setLoading(0.5, 'Окружение…');
    const propUrls = Object.values(ASSETS.props);
    const propGlbs = await Promise.all(propUrls.map(loadGlb));
    const treeGlbs = await Promise.all(ASSETS.trees.map(loadGlb));
    const rockGlbs = await Promise.all(ASSETS.rocks.map(loadGlb));
    const buildingGlbs = await Promise.all(ASSETS.buildings.map(loadGlb));
    const bTreeGlbs = await Promise.all(ASSETS.buildingTrees.map(loadGlb));
    const fenceGlb = await loadGlb(ASSETS.buildingFence);

    this.ui.setLoading(0.7, 'Построение трассы…');
    const props: Record<string, THREE.Group> = {};
    Object.keys(ASSETS.props).forEach((k, i) => (props[k] = propGlbs[i]));
    this.assets = {
      props,
      trees: treeGlbs,
      rocks: rockGlbs,
      buildings: buildingGlbs,
      buildingTrees: bTreeGlbs,
      buildingFence: fenceGlb,
      textures: { asphaltDiff, asphaltNor, asphaltArm, grassDiff, grassNor, grassArm, gravelDiff, gravelNor, metalDiff, metalNor },
    };
    this.world = new TrackWorld(this.track, this.assets);
    this.scene.add(this.world.group);

    this.ui.setLoading(0.85, 'Частицы и звуки…');
    const [smokeTex, smoke2Tex, dustTex, sparkTex, flameTex] = await Promise.all([
      loadTex(ASSETS.particles.smoke, true), loadTex(ASSETS.particles.smoke2, true),
      loadTex(ASSETS.particles.dust, true), loadTex(ASSETS.particles.spark, true), loadTex(ASSETS.particles.flame, true),
    ]);
    this.smoke = new ParticlePool(this.scene, 300, smokeTex, false);
    this.dust = new ParticlePool(this.scene, 200, dustTex, false);
    this.sparks = new ParticlePool(this.scene, 120, sparkTex, true);
    this.flame = new ParticlePool(this.scene, 100, flameTex, true);
    if (!this.params.has('noaudio')) await this.audio.loadAll();

    // постобработка (bloom)
    this.composer = new EffectComposer(this.rendererWrap.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.55, 0.82);
    this.composer.addPass(this.bloomPass);

    this.applyQuality();
    this.ui.buildMinimap(this.track);
    this.spawnPlayerCar();
    this.ui.setLoading(1, 'Готово');
    this.state = 'menu';
    this.ui.show('menu');
    this.updateRecordsLine();
    this.race.hooks = {
      onCountdown: (n) => {
        this.ui.countdown(String(n));
        this.audio.countdownBeep();
      },
      onGo: () => {
        this.ui.countdown('GO!', true);
        this.audio.goBeep();
        setTimeout(() => this.ui.hideCountdown(), 900);
      },
      onLap: (car, t) => {
        if (car.isPlayer) {
          if (car.lap > this.race.laps) return;
          this.ui.message(car.lap === this.race.laps ? 'ФИНАЛЬНЫЙ КРУГ!' : `КРУГ ${car.lap}/${this.race.laps}`);
          this.audio.ui('confirm');
        }
      },
      onFinish: (car) => {
        if (car.isPlayer) this.onPlayerFinish();
      },
      onWrongWay: () => {},
    };
    this.ready = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    if (this.params.has('autotest')) {
      setTimeout(() => {
        this.startRace(this.params.get('mode') === 'time' ? 'time' : 'race');
        this.autopilot = true;
      }, 800);
    }
  }

  // ---------- машины ----------
  private makeCar(spec: CarSpec): CarEntity {
    const src = this.glbCache.get(spec.model)!;
    const clone = src.clone(true);
    const car = new CarEntity(spec);
    car.buildFrom(clone);
    this.scene.add(car.group);
    this.cars.push(car);
    return car;
  }

  private removeCar(car: CarEntity): void {
    this.scene.remove(car.group);
    this.cars = this.cars.filter((c) => c !== car);
  }

  private spawnPlayerCar(): void {
    if (this.playerCar) this.removeCar(this.playerCar);
    const spec = CAR_SPECS[this.settings.selectedCar % CAR_SPECS.length];
    this.playerCar = this.makeCar(spec);
    const s = this.track.length - 26;
    this.playerCar.respawn(this.track, s, -2.4);
    if (this.playerAI) this.playerAI = null;
  }

  // ---------- гонка ----------
  startRace(mode: RaceMode): void {
    // убрать старых
    for (const c of [...this.cars]) this.removeCar(c);
    this.raceCars = [];
    this.aiInputs.clear();
    this.wheelPrev.clear();
    this.skids.clear();
    this.smoke?.clear();
    this.dust?.clear();
    this.sparks?.clear();
    this.flame?.clear();

    const playerSpec = CAR_SPECS[this.settings.selectedCar % CAR_SPECS.length];
    this.playerCar = this.makeCar(playerSpec);
    this.playerAI = new AIController({ name: 'auto', topSpeedMul: 0.98, accelMul: 1, latAcc: 17, aggression: 0.6 }, this.track, playerSpec.topSpeed);

    const entries: { name: string; isPlayer: boolean; color: number; vehicle: Vehicle; ai: AIController | null }[] = [
      { name: 'ВЫ', isPlayer: true, color: 0xffffff, vehicle: this.playerCar.vehicle, ai: null },
    ];
    if (mode === 'race') {
      const others = CAR_SPECS.filter((s) => s.id !== playerSpec.id);
      for (let i = 0; i < 4; i++) {
        const spec = others[i % others.length];
        const car = this.makeCar(spec);
        const diff = AI_LEVELS[i % AI_LEVELS.length];
        const ai = new AIController(diff, this.track, spec.topSpeed);
        entries.push({ name: `${AI_NAMES[i % AI_NAMES.length]} (${diff.name})`, isPlayer: false, color: AI_COLORS[i % AI_COLORS.length], vehicle: car.vehicle, ai });
      }
    }
    this.race.setup(mode, RACE_LAPS, entries);
    this.raceCars = this.race.cars;
    for (const c of this.raceCars) {
      const entity = this.cars.find((e) => e.vehicle === c.vehicle);
      if (entity) entity.syncVisual(this.track, 1);
      if (c.ai) this.aiInputs.set(c.id, c.ai.input);
    }
    this.race.startCountdown();
    this.state = 'race';
    this.cameraRig.mode = 0;
    this.pendingResults = 0;
    this.ui.show('none');
    this.ui.hideCountdown();
    const p = this.playerCar!.vehicle;
    this.cameraRig.pos.set(p.pos.x - Math.sin(p.heading) * 9, p.pos.y + 3.5, p.pos.z - Math.cos(p.heading) * 9);
  }

  private onPlayerFinish(): void {
    if (this.pendingResults > 0) return;
    this.pendingResults = 1.4; // задержка перед экраном результатов
  }

  private finishToResults(): void {
    const player = this.race.player()!;
    const mode = this.race.mode;
    const records = loadJSON<{ time: { lap: number; total: number }; race: { lap: number } }>('records', { time: { lap: Infinity, total: Infinity }, race: { lap: Infinity } });
    let isRecord = false;
    if (mode === 'time') {
      if (player.bestLapTime < records.time.lap) {
        records.time.lap = player.bestLapTime;
        isRecord = true;
      }
      if (player.finishTime < records.time.total) records.time.total = player.finishTime;
    } else {
      if (player.bestLapTime < records.race.lap) {
        records.race.lap = player.bestLapTime;
        isRecord = true;
      }
    }
    saveJSON('records', records);
    this.audio.finishJingle();
    this.state = 'results';
    this.ui.showResults(mode, this.raceCars, player, isRecord);
    this.updateRecordsLine();
  }

  private updateRecordsLine(): void {
    const records = loadJSON<{ time: { lap: number; total: number }; race: { lap: number } }>('records', { time: { lap: Infinity, total: Infinity }, race: { lap: Infinity } });
    const parts: string[] = [];
    if (isFinite(records.time.lap)) parts.push(`Заезд на время: лучший круг ${formatTime(records.time.lap)} · всего ${formatTime(records.time.total)}`);
    if (isFinite(records.race.lap)) parts.push(`Гонка: лучший круг ${formatTime(records.race.lap)}`);
    this.ui.setRecordsLine(parts.join('   |   '));
  }

  // ---------- действия UI ----------
  private handleAction(action: Action, value?: number | string): void {
    this.audio.ensure();
    switch (action) {
      case 'start-race':
        this.audio.ui('select');
        this.startRace('race');
        break;
      case 'start-time':
        this.audio.ui('select');
        this.startRace('time');
        break;
      case 'open-car':
        this.audio.ui('click');
        this.ui.carIndex = this.settings.selectedCar;
        this.ui.show('carselect');
        break;
      case 'open-settings':
        this.audio.ui('click');
        this.ui.renderSettingsSegs();
        this.ui.show(this.state === 'pause' ? 'settings' : 'settings');
        this.settingsReturn = this.state === 'pause' ? 'pause' : 'menu';
        break;
      case 'open-help':
        this.audio.ui('click');
        this.ui.show('help');
        this.settingsReturn = 'menu';
        break;
      case 'back':
        this.audio.ui('back');
        if (this.settingsReturn === 'pause') this.ui.show('pause');
        else this.ui.show('menu');
        break;
      case 'resume':
        this.audio.ui('click');
        this.state = 'race';
        this.ui.show('none');
        break;
      case 'restart':
        this.audio.ui('select');
        this.startRace(this.race.mode);
        break;
      case 'quit-menu':
        this.audio.ui('back');
        this.state = 'menu';
        this.spawnPlayerCar();
        this.ui.show('menu');
        this.updateRecordsLine();
        break;
      case 'car-select': {
        this.settings.selectedCar = (value as number) ?? this.ui.carIndex;
        saveJSON('settings', this.settings);
        this.audio.ui('confirm');
        if (this.state === 'menu') this.spawnPlayerCar();
        break;
      }
      case 'quality':
        this.settings.quality = value as Settings['quality'];
        this.qualityIdx = QUALITY_PRESETS.findIndex((q) => q.id === this.settings.quality);
        saveJSON('settings', this.settings);
        this.applyQuality();
        this.audio.ui('click');
        this.ui.renderSettingsSegs();
        break;
      case 'toggle':
        if (value === 'on' || value === 'off') this.settings.autoQuality = value === 'on';
        else if (typeof value === 'string' && value.startsWith('shadows:')) this.settings.shadows = value.endsWith('on');
        else if (typeof value === 'string' && value.startsWith('bloom:')) this.settings.bloom = value.endsWith('on');
        saveJSON('settings', this.settings);
        this.applyQuality();
        this.audio.ui('click');
        this.ui.renderSettingsSegs();
        break;
      case 'volume': {
        const [key, v] = String(value).split(':');
        const val = clamp(parseInt(v, 10) / 100, 0, 1);
        (this.settings as unknown as Record<string, number>)[key] = val;
        saveJSON('settings', this.settings);
        this.audio.setVolumes(this.settings.volume, this.settings.sfxVolume, this.settings.engineVolume);
        break;
      }
      case 'reset-records':
        saveJSON('records', { time: { lap: Infinity, total: Infinity }, race: { lap: Infinity } });
        this.audio.ui('drop');
        this.updateRecordsLine();
        break;
    }
  }
  private settingsReturn: 'menu' | 'pause' = 'menu';

  // ---------- качество ----------
  applyQuality(): void {
    const q = this.quality;
    this.rendererWrap.applyQuality(q);
    this.sky.applyQuality(q, window.devicePixelRatio);
    this.sky.setHdriEnabled(q.useHdri);
    this.world?.applyQuality(q);
    const aniso = q.aniso;
    for (const t of this.texCache.values()) t.anisotropy = aniso;
    this.smoke?.setBudget(Math.round(q.particleBudget * 0.4));
    this.dust?.setBudget(Math.round(q.particleBudget * 0.25));
    this.sparks?.setBudget(Math.round(q.particleBudget * 0.15));
    this.flame?.setBudget(Math.round(q.particleBudget * 0.2));
    this.skids.setBudget(q.skidBudget);
    this.bloomEnabled = q.bloom && this.settings.bloom;
    if (this.bloomPass) this.bloomPass.enabled = this.bloomEnabled;
    this.audio.setVolumes(this.settings.volume, this.settings.sfxVolume, this.settings.engineVolume);
    this.onResize();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.rendererWrap.resize();
    this.composer?.setSize(window.innerWidth, window.innerHeight);
  }

  private autoQualityTick(): void {
    if (!this.settings.autoQuality) return;
    const fps = this.fpsEma;
    this.autoWindows.push(fps);
    if (this.autoWindows.length < 3) return;
    const avg = this.autoWindows.reduce((a, b) => a + b, 0) / this.autoWindows.length;
    this.autoWindows = [];
    if (avg < 46 && this.qualityIdx > 0) {
      this.qualityIdx--;
      this.settings.quality = this.quality.id;
      saveJSON('settings', this.settings);
      this.applyQuality();
      this.ui.message(`Качество: ${this.quality.label}`);
    } else if (avg > 58 && this.qualityIdx < QUALITY_PRESETS.length - 1) {
      this.qualityIdx++;
      this.settings.quality = this.quality.id;
      saveJSON('settings', this.settings);
      this.applyQuality();
      this.ui.message(`Качество: ${this.quality.label}`);
    }
  }

  // ---------- главный цикл ----------
  private loop(t: number): void {
    requestAnimationFrame((tt) => this.loop(tt));
    const rawDt = Math.min(0.1, (t - this.last) / 1000) || 0.016;
    this.last = t;
    const dt = rawDt;
    const simDt = rawDt * this.timeScale;
    this.fpsEma = damp(this.fpsEma, 1 / Math.max(1e-3, dt), 0.05, dt);
    this.frameCount++;
    if (this.frameCount % 240 === 0) this.autoQualityTick();

    const inRace = this.state === 'race';
    const paused = this.state === 'pause';

    // --- ввод и действия ---
    const inputState = this.input.poll();
    if (this.input.consume('Escape') || this.input.consume('KeyP')) {
      if (inRace) {
        this.state = 'pause';
        this.ui.show('pause');
        this.audio.ui('click');
      } else if (paused) {
        this.state = 'race';
        this.ui.show('none');
        this.audio.ui('click');
      }
    }
    if (inRace) {
      if (this.input.consume('KeyC')) {
        const m = this.cameraRig.cycleMode();
        this.ui.message(['Камера: сзади', 'Камера: ближе', 'Камера: капот'][m], 900);
        this.audio.ui('click');
      }
      if (this.input.consume('KeyR')) {
        const p = this.race.player();
        if (p) {
          const s = p.vehicle.last.s;
          const e = this.cars.find((c) => c.vehicle === p.vehicle);
          e?.respawn(this.track, s + 4, 0);
          this.ui.message('На трассу', 800);
        }
      }
    }

    // --- физика фиксированным шагом ---
    const locked = inRace && this.race.state === 'countdown';
    if (inRace && this.race.state !== 'idle') {
      // AI-решения — один раз на кадр
      const player = this.race.player();
      for (const c of this.raceCars) {
        if (c.ai) {
          const others = this.raceCars.filter((o) => o !== c).map((o) => ({ pos: o.vehicle.pos, vel: o.vehicle.vel, speed: o.vehicle.speed }));
          const playerProg = player ? player.prog : 0;
          c.ai.update(simDt, c.vehicle, this.track, others, c.prog - playerProg);
          if (c.ai.consumeRespawn()) {
            const e = this.cars.find((cc) => cc.vehicle === c.vehicle);
            e?.respawn(this.track, c.vehicle.last.s + 5, 0);
          }
        }
      }
      let playerInput: VehicleInput = inputState;
      if (this.autopilot && player && this.playerAI) {
        const others = this.raceCars.filter((o) => o !== player).map((o) => ({ pos: o.vehicle.pos, vel: o.vehicle.vel, speed: o.vehicle.speed }));
        playerInput = this.playerAI.update(simDt, player.vehicle, this.track, others, 0);
      }
      if (locked) playerInput = EMPTY_INPUT;

      this.acc += simDt;
      let steps = 0;
      this.debugSteps = 0;
      const maxSteps = Math.max(8, Math.min(60, Math.ceil(simDt / PHYSICS_DT) + 2));
      while (this.acc >= PHYSICS_DT && steps < maxSteps) {
        for (const c of this.raceCars) {
          const inp = c.isPlayer ? playerInput : this.aiInputs.get(c.id) ?? EMPTY_INPUT;
          c.vehicle.step(PHYSICS_DT, locked && !c.isPlayer ? EMPTY_INPUT : inp, this.track);
        }
        this.acc -= PHYSICS_DT;
        steps++;
        this.debugSteps++;
      }
      if (steps === maxSteps) this.acc = 0;

      // столкновения машин друг с другом
      this.resolveCarCollisions();
      this.race.update(simDt);
      if (this.pendingResults > 0) {
        this.pendingResults -= simDt;
        if (this.pendingResults <= 0) {
          this.pendingResults = 0;
          this.finishToResults();
        }
      }
    }

    // --- визуал машин и эффекты ---
    for (const car of this.cars) {
      car.syncVisual(this.track, dt);
    }
    if (inRace) this.emitEffects(dt, inputState);

    // --- камера ---
    const pv = this.playerCar?.vehicle;
    if (pv && (inRace || this.state === 'results' || paused)) {
      const nitroActive = inRace && inputState.nitro && pv.nitro > 0 && inputState.throttle > 0;
      this.cameraRig.update(dt, this.camera, new THREE.Vector3(pv.pos.x, pv.pos.y, pv.pos.z), pv.heading, pv.speedKmh, nitroActive, this.track);
    } else if (this.state === 'menu' && pv) {
      const c = new THREE.Vector3(pv.pos.x, pv.pos.y, pv.pos.z);
      this.cameraRig.menuOrbit(dt, this.camera, c, 13, 4.5, this.menuAngle);
    }
    this.sky.follow(this.camera.position);

    // --- HUD / аудио ---
    if (inRace || this.state === 'results' || paused) {
      const player = this.race.player();
      if (player && pv) {
        this.ui.updateHud({
          speedKmh: pv.speedKmh,
          gear: pv.isReverse ? 'R' : String(pv.gear),
          lap: player.lap,
          laps: this.race.laps,
          position: player.position,
          totalCars: this.raceCars.length,
          raceTime: this.race.raceTime,
          lastLap: player.lastLapTime,
          bestLap: player.bestLapTime,
          nitro: pv.nitro,
          nitroActive: inRace && inputState.nitro && pv.nitro > 0,
          wrongWay: player.wrongWay,
        });
        this.ui.drawMinimap(this.raceCars, player.id);
        this.audio.updateEngine(pv.rpm, inRace && !locked ? inputState.throttle : 0.15, pv.speedKmh);
        if (!locked) this.audio.setSkid(pv.last.slip);
        // звук ближайшего AI
        let bestD = 1e9;
        let bestRpm = 0;
        for (const c of this.raceCars) {
          if (c.isPlayer) continue;
          const d = Math.hypot(c.vehicle.pos.x - pv.pos.x, c.vehicle.pos.z - pv.pos.z);
          if (d < bestD) {
            bestD = d;
            bestRpm = c.vehicle.rpm;
          }
        }
        this.audio.updateAI(bestD, bestRpm);
        const nitroOn = inRace && inputState.nitro && pv.nitro > 0;
        this.audio.setNitro(nitroOn);
      }
    } else if (this.state === 'menu' && pv) {
      this.audio.updateEngine(0.12, 0, 0);
      this.audio.setSkid(0);
    }

    this.smoke?.update(dt);
    this.dust?.update(dt);
    this.sparks?.update(dt);
    this.flame?.update(dt);
    this.skids.update(dt);

    // --- рендер ---
    if (this.bloomEnabled && this.composer) this.composer.render();
    else this.rendererWrap.renderer.render(this.scene, this.camera);
    const info = this.rendererWrap.renderer.info.render;
    this.stats = { fps: this.fpsEma, frameMs: dt * 1000, calls: info.calls, tris: info.triangles };
    if (this.params.has('fps')) {
      this.ui.setFps(`FPS ${this.fpsEma.toFixed(0)} · ${this.stats.calls} draw · ${(this.stats.tris / 1000).toFixed(0)}k трис · ${this.quality.label}`, true);
    }
    this.input.endFrame();
  }

  // ---------- столкновения машин ----------
  private resolveCarCollisions(): void {
    const cars = this.raceCars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i].vehicle;
        const b = cars[j].vehicle;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const minD = 2.1;
        if (dist > minD || dist < 1e-4) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = (minD - dist) / 2;
        a.pos.x -= nx * overlap;
        a.pos.z -= nz * overlap;
        b.pos.x += nx * overlap;
        b.pos.z += nz * overlap;
        const rvx = b.vel.x - a.vel.x;
        const rvz = b.vel.z - a.vel.z;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          const imp = -vn * 0.72;
          a.vel.x -= nx * imp;
          a.vel.z -= nz * imp;
          b.vel.x += nx * imp;
          b.vel.z += nz * imp;
          const playerInvolved = cars[i].isPlayer || cars[j].isPlayer;
          if (playerInvolved && -vn > 3) {
            this.audio.crash(-vn);
            this.cameraRig.addShake(-vn / 16);
            this.emitSparks((a.pos.x + b.pos.x) / 2, a.pos.y + 0.4, (a.pos.z + b.pos.z) / 2, -vn);
          }
        }
      }
    }
  }

  // ---------- эффекты ----------
  private emitEffects(dt: number, input: VehicleInput): void {
    const player = this.race.player();
    for (const c of this.raceCars) {
      const v = c.vehicle;
      const r = v.last;
      const entity = this.cars.find((e) => e.vehicle === v);
      if (!entity) continue;
      const isPlayer = c.isPlayer;
      // удары о стены
      if (r.wallHit > 2.5) {
        const cp = this.track.closest(v.pos.x, v.pos.z);
        const wx = cp.x + cp.nx * Math.sign(cp.lateral) * 1.0;
        const wz = cp.z + cp.nz * Math.sign(cp.lateral) * 1.0;
        this.emitSparks(wx, v.pos.y + 0.35, wz, r.wallHit);
        if (isPlayer) {
          this.audio.crash(r.wallHit);
          this.cameraRig.addShake(r.wallHit / 13);
        }
      }
      // занос: следы + дым
      const slipping = r.slip > 3.2 && r.onRoad && v.speed > 7;
      const scale = entity.spec.scale;
      for (const w of entity.wheels) {
        if (!w.front) {
          const key = `${c.id}:${w.base.x.toFixed(2)}:${w.base.z.toFixed(2)}`;
          const wp = new THREE.Vector3().copy(w.base).multiplyScalar(scale);
          entity.group.localToWorld(wp);
          const prev = this.wheelPrev.get(key);
          if (slipping && prev) {
            const moved = Math.hypot(wp.x - prev.x, wp.z - prev.z);
            if (moved > 0.25 && moved < 3) {
              this.skids.addSegment(prev.x, prev.y, prev.z, wp.x, wp.y, wp.z, 0.16 * scale, Math.min(0.6, r.slip / 14));
            }
          }
          this.wheelPrev.set(key, { x: wp.x, y: v.pos.y, z: wp.z });
          if (slipping && Math.random() < dt * 22) {
            this.smoke?.spawn({
              x: wp.x, y: wp.y + 0.12, z: wp.z,
              vx: (Math.random() - 0.5) * 1.2, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 1.2,
              life: 0.7 + Math.random() * 0.5, size: 0.5 + Math.random() * 0.5,
              r: 0.75, g: 0.75, b: 0.78, a: 0.5, gravity: 1.2, drag: 2.5, grow: 2.2,
            });
          }
          if (r.offroad && v.speed > 5 && Math.random() < dt * 18) {
            this.dust?.spawn({
              x: wp.x, y: wp.y + 0.1, z: wp.z,
              vx: -v.vel.x * 0.12 + (Math.random() - 0.5), vy: 0.6 + Math.random() * 0.8, vz: -v.vel.z * 0.12 + (Math.random() - 0.5),
              life: 0.8 + Math.random() * 0.6, size: 0.6 + Math.random() * 0.7,
              r: 0.55, g: 0.48, b: 0.36, a: 0.55, gravity: -0.6, drag: 3, grow: 3.2,
            });
          }
        }
      }
      // нитро — пламя из выхлопа
      if (isPlayer ? input.nitro && v.nitro > 0 : false) {
        const fx = Math.sin(v.heading);
        const fz = Math.cos(v.heading);
        for (let k = 0; k < 2; k++) {
          this.flame?.spawn({
            x: v.pos.x - fx * 1.15 * scale + (Math.random() - 0.5) * 0.2,
            y: v.pos.y + 0.32,
            z: v.pos.z - fz * 1.15 * scale + (Math.random() - 0.5) * 0.2,
            vx: -fx * 6 + (Math.random() - 0.5), vy: 0.6, vz: -fz * 6 + (Math.random() - 0.5),
            life: 0.28, size: 0.55, r: 0.35, g: 0.65, b: 1.0, a: 0.9, drag: 4, grow: 1.6,
          });
        }
      }
      // AI нитро
      if (!isPlayer && c.ai && c.ai.input.nitro && v.nitro > 0 && Math.random() < 0.5) {
        const fx = Math.sin(v.heading);
        const fz = Math.cos(v.heading);
        this.flame?.spawn({
          x: v.pos.x - fx * 1.1 * scale, y: v.pos.y + 0.3, z: v.pos.z - fz * 1.1 * scale,
          vx: -fx * 5, vy: 0.5, vz: -fz * 5, life: 0.25, size: 0.45, r: 0.35, g: 0.65, b: 1.0, a: 0.8, drag: 4, grow: 1.4,
        });
      }
    }
  }

  private emitSparks(x: number, y: number, z: number, power: number): void {
    const n = Math.min(14, 3 + Math.floor(power));
    for (let i = 0; i < n; i++) {
      this.sparks?.spawn({
        x, y, z,
        vx: (Math.random() - 0.5) * 7, vy: Math.random() * 5, vz: (Math.random() - 0.5) * 7,
        life: 0.25 + Math.random() * 0.35, size: 0.16 + Math.random() * 0.14,
        r: 1.0, g: 0.75, b: 0.3, a: 0.95, gravity: 12, drag: 1.5,
      });
    }
  }
}
