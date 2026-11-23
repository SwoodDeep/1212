// Скриншоты всех экранов для визуальной проверки.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
const OUT = 'tools/dl/shots/final';
mkdirSync(OUT, { recursive: true });
const PORT = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: '/workspace', stdio: 'ignore' });
await wait(2500);
const ENV = {
  ...process.env,
  LD_LIBRARY_PATH: '/workspace/tools/syslibs/usr/lib/x86_64-linux-gnu:/workspace/tools/syslibs/lib/x86_64-linux-gnu',
  FONTCONFIG_FILE: '/workspace/tools/syslibs/etc/fonts/fonts.conf',
};
const browser = await chromium.launch({
  headless: true,
  env: ENV,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${PORT}/?fps&quality=${process.argv[2] || 'high'}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
await wait(1500);
await page.screenshot({ path: `${OUT}/01-menu.png` });

await page.click('[data-action="open-car"]');
await wait(800);
await page.screenshot({ path: `${OUT}/02-carselect.png` });
await page.click('#carselect [data-action="back"]');
await page.click('[data-action="open-settings"]');
await wait(500);
await page.screenshot({ path: `${OUT}/03-settings.png` });
await page.click('#settings [data-action="back"]');
await page.click('[data-action="open-help"]');
await wait(400);
await page.screenshot({ path: `${OUT}/04-help.png` });
await page.click('#help [data-action="back"]');

// гонка с автопилотом
await page.evaluate(() => window.__game.startRace('race'));
await wait(1200);
await page.screenshot({ path: `${OUT}/05-countdown.png` });
await page.evaluate(() => window.__game.setAutopilot(true));
await page.waitForFunction(() => window.__game.race.state === 'running', null, { timeout: 20000 });
// едем, пока скорость не станет высокой (прямая)
for (let i = 0; i < 40; i++) {
  await wait(500);
  const kmh = await page.evaluate(() => window.__game.race.player().vehicle.speedKmh);
  if (kmh > 150) break;
}
await page.screenshot({ path: `${OUT}/06-race-fast.png` });
await wait(4000);
await page.screenshot({ path: `${OUT}/07-race-mid.png` });
// камера капот
await page.keyboard.press('KeyC');
await page.keyboard.press('KeyC');
await wait(1500);
await page.screenshot({ path: `${OUT}/08-race-hood.png` });
await page.keyboard.press('KeyC');

// ждём финиша (ff ускоряем через reload нельзя — просто ждём; autopilot едет ~45с/круг)
const t0 = Date.now();
while (Date.now() - t0 < 150000) {
  await wait(2000);
  const st = await page.evaluate(() => window.__game.state);
  if (st === 'results') break;
}
await wait(800);
await page.screenshot({ path: `${OUT}/09-results.png` });
const summary = await page.evaluate(() => {
  const g = window.__game;
  const p = g.race.player();
  return { state: g.state, lap: p.lap, prog: Math.round(p.prog), pos: p.position, best: p.bestLapTime, stats: g.stats(), cars: g.race.cars.map((c) => ({ n: c.name.slice(0, 12), lap: c.lap, pos: c.position, prog: Math.round(c.prog), fin: c.finished })) };
});
console.log(JSON.stringify(summary, null, 1));
await browser.close();
server.kill();
