import type { CtrlPoint } from './track/TrackDef';

// ---------- Трасса ----------
export const TRACK_POINTS: CtrlPoint[] = [
  { x: -40, y: 0, z: 0 },
  { x: 80, y: 0, z: 0 },
  { x: 170, y: 1, z: -10 },
  { x: 230, y: 4, z: -60 },
  { x: 250, y: 8, z: -140 },
  { x: 215, y: 11, z: -205 },
  { x: 140, y: 12, z: -225 },
  { x: 75, y: 10, z: -195 },
  { x: 55, y: 7, z: -130 },
  { x: 95, y: 5, z: -75 },
  { x: 40, y: 3, z: -40 },
  { x: -40, y: 1, z: -55 },
  { x: -120, y: 2, z: -90 },
  { x: -185, y: 5, z: -60 },
  { x: -215, y: 3, z: 10 },
  { x: -180, y: 0, z: 70 },
  { x: -90, y: 0, z: 85 },
];
export const TRACK_SAMPLE_COUNT = 1000;
export const ROAD_HALF = 6.0; // половина ширины асфальта, м
export const CURB_WIDTH = 1.4; // ширина поребрика
export const WORLD_SIZE = 1500; // размер квадратного террейна
export const TERRAIN_RES = 150; // вершин на сторону

// ---------- Физика ----------
export const PHYSICS_DT = 1 / 120; // фиксированный шаг физики
export const CAR_WHEELBASE = 2.55; // м (после scale)
export const CAR_HALF_WIDTH = 0.98; // половина ширины для коллизий со стенами

// ---------- Машины ----------
export interface CarSpec {
  id: string;
  name: string;
  model: string;
  scale: number;
  accel: number; // м/с^2
  brake: number; // м/с^2
  topSpeed: number; // м/с
  grip: number; // поперечное сцепление 1/с
  steerMax: number; // рад на нулевой скорости
  nitroPower: number; // доп. ускорение
  tint: number; // цвет кузова (мультипликативный, 0xffffff = как есть)
  desc: string;
}

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'race-future', name: 'F-1 «Призрак»', model: 'assets/models/cars/race-future.glb', scale: 1.72,
    accel: 17.5, brake: 26, topSpeed: 68, grip: 8.4, steerMax: 0.66, nitroPower: 13, tint: 0xffffff,
    desc: 'Максималка и разгон. Для спринтов и обгонов.',
  },
  {
    id: 'race', name: 'GT «Вихрь»', model: 'assets/models/cars/race.glb', scale: 1.78,
    accel: 15.5, brake: 24, topSpeed: 62, grip: 7.8, steerMax: 0.62, nitroPower: 11, tint: 0xffffff,
    desc: 'Сбалансированный спорткар — надёжный выбор.',
  },
  {
    id: 'sedan-sports', name: 'Седан «Молния»', model: 'assets/models/cars/sedan-sports.glb', scale: 1.8,
    accel: 13.5, brake: 22, topSpeed: 57, grip: 8.6, steerMax: 0.6, nitroPower: 9, tint: 0xffffff,
    desc: 'Цепкий в поворотах, удобен на извилистых участках.',
  },
  {
    id: 'hatchback-sports', name: 'Хэтчбек «Искра»', model: 'assets/models/cars/hatchback-sports.glb', scale: 1.66,
    accel: 14.5, brake: 21, topSpeed: 52, grip: 9.6, steerMax: 0.7, nitroPower: 9, tint: 0xffffff,
    desc: 'Острый руль и лёгкий кузов — король узких поворотов.',
  },
  {
    id: 'kart-oozi', name: 'Карт «Пуля»', model: 'assets/models/cars/kart-oozi.glb', scale: 1.5,
    accel: 16, brake: 22, topSpeed: 45, grip: 10.5, steerMax: 0.82, nitroPower: 8, tint: 0xffffff,
    desc: 'Карт: сумасшедшая управляемость на малой скорости.',
  },
];

export interface AIDifficulty {
  name: string;
  topSpeedMul: number;
  accelMul: number;
  latAcc: number; // макс. поперечное ускорение в поворотах, м/с^2
  aggression: number; // 0..1 — насколько поздно тормозит и агрессивно обгоняет
}
export const AI_LEVELS: AIDifficulty[] = [
  { name: 'Новичок', topSpeedMul: 0.86, accelMul: 0.85, latAcc: 13, aggression: 0.2 },
  { name: 'Любитель', topSpeedMul: 0.92, accelMul: 0.92, latAcc: 15, aggression: 0.45 },
  { name: 'Профи', topSpeedMul: 0.98, accelMul: 1.0, latAcc: 17, aggression: 0.7 },
  { name: 'Мастер', topSpeedMul: 1.04, accelMul: 1.08, latAcc: 19, aggression: 0.95 },
];
export const AI_NAMES = ['Вектор', 'Дрифт', 'Турбо', 'Нитро'];

// ---------- Режимы ----------
export type RaceMode = 'race' | 'time';
export const RACE_LAPS = 3;

// ---------- Качество ----------
export interface QualityPreset {
  id: 'low' | 'medium' | 'high';
  label: string;
  pixelRatioMax: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowDistance: number; // радиус跟随ской shadow-камеры вокруг игрока
  fogNear: number;
  fogFar: number;
  particleBudget: number;
  skidBudget: number;
  treeCount: number;
  rockCount: number;
  useHdri: boolean;
  bloom: boolean;
  aniso: number;
}
export const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'low', label: 'Низкое', pixelRatioMax: 1.0, shadows: false, shadowMapSize: 0, shadowDistance: 90, fogNear: 55, fogFar: 240, particleBudget: 140, skidBudget: 500, treeCount: 130, rockCount: 40, useHdri: false, bloom: false, aniso: 1 },
  { id: 'medium', label: 'Среднее', pixelRatioMax: 1.5, shadows: true, shadowMapSize: 1024, shadowDistance: 110, fogNear: 70, fogFar: 430, particleBudget: 320, skidBudget: 1000, treeCount: 320, rockCount: 90, useHdri: true, bloom: false, aniso: 4 },
  { id: 'high', label: 'Высокое', pixelRatioMax: 2.0, shadows: true, shadowMapSize: 2048, shadowDistance: 140, fogNear: 90, fogFar: 650, particleBudget: 640, skidBudget: 1600, treeCount: 520, rockCount: 140, useHdri: true, bloom: true, aniso: 8 },
];

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  autoQuality: boolean;
  volume: number; // 0..1 общая
  sfxVolume: number;
  engineVolume: number;
  bloom: boolean;
  shadows: boolean;
  selectedCar: number;
  mode: RaceMode;
}
export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium', autoQuality: true, volume: 0.8, sfxVolume: 0.9, engineVolume: 0.8,
  bloom: true, shadows: true, selectedCar: 1, mode: 'race',
};

// ---------- Ассеты ----------
export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;
export const ASSETS = {
  hdriHigh: ASSET_BASE + 'hdri/kloofendal_43d_clear_puresky_2k.hdr',
  hdriLow: ASSET_BASE + 'hdri/kloofendal_43d_clear_puresky_1k.hdr',
  tex: {
    asphaltDiff: ASSET_BASE + 'textures/asphalt_track_diff_1k.jpg',
    asphaltNor: ASSET_BASE + 'textures/asphalt_track_nor_1k.jpg',
    asphaltArm: ASSET_BASE + 'textures/asphalt_track_arm_1k.jpg',
    grassDiff: ASSET_BASE + 'textures/aerial_grass_rock_diff_1k.jpg',
    grassNor: ASSET_BASE + 'textures/aerial_grass_rock_nor_1k.jpg',
    grassArm: ASSET_BASE + 'textures/aerial_grass_rock_arm_1k.jpg',
    gravelDiff: ASSET_BASE + 'textures/bicolour_gravel_diff_1k.jpg',
    gravelNor: ASSET_BASE + 'textures/bicolour_gravel_nor_1k.jpg',
    metalDiff: ASSET_BASE + 'textures/blue_metal_plate_diff_1k.jpg',
    metalNor: ASSET_BASE + 'textures/blue_metal_plate_nor_1k.jpg',
  },
  particles: {
    smoke: ASSET_BASE + 'particles/smoke_05.png',
    smoke2: ASSET_BASE + 'particles/smoke_03.png',
    dust: ASSET_BASE + 'particles/smoke_01.png',
    spark: ASSET_BASE + 'particles/spark_04.png',
    flame: ASSET_BASE + 'particles/flame_02.png',
  },
  audio: {
    engineLoopA: ASSET_BASE + 'audio/engine/engine_loop_0.wav',
    engineLoopB: ASSET_BASE + 'audio/engine/engine_loop_3.wav',
    uiClick: ASSET_BASE + 'audio/ui/click_005.ogg',
    uiSelect: ASSET_BASE + 'audio/ui/select_006.ogg',
    uiConfirm: ASSET_BASE + 'audio/ui/confirmation_004.ogg',
    uiBack: ASSET_BASE + 'audio/ui/back_004.ogg',
    uiError: ASSET_BASE + 'audio/ui/error_007.ogg',
    uiDrop: ASSET_BASE + 'audio/ui/drop_003.ogg',
    beepLow: ASSET_BASE + 'audio/beep/highDown.ogg',
    beepGo: ASSET_BASE + 'audio/beep/highUp.ogg',
    powerUp: ASSET_BASE + 'audio/beep/powerUp1.ogg',
    threeTone: ASSET_BASE + 'audio/beep/lowThreeTone.ogg',
    crash0: ASSET_BASE + 'audio/impact/impactMetal_heavy_000.ogg',
    crash1: ASSET_BASE + 'audio/impact/impactMetal_heavy_001.ogg',
    crash2: ASSET_BASE + 'audio/impact/impactMetal_heavy_002.ogg',
    scrape: ASSET_BASE + 'audio/impact/impactGeneric_light_000.ogg',
  },
  props: {
    barrierRed: ASSET_BASE + 'models/props/barrierRed.glb',
    barrierWhite: ASSET_BASE + 'models/props/barrierWhite.glb',
    barrierWall: ASSET_BASE + 'models/props/barrierWall.glb',
    fenceStraight: ASSET_BASE + 'models/props/fenceStraight.glb',
    fenceCurved: ASSET_BASE + 'models/props/fenceCurved.glb',
    lightPost: ASSET_BASE + 'models/props/lightPostModern.glb',
    lightPostLarge: ASSET_BASE + 'models/props/lightPostLarge.glb',
    overhead: ASSET_BASE + 'models/props/overhead.glb',
    billboard: ASSET_BASE + 'models/props/billboard.glb',
    flagCheckers: ASSET_BASE + 'models/props/flagCheckers.glb',
    flagCheckersSmall: ASSET_BASE + 'models/props/flagCheckersSmall.glb',
    grandStand: ASSET_BASE + 'models/props/grandStand.glb',
    pylon: ASSET_BASE + 'models/props/pylon.glb',
    tent: ASSET_BASE + 'models/props/tent.glb',
    cone: ASSET_BASE + 'models/cars/cone.glb',
    arrow: ASSET_BASE + 'models/props/roadStraightArrow.glb',
  },
  trees: [
    ASSET_BASE + 'models/trees/tree_default.glb',
    ASSET_BASE + 'models/trees/tree_tall.glb',
    ASSET_BASE + 'models/trees/tree_oak.glb',
    ASSET_BASE + 'models/trees/tree_pineTallA.glb',
    ASSET_BASE + 'models/trees/tree_pineRoundA.glb',
    ASSET_BASE + 'models/trees/tree_fat.glb',
    ASSET_BASE + 'models/trees/tree_plateau.glb',
    ASSET_BASE + 'models/trees/tree_blocks.glb',
  ],
  rocks: [
    ASSET_BASE + 'models/rocks/rock_largeE.glb',
    ASSET_BASE + 'models/rocks/rock_tallF.glb',
    ASSET_BASE + 'models/rocks/rock_smallF.glb',
    ASSET_BASE + 'models/rocks/stone_tallA.glb',
    ASSET_BASE + 'models/rocks/stone_largeD.glb',
    ASSET_BASE + 'models/rocks/cliff_block_rock.glb',
  ],
  buildings: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ASSET_BASE + `models/buildings/building-type-${'abcdefgh'[i]}.glb`),
  buildingTrees: [ASSET_BASE + 'models/buildings/tree-large.glb', ASSET_BASE + 'models/buildings/tree-small.glb'],
  buildingFence: ASSET_BASE + 'models/buildings/fence.glb',
};
