import { CAR_SPECS, QUALITY_PRESETS, type Settings, type RaceMode } from '../config';
import { formatTime } from '../utils/math';
import type { TrackData } from '../track/TrackDef';
import type { RaceCar } from '../race/RaceManager';

export type Screen = 'menu' | 'carselect' | 'settings' | 'help' | 'pause' | 'results' | 'none';
export type Action =
  | 'start-race' | 'start-time' | 'open-car' | 'open-settings' | 'open-help'
  | 'back' | 'resume' | 'restart' | 'quit-menu' | 'car-select' | 'car-prev' | 'car-next'
  | 'quality' | 'toggle' | 'volume' | 'reset-records';

export interface HudData {
  speedKmh: number;
  gear: string;
  lap: number;
  laps: number;
  position: number;
  totalCars: number;
  raceTime: number;
  lastLap: number;
  bestLap: number;
  nitro: number;
  nitroActive: boolean;
  wrongWay: boolean;
}

export class UI {
  root: HTMLElement;
  private onAction: (action: Action, value?: number | string) => void;
  private els: Record<string, HTMLElement> = {};
  private screens: Record<string, HTMLElement> = {};
  private minimapCv: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private mapBase: HTMLCanvasElement | null = null;
  private mapCtx: CanvasRenderingContext2D | null = null;
  private msgTimer = 0;
  carIndex = 0;
  settings: Settings;

  constructor(root: HTMLElement, settings: Settings, onAction: (action: Action, value?: number | string) => void) {
    this.root = root;
    this.settings = settings;
    this.onAction = onAction;
    this.buildDom();
    this.minimapCv = this.els.minimap as HTMLCanvasElement;
    this.minimapCtx = this.minimapCv.getContext('2d')!;
    this.wire();
  }

  private el(id: string, parent: HTMLElement = this.root): HTMLElement {
    const e = parent.querySelector(`#${id}`) as HTMLElement | null;
    if (!e) throw new Error(`UI: missing #${id}`);
    return e;
  }

  private buildDom(): void {
    this.root.innerHTML = `
    <div id="vignette"></div>
    <div id="speedlines"></div>
    <div id="fps-badge"></div>
    <div id="err-overlay"></div>

    <div id="hud" class="hidden">
      <div id="hud-top">
        <div id="hud-pos">1<small>/5</small></div>
        <div id="hud-laps">КРУГ 1/3</div>
        <div id="hud-time">0:00.000</div>
      </div>
      <div id="hud-lapinfo">Посл. <b id="hud-last">--:--.---</b> &nbsp; Лучш. <b id="hud-best">--:--.---</b></div>
      <canvas id="minimap" width="380" height="380"></canvas>
      <div id="hud-speed"><span id="speed-val">0</span><span class="unit">км/ч</span><div id="gear">N</div></div>
      <div id="nitro-wrap"><span>НИТРО · SHIFT</span><div id="nitro-track"><div id="nitro-bar"></div></div></div>
      <div id="countdown" class="hidden"></div>
      <div id="hud-msg"></div>
      <div id="wrongway" class="hidden">⟲ ЕДЕШЬ НЕ ТУДА!</div>
    </div>

    <div id="menu" class="screen">
      <div class="title">APEX CIRCUIT 3D</div>
      <div class="subtitle">браузерная гонка</div>
      <div class="menu-buttons">
        <div class="btn primary" data-action="start-race">🏁 Гонка</div>
        <div class="btn" data-action="start-time">⏱ Заезд на время</div>
        <div class="btn" data-action="open-car">🚗 Машина</div>
        <div class="btn" data-action="open-settings">⚙ Настройки</div>
        <div class="btn" data-action="open-help">⌨ Управление</div>
      </div>
      <div class="records-line" id="records-line"></div>
      <div class="menu-footer">
        <b>WASD / стрелки</b> — газ, тормоз, руль &nbsp;·&nbsp; <b>Space</b> — ручник &nbsp;·&nbsp; <b>Shift</b> — нитро<br>
        <b>C</b> — камера &nbsp;·&nbsp; <b>R</b> — на трассу &nbsp;·&nbsp; <b>Esc</b> — пауза &nbsp;·&nbsp; геймпад поддерживается
      </div>
    </div>

    <div id="carselect" class="screen hidden">
      <div class="panel" style="background:transparent;border:none;box-shadow:none;backdrop-filter:none">
        <h2>ВЫБОР МАШИНЫ</h2>
        <div class="car-row">
          <div class="btn car-arrow" data-action="car-prev">‹</div>
          <div class="car-cards" id="car-cards"></div>
          <div class="btn car-arrow" data-action="car-next">›</div>
        </div>
        <div class="menu-buttons">
          <div class="btn primary" data-action="car-select">Выбрать</div>
          <div class="btn" data-action="back">Назад</div>
        </div>
      </div>
    </div>

    <div id="settings" class="screen hidden">
      <div class="panel">
        <h2>НАСТРОЙКИ</h2>
        <div class="row"><label>Качество графики</label><div class="seg" id="seg-quality"></div></div>
        <div class="row"><label>Автоподбор качества (FPS)</label><div class="seg" id="seg-autoq"></div></div>
        <div class="row"><label>Тени</label><div class="seg" id="seg-shadows"></div></div>
        <div class="row"><label>Bloom</label><div class="seg" id="seg-bloom"></div></div>
        <div class="row"><label>Общая громкость</label><input type="range" id="vol-master" min="0" max="100" value="80"></div>
        <div class="row"><label>Эффекты</label><input type="range" id="vol-sfx" min="0" max="100" value="90"></div>
        <div class="row"><label>Двигатель</label><input type="range" id="vol-engine" min="0" max="100" value="80"></div>
        <div class="row"><label>Рекорды</label><div class="btn small" data-action="reset-records">Сбросить</div></div>
        <div class="menu-buttons"><div class="btn primary" data-action="back">Готово</div></div>
      </div>
    </div>

    <div id="help" class="screen hidden">
      <div class="panel">
        <h2>УПРАВЛЕНИЕ</h2>
        <table class="keys-table">
          <tr><td><kbd>W</kbd> / <kbd>↑</kbd></td><td>газ</td></tr>
          <tr><td><kbd>S</kbd> / <kbd>↓</kbd></td><td>тормоз / задний ход</td></tr>
          <tr><td><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></td><td>руль</td></tr>
          <tr><td><kbd>Space</kbd></td><td>ручной тормоз (занос)</td></tr>
          <tr><td><kbd>Shift</kbd></td><td>нитро</td></tr>
          <tr><td><kbd>C</kbd></td><td>смена камеры (3 режима)</td></tr>
          <tr><td><kbd>R</kbd></td><td>вернуть машину на трассу</td></tr>
          <tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>пауза</td></tr>
          <tr><td>Геймпад</td><td>стик — руль, RT/LT — газ/тормоз, A — ручник, X — нитро</td></tr>
        </table>
        <div class="menu-buttons"><div class="btn primary" data-action="back">Назад</div></div>
      </div>
    </div>

    <div id="pause" class="screen hidden">
      <div class="panel">
        <h2>ПАУЗА</h2>
        <div class="menu-buttons">
          <div class="btn primary" data-action="resume">Продолжить</div>
          <div class="btn" data-action="restart">Заново</div>
          <div class="btn" data-action="open-settings">Настройки</div>
          <div class="btn" data-action="quit-menu">В меню</div>
        </div>
      </div>
    </div>

    <div id="results" class="screen hidden">
      <div class="panel">
        <h2 id="results-title">ФИНИШ!</h2>
        <div id="results-record"></div>
        <table class="res-table"><thead><tr><th>#</th><th>Пилот</th><th>Лучший круг</th><th>Всего</th></tr></thead><tbody id="results-body"></tbody></table>
        <div class="menu-buttons">
          <div class="btn primary" data-action="restart">Ещё раз</div>
          <div class="btn" data-action="quit-menu">В меню</div>
        </div>
      </div>
    </div>`;
    for (const id of ['hud', 'menu', 'carselect', 'settings', 'help', 'pause', 'results']) {
      this.screens[id] = this.el(id);
    }
    for (const id of ['hud-pos', 'hud-laps', 'hud-time', 'hud-last', 'hud-best', 'speed-val', 'gear', 'nitro-bar', 'countdown', 'hud-msg', 'wrongway', 'minimap', 'records-line', 'car-cards', 'seg-quality', 'seg-autoq', 'seg-shadows', 'seg-bloom', 'vol-master', 'vol-sfx', 'vol-engine', 'results-title', 'results-body', 'results-record', 'fps-badge', 'err-overlay', 'speedlines']) {
      this.els[id] = this.el(id);
    }
    this.renderCarCards();
    this.renderSettingsSegs();
  }

  private wire(): void {
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!t) return;
      const action = t.dataset.action as Action;
      if (action === 'car-prev') this.changeCar(-1);
      else if (action === 'car-next') this.changeCar(1);
      else if (action === 'car-select') this.onAction('car-select', this.carIndex);
      else if (action === 'quality') this.onAction('quality', t.dataset.value);
      else if (action === 'toggle') this.onAction('toggle', t.dataset.value);
      else this.onAction(action);
    });
    for (const [id, key] of [['vol-master', 'volume'], ['vol-sfx', 'sfxVolume'], ['vol-engine', 'engineVolume']] as const) {
      this.els[id].addEventListener('input', (e) => {
        this.onAction('volume', `${key}:${(e.target as HTMLInputElement).value}`);
      });
    }
  }

  private renderCarCards(): void {
    const wrap = this.els['car-cards'];
    wrap.innerHTML = '';
    CAR_SPECS.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'car-card' + (i === this.carIndex ? ' active' : '');
      const stat = (label: string, v: number) => `<div class="stat">${label}<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
      card.innerHTML = `<h3>${c.name}</h3><div class="desc">${c.desc}</div>
        ${stat('СКОРОСТЬ', c.topSpeed / 70)}
        ${stat('РАЗГОН', c.accel / 19)}
        ${stat('УПРАВЛ.', c.grip / 11)}`;
      card.addEventListener('click', () => {
        this.carIndex = i;
        this.renderCarCards();
        this.onAction('car-select', i);
      });
      wrap.appendChild(card);
    });
  }

  changeCar(dir: number): void {
    this.carIndex = (this.carIndex + dir + CAR_SPECS.length) % CAR_SPECS.length;
    this.renderCarCards();
    this.onAction('car-select', this.carIndex);
  }

  private seg(id: string, options: { label: string; value: string }[], current: string, action: Action): void {
    const wrap = this.els[id];
    wrap.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('div');
      b.className = 'btn' + (o.value === current ? ' active' : '');
      b.textContent = o.label;
      b.dataset.action = action;
      b.dataset.value = o.value;
      wrap.appendChild(b);
    }
  }

  renderSettingsSegs(): void {
    const s = this.settings;
    this.seg('seg-quality', QUALITY_PRESETS.map((q) => ({ label: q.label, value: q.id })), s.quality, 'quality');
    this.seg('seg-autoq', [{ label: 'Вкл', value: 'on' }, { label: 'Выкл', value: 'off' }], s.autoQuality ? 'on' : 'off', 'toggle');
    this.seg('seg-shadows', [{ label: 'Вкл', value: 'shadows:on' }, { label: 'Выкл', value: 'shadows:off' }], s.shadows ? 'shadows:on' : 'shadows:off', 'toggle');
    this.seg('seg-bloom', [{ label: 'Вкл', value: 'bloom:on' }, { label: 'Выкл', value: 'bloom:off' }], s.bloom ? 'bloom:on' : 'bloom:off', 'toggle');
    (this.els['vol-master'] as HTMLInputElement).value = String(Math.round(s.volume * 100));
    (this.els['vol-sfx'] as HTMLInputElement).value = String(Math.round(s.sfxVolume * 100));
    (this.els['vol-engine'] as HTMLInputElement).value = String(Math.round(s.engineVolume * 100));
  }

  setRecordsLine(text: string): void {
    this.els['records-line'].textContent = text;
  }

  show(screen: Screen): void {
    for (const [id, el] of Object.entries(this.screens)) el.classList.toggle('hidden', id !== screen);
    const hud = this.screens.hud;
    hud.classList.toggle('hidden', screen !== 'none');
  }

  setLoading(p: number, label: string): void {
    const bar = document.getElementById('loading-bar') as HTMLElement;
    const lab = document.getElementById('loading-label') as HTMLElement;
    const screen = document.getElementById('loading-screen') as HTMLElement;
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    if (lab) lab.textContent = `${label} ${Math.round(p * 100)}%`;
    if (p >= 1 && screen) screen.classList.add('done');
  }

  countdown(text: string, go = false): void {
    const c = this.els.countdown;
    c.classList.remove('hidden');
    c.textContent = text;
    c.classList.toggle('go', go);
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
  }

  hideCountdown(): void {
    this.els.countdown.classList.add('hidden');
  }

  message(text: string, ms = 1600): void {
    const m = this.els['hud-msg'];
    m.textContent = text;
    m.classList.add('show');
    window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => m.classList.remove('show'), ms);
  }

  updateHud(d: HudData): void {
    this.els['speed-val'].textContent = String(Math.round(d.speedKmh));
    this.els.gear.textContent = d.gear;
    this.els['hud-pos'].innerHTML = `${d.position}<small>/${d.totalCars}</small>`;
    this.els['hud-laps'].textContent = `КРУГ ${Math.min(d.lap, d.laps)}/${d.laps}`;
    this.els['hud-time'].textContent = formatTime(d.raceTime);
    this.els['hud-last'].textContent = d.lastLap > 0 ? formatTime(d.lastLap) : '--:--.---';
    this.els['hud-best'].textContent = isFinite(d.bestLap) ? formatTime(d.bestLap) : '--:--.---';
    const bar = this.els['nitro-bar'] as HTMLElement;
    bar.style.width = `${Math.round(d.nitro * 100)}%`;
    bar.classList.toggle('active', d.nitroActive);
    this.els.wrongway.classList.toggle('hidden', !d.wrongWay);
    this.els.speedlines.style.opacity = d.speedKmh > 190 ? '1' : '0';
  }

  showResults(mode: RaceMode, cars: RaceCar[], player: RaceCar, isRecord: boolean): void {
    this.els['results-title'].textContent = mode === 'time' ? 'ЗАЕЗД ЗАВЕРШЁН' : 'ФИНИШ!';
    const body = this.els['results-body'];
    body.innerHTML = '';
    const sorted = [...cars].sort((a, b) => a.position - b.position);
    for (const c of sorted) {
      const tr = document.createElement('tr');
      if (c.isPlayer) tr.className = 'player';
      tr.innerHTML = `<td>${c.position}</td><td>${c.isPlayer ? 'ВЫ' : c.name}</td><td>${isFinite(c.bestLapTime) ? formatTime(c.bestLapTime) : '--:--.---'}</td><td>${c.finished ? formatTime(c.finishTime) : '—'}</td>`;
      body.appendChild(tr);
    }
    this.els['results-record'].innerHTML = isRecord ? '<div class="new-record">★ НОВЫЙ РЕКОРД ТРАССЫ! ★</div>' : '';
    this.show('results');
  }

  // ---------- миникарта ----------
  buildMinimap(track: TrackData): void {
    const base = document.createElement('canvas');
    base.width = this.minimapCv.width;
    base.height = this.minimapCv.height;
    const ctx = base.getContext('2d')!;
    const pad = 26;
    const w = base.width - pad * 2;
    const h = base.height - pad * 2;
    const sx = w / (track.maxX - track.minX);
    const sz = h / (track.maxZ - track.minZ);
    const sc = Math.min(sx, sz);
    const ox = pad + (w - (track.maxX - track.minX) * sc) / 2 - track.minX * sc;
    const oz = pad + (h - (track.maxZ - track.minZ) * sc) / 2 - track.minZ * sc;
    this.mapCtx = ctx;
    this.mapBase = base;
    ctx.fillStyle = 'rgba(10,13,20,0.0)';
    ctx.clearRect(0, 0, base.width, base.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    track.samples.forEach((s, i) => {
      const x = ox + s.x * sc;
      const y = oz + s.z * sc;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,244,250,0.95)';
    ctx.lineWidth = 3.4;
    ctx.stroke();
    // стартовая отметка
    const s0 = track.samples[0];
    ctx.fillStyle = '#6dff8f';
    ctx.beginPath();
    ctx.arc(ox + s0.x * sc, oz + s0.z * sc, 5, 0, 7);
    ctx.fill();
    this.mapScale = { sc, ox, oz };
  }

  private mapScale: { sc: number; ox: number; oz: number } | null = null;

  drawMinimap(cars: RaceCar[], playerId: number): void {
    if (!this.mapBase || !this.mapScale) return;
    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, this.minimapCv.width, this.minimapCv.height);
    ctx.drawImage(this.mapBase, 0, 0);
    const { sc, ox, oz } = this.mapScale;
    for (const c of cars) {
      const x = ox + c.vehicle.pos.x * sc;
      const y = oz + c.vehicle.pos.z * sc;
      ctx.beginPath();
      ctx.arc(x, y, c.id === playerId ? 6 : 4.5, 0, 7);
      ctx.fillStyle = c.id === playerId ? '#ffffff' : `#${c.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
      if (c.id === playerId) {
        ctx.strokeStyle = '#ff3d2e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  setFps(text: string, visible: boolean): void {
    const b = this.els['fps-badge'];
    b.style.display = visible ? 'block' : 'none';
    b.textContent = text;
  }
}
