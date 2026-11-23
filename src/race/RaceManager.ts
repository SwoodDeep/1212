import type { TrackData } from '../track/TrackDef';
import type { Vehicle } from '../car/Vehicle';
import type { AIController } from '../ai/AIController';
import type { RaceMode } from '../config';

export interface RaceCar {
  id: number;
  name: string;
  isPlayer: boolean;
  color: number;
  vehicle: Vehicle;
  ai: AIController | null;
  prog: number; // непрерывный прогресс, 0 = линия старта
  lastRaw: number;
  nextGate: number; // 1..8
  lap: number; // текущий круг, 1-based
  lapStart: number;
  lastLapTime: number;
  bestLapTime: number;
  lapTimes: number[];
  finished: boolean;
  finishTime: number;
  position: number;
  wrongWay: boolean;
  wrongWayT: number;
}

export type RaceState = 'idle' | 'countdown' | 'running' | 'finished';

export interface RaceHooks {
  onCountdown?: (n: number) => void;
  onGo?: () => void;
  onLap?: (car: RaceCar, lapTime: number) => void;
  onFinish?: (car: RaceCar) => void;
  onWrongWay?: (car: RaceCar, wrong: boolean) => void;
}

export class RaceManager {
  track: TrackData;
  mode: RaceMode = 'race';
  laps = 3;
  cars: RaceCar[] = [];
  state: RaceState = 'idle';
  countdownT = 0;
  raceTime = 0;
  cpCount = 8;
  hooks: RaceHooks = {};
  private lastCd = 99;

  constructor(track: TrackData) {
    this.track = track;
  }

  setup(mode: RaceMode, laps: number, entries: { name: string; isPlayer: boolean; color: number; vehicle: Vehicle; ai: AIController | null }[]): void {
    this.mode = mode;
    this.laps = laps;
    this.cars = entries.map((e, i) => ({
      id: i,
      name: e.name,
      isPlayer: e.isPlayer,
      color: e.color,
      vehicle: e.vehicle,
      ai: e.ai,
      prog: 0,
      lastRaw: 0,
      nextGate: 1,
      lap: 1,
      lapStart: 0,
      lastLapTime: 0,
      bestLapTime: Infinity,
      lapTimes: [],
      finished: false,
      finishTime: 0,
      position: i + 1,
      wrongWay: false,
      wrongWayT: 0,
    }));
    this.placeOnGrid();
    this.state = 'idle';
    this.raceTime = 0;
  }

  placeOnGrid(): void {
    const L = this.track.length;
    this.cars.forEach((car, i) => {
      const s = L - 26 - i * 8;
      const lat = i % 2 === 0 ? -2.4 : 2.4;
      car.vehicle.respawn(this.track, s, lat);
      car.prog = s - L; // отрицательный прогресс до старта
      car.lastRaw = this.track.wrapS(s);
      car.nextGate = 1;
      car.lap = 1;
      car.lapStart = 0;
      car.lastLapTime = 0;
      car.bestLapTime = Infinity;
      car.lapTimes = [];
      car.finished = false;
      car.finishTime = 0;
      car.wrongWay = false;
      car.wrongWayT = 0;
    });
    this.updatePositions();
  }

  startCountdown(): void {
    this.state = 'countdown';
    this.countdownT = 3.6;
    this.lastCd = 99;
    this.raceTime = 0;
  }

  gateS(k: number): number {
    return (k * this.track.length) / this.cpCount;
  }

  update(dt: number): void {
    if (this.state === 'countdown') {
      const prev = this.countdownT;
      this.countdownT -= dt;
      for (const n of [3, 2, 1]) {
        if (prev > n && this.countdownT <= n) this.hooks.onCountdown?.(n);
      }
      if (this.countdownT <= 0) {
        this.state = 'running';
        this.hooks.onGo?.();
      }
      return;
    }
    if (this.state !== 'running') return;
    this.raceTime += dt;
    const L = this.track.length;
    for (const car of this.cars) {
      if (car.finished) continue;
      const c = this.track.closest(car.vehicle.pos.x, car.vehicle.pos.z);
      const raw = this.track.wrapS(c.s);
      let d = raw - car.lastRaw;
      if (d > L / 2) d -= L;
      else if (d < -L / 2) d += L;
      if (Math.abs(d) < 25) {
        car.prog += d;
        car.lastRaw = raw;
        if (d < -0.02) car.wrongWayT += dt;
        else car.wrongWayT = 0;
      }
      const wrong = car.wrongWayT > 1.5;
      if (wrong !== car.wrongWay) {
        car.wrongWay = wrong;
        this.hooks.onWrongWay?.(car, wrong);
      }
      // чекпоинты: промежуточные гейты — пока не дошли до последнего; финишный гейт — один раз за кадр
      while (car.nextGate < this.cpCount && car.prog >= this.gateS(car.nextGate)) {
        car.nextGate++;
      }
      if (car.nextGate === this.cpCount && car.prog >= this.gateS(this.cpCount)) {
        const lapTime = this.raceTime - car.lapStart;
        car.lapStart = this.raceTime;
        car.lastLapTime = lapTime;
        car.lapTimes.push(lapTime);
        if (lapTime < car.bestLapTime) car.bestLapTime = lapTime;
        car.lap++;
        car.nextGate = 1;
        this.hooks.onLap?.(car, lapTime);
        if (car.lap > this.laps) {
          car.finished = true;
          car.finishTime = this.raceTime;
          this.hooks.onFinish?.(car);
        }
      }
    }
    this.updatePositions();
  }

  updatePositions(): void {
    const sorted = [...this.cars].sort((a, b) => b.prog - a.prog);
    sorted.forEach((car, i) => {
      car.position = i + 1;
    });
  }

  player(): RaceCar | undefined {
    return this.cars.find((c) => c.isPlayer);
  }

  isRaceOver(): boolean {
    const p = this.player();
    return !!p && p.finished;
  }
}
