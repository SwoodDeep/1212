// E2E-прогон в headless Chromium (SwiftShader WebGL): загрузка, меню, гонка, физика, круги, консоль, FPS, скриншоты.
// Запуск: node tests/e2e.mjs [quality] [seconds]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const QUALITY = process.argv[2] || 'medium';
const SECONDS = parseInt(process.argv[3] || '60', 10);
const PORT = 4180;
const SHOTS = 'tools/dl/shots';
mkdirSync(SHOTS, { recursive: true });

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(url, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await wait(300);
  }
  throw new Error('server did not start');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: '/workspace',
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

const report = { quality: QUALITY, errors: [], checks: {}, screenshots: [] };

try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  const browser = await chromium.launch({
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: '/workspace/tools/syslibs/usr/lib/x86_64-linux-gnu:/workspace/tools/syslibs/lib/x86_64-linux-gnu' },
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => report.errors.push('PAGEERROR: ' + (e.stack || e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push('CONSOLE: ' + m.text().slice(0, 300));
  });

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?fps&quality=${QUALITY}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 120000 });
  report.checks.loadMs = Date.now() - t0;
  await page.screenshot({ path: `${SHOTS}/01-menu-${QUALITY}.png` });
  report.screenshots.push(`01-menu-${QUALITY}.png`);

  // --- меню: кликаем "Гонка" ---
  await page.click('[data-action="start-race"]');
  await page.waitForFunction(() => window.__game.race.state === 'countdown', null, { timeout: 10000 });
  report.checks.countdownStarted = true;
  await page.screenshot({ path: `${SHOTS}/02-countdown-${QUALITY}.png` });
  await page.waitForFunction(() => window.__game.race.state === 'running', null, { timeout: 15000 });
  report.checks.raceRunning = true;

  // --- ручное управление: газ 3 сек ---
  await page.keyboard.down('KeyW');
  const trace = [];
  for (let i = 0; i < 6; i++) {
    await wait(500);
    trace.push(await page.evaluate(() => ({
      thr: window.__game.input.state.throttle,
      raceState: window.__game.race.state,
      gameState: window.__game.state,
      kmh: Math.round(window.__game.race.player().vehicle.speedKmh),
      vf: +window.__game.race.player().vehicle.forwardSpeed.toFixed(1),
      prog: Math.round(window.__game.race.player().prog),
      wall: +window.__game.race.player().vehicle.last.wallHit.toFixed(1),
      off: window.__game.race.player().vehicle.last.offroad,
      steps: window.__game.game.debugSteps,
      pos: [window.__game.race.player().vehicle.pos.x.toFixed(1), window.__game.race.player().vehicle.pos.z.toFixed(1)],
    })));
  }
  report.checks.inputTrace = trace;
  const spd = trace[trace.length - 1].kmh;
  report.checks.speedAfterThrottle = spd;
  await page.screenshot({ path: `${SHOTS}/03-race-early-${QUALITY}.png` });
  report.screenshots.push(`03-race-early-${QUALITY}.png`);
  await page.keyboard.up('KeyW');
  report.checks.speedOk = spd > 40;

  // --- пауза ---
  await page.keyboard.press('Escape');
  await wait(400);
  report.checks.paused = await page.evaluate(() => window.__game.state === 'pause');
  await page.screenshot({ path: `${SHOTS}/04-pause-${QUALITY}.png` });
  await page.keyboard.press('Escape');
  await wait(400);
  report.checks.resumed = await page.evaluate(() => window.__game.state === 'race');

  // --- R (респавн) ---
  await page.keyboard.press('KeyR');
  await wait(1200);
  report.checks.respawnOk = await page.evaluate(() => {
    const p = window.__game.race.player().vehicle;
    const c = window.__game.track.closest(p.pos.x, p.pos.z);
    return Math.abs(c.lateral) < 2 && p.speed < 1;
  });

  // --- C (камера) ---
  await page.keyboard.press('KeyC');
  await wait(200);

  // --- автопилот до конца заезда (ускорено ff=6) ---
  await page.evaluate(() => window.__game.setAutopilot(true));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest&fps&ff=6&quality=${QUALITY}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__game.race.state === 'running', null, { timeout: 30000 });
  report.checks.autotestRunning = true;

  const samples = [];
  const endAt = Date.now() + SECONDS * 1000;
  let shotIdx = 10;
  while (Date.now() < endAt) {
    await wait(2500);
    const s = await page.evaluate(() => {
      const g = window.__game;
      const p = g.race.player();
      return {
        state: g.state,
        raceState: g.race.state,
        lap: p.lap,
        prog: Math.round(p.prog),
        pos: p.position,
        finished: p.finished,
        bestLap: isFinite(p.bestLapTime) ? +p.bestLapTime.toFixed(2) : null,
        speed: Math.round(p.vehicle.speedKmh),
        stats: g.stats(),
        calls: g.rendererInfo().calls,
        tris: Math.round(g.rendererInfo().triangles / 1000),
        cars: g.race.cars.map((c) => ({ n: c.name, lap: c.lap, prog: Math.round(c.prog), pos: c.position })),
      };
    });
    samples.push(s);
    if (shotIdx <= 14 && samples.length % 2 === 0) {
      const name = `${String(shotIdx).padStart(2, '0')}-auto-${QUALITY}.png`;
      await page.screenshot({ path: `${SHOTS}/${name}` });
      report.screenshots.push(name);
      shotIdx++;
    }
    if (s.state === 'results') break;
  }
  report.checks.samples = samples;
  report.checks.finalState = await page.evaluate(() => window.__game.state);
  report.checks.playerProg = samples.length ? samples[samples.length - 1].prog : 0;
  report.checks.playerLap = samples.length ? samples[samples.length - 1].lap : 0;
  report.checks.resultsShown = report.checks.finalState === 'results';
  if (report.checks.finalState === 'results') {
    await page.screenshot({ path: `${SHOTS}/20-results-${QUALITY}.png` });
    report.screenshots.push(`20-results-${QUALITY}.png`);
  }
  const last = samples[samples.length - 1];
  if (last) {
    report.checks.fps = Math.round(last.stats.fps);
    report.checks.drawCalls = last.calls;
    report.checks.trisK = last.tris;
  }
  report.checks.noJsErrors = report.errors.length === 0;

  await browser.close();
} catch (e) {
  report.errors.push('E2E EXCEPTION: ' + (e.stack || e.message));
} finally {
  server.kill('SIGTERM');
}

writeFileSync(`tools/dl/e2e-${QUALITY}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  quality: report.quality,
  loadMs: report.checks.loadMs,
  countdownStarted: report.checks.countdownStarted,
  raceRunning: report.checks.raceRunning,
  speedAfterThrottle: report.checks.speedAfterThrottle,
  speedOk: report.checks.speedOk,
  paused: report.checks.paused,
  resumed: report.checks.resumed,
  respawnOk: report.checks.respawnOk,
  autotestRunning: report.checks.autotestRunning,
  finalState: report.checks.finalState,
  playerProg: report.checks.playerProg,
  playerLap: report.checks.playerLap,
  resultsShown: report.checks.resultsShown,
  fps: report.checks.fps,
  drawCalls: report.checks.drawCalls,
  trisK: report.checks.trisK,
  errors: report.errors.slice(0, 12),
  noJsErrors: report.checks.noJsErrors,
}, null, 2));
process.exit(report.errors.length ? 1 : 0);
