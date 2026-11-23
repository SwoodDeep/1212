import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
const server = spawn('npx', ['vite', 'preview', '--port', '4181', '--strictPort', '--host', '127.0.0.1'], { cwd: '/workspace', stdio: 'ignore' });
await wait(2500);
const browser = await chromium.launch({
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/workspace/tools/syslibs/usr/lib/x86_64-linux-gnu:/workspace/tools/syslibs/lib/x86_64-linux-gnu' },
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4181/?fps&quality=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
const info = await page.evaluate(() => {
  const q = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      sel, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, color: cs.color,
      fontSize: cs.fontSize, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: (el.textContent || '').slice(0, 40), cls: el.className, z: cs.zIndex, bg: cs.background.slice(0, 60),
    };
  };
  return {
    uiRoot: q('#ui-root'), hud: q('#hud'), speed: q('#hud-speed'), speedVal: q('#speed-val'),
    menu: q('#menu'), title: q('.title'), btn: q('#menu .btn'), minimap: q('#minimap'),
    hudTop: q('#hud-top'), laps: q('#hud-laps'), pos: q('#hud-pos'), nitro: q('#nitro-wrap'),
    canvasRect: q('#game-canvas'),
    cssLoaded: [...document.styleSheets].map((s) => { try { return { href: s.href, rules: s.cssRules.length }; } catch { return { href: s.href, rules: 'blocked' }; } }),
  };
});
console.log(JSON.stringify(info, null, 1));
// стартуем гонку и смотрим HUD
await page.evaluate(() => window.__game.startRace('race'));
await wait(5000);
const info2 = await page.evaluate(() => {
  const q = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { sel, display: cs.display, color: cs.color, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], text: (el.textContent || '').slice(0, 30) };
  };
  return { hud: q('#hud'), speed: q('#hud-speed'), speedVal: q('#speed-val'), laps: q('#hud-laps'), pos: q('#hud-pos'), top: q('#hud-top'), nitro: q('#nitro-wrap'), cd: q('#countdown') };
});
console.log(JSON.stringify(info2, null, 1));
await page.screenshot({ path: 'tools/dl/shots/probe-race.png' });
await browser.close();
server.kill();
