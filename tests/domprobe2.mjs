import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
const server = spawn('npx',['vite','preview','--port','4182','--strictPort','--host','127.0.0.1'],{cwd:'/workspace',stdio:'ignore'});
await wait(2500);
const browser = await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:'/workspace/tools/syslibs/usr/lib/x86_64-linux-gnu:/workspace/tools/syslibs/lib/x86_64-linux-gnu'},args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://127.0.0.1:4182/?quality=medium',{waitUntil:'load'});
await page.waitForFunction(()=>window.__game&&window.__game.ready,null,{timeout:120000});
await page.evaluate(()=>window.__game.startRace('race'));
await wait(5000);
const out = await page.evaluate(()=>{
  const hud=document.querySelector('#hud');
  const sp=document.querySelector('#hud-speed');
  const sv=document.querySelector('#speed-val');
  const laps=document.querySelector('#hud-laps');
  const mm=document.querySelector('#minimap');
  const sheets=[...document.styleSheets].map(s=>{try{return (s.href||'inline')+':'+s.cssRules.length}catch{return (s.href||'inline')+':blocked'}});
  return {
    hudClass: hud.className, hudDisplay: getComputedStyle(hud).display, hudRect: hud.getBoundingClientRect().toJSON(),
    speedRect: sp.getBoundingClientRect().toJSON(), speedDisplay: getComputedStyle(sp).display,
    speedValRect: sv.getBoundingClientRect().toJSON(), speedValText: sv.textContent,
    lapsRect: laps.getBoundingClientRect().toJSON(), lapsText: laps.textContent,
    mmRect: mm.getBoundingClientRect().toJSON(),
    sheets,
    hudChildren: [...hud.children].map(c=>c.id+':'+c.getBoundingClientRect().width+'x'+c.getBoundingClientRect().height),
  };
});
console.log(JSON.stringify(out,null,1));
await page.screenshot({path:'tools/dl/shots/probe2-race.png'});
await browser.close(); server.kill();
