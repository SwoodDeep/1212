// Скачивает нужные системные .deb (Debian trixie amd64) и распаковывает в tools/syslibs без root.
// node tools/fetch-syslibs.mjs
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const UA = 'Mozilla/5.0';
const OUT = 'tools/syslibs';
const DEBS = 'tools/dl/debs';
mkdirSync(OUT, { recursive: true });
mkdirSync(DEBS, { recursive: true });

// 1. Индекс пакетов trixie main amd64
const idxUrl = 'https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.gz';
console.log('fetching Packages.gz...');
const gz = Buffer.from(await (await fetch(idxUrl, { headers: { 'User-Agent': UA } })).arrayBuffer());
const txt = zlib.gunzipSync(gz).toString('utf8');
const map = new Map(); // package -> filename
for (const block of txt.split('\n\n')) {
  const mName = block.match(/^Package: (.+)$/m);
  const mFile = block.match(/^Filename: (.+)$/m);
  if (mName && mFile) map.set(mName[1], mFile[1]);
}
console.log('packages indexed:', map.size);

// 2. Что нужно (с альтернативами имён в trixie t64)
const NEED = [
  'libglib2.0-0t64', 'libglib2.0-0',
  'libnss3', 'libnspr4',
  'libatk1.0-0t64', 'libatk1.0-0',
  'libatk-bridge2.0-0t64', 'libatk-bridge2.0-0',
  'libatspi2.0-0t64', 'libatspi2.0-0',
  'libdbus-1-3', 'libgbm1', 'libasound2t64', 'libasound2',
  'libx11-6', 'libxcb1', 'libxext6', 'libxcomposite1', 'libxdamage1', 'libxfixes3',
  'libxkbcommon0', 'libxrandr2', 'libx11-xcb1', 'libxcb-dri3-0', 'libdrm2', 'libexpat1',
  'libffi8', 'libpcre2-8-0', 'libselinux1', 'libmount1', 'libsystemd0', 'liblzma5', 'libzstd1', 'libbsd0', 'libmd0', 'libz1g', 'libgcc-s1', 'libstdc++6',
];

async function getDeb(pkg) {
  const file = map.get(pkg);
  if (!file) return null;
  const local = `${DEBS}/${pkg}.deb`;
  if (!existsSync(local)) {
    const url = `https://deb.debian.org/debian/${file}`;
    const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    writeFileSync(local, buf);
  }
  execFileSync('dpkg-deb', ['-x', local, OUT]);
  console.log('extracted', pkg);
  return true;
}

for (const p of NEED) {
  try { await getDeb(p); } catch (e) { console.log('skip', p, e.message.slice(0, 80)); }
}

// 3. Проверяем ldd и докачиваем недостающее
const shell = '/home/appuser/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
for (let round = 0; round < 4; round++) {
  const env = { ...process.env, LD_LIBRARY_PATH: `${OUT}/usr/lib/x86_64-linux-gnu:${OUT}/lib/x86_64-linux-gnu` };
  let out = '';
  try {
    out = execFileSync('ldd', [shell], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) {
    out = (e.stdout || '').toString() + (e.stderr || '').toString();
  }
  const missing = [...out.matchAll(/(\S+\.so[\w.-]*) => not found/g)].map((m) => m[1]);
  if (missing.length === 0) {
    console.log('ALL LIBS RESOLVED');
    break;
  }
  console.log('round', round, 'missing:', missing.join(' '));
  // эвристика: имя библиотеки -> пакет
  const guess = {
    'libglib-2.0': 'libglib2.0-0t64', 'libgobject-2.0': 'libglib2.0-0t64', 'libgio-2.0': 'libglib2.0-0t64',
    'libnss3': 'libnss3', 'libnssutil3': 'libnss3', 'libnspr4': 'libnspr4',
    'libatk-1.0': 'libatk1.0-0t64', 'libatk-bridge-2.0': 'libatk-bridge2.0-0t64', 'libatspi': 'libatspi2.0-0t64',
    'libdbus-1': 'libdbus-1-3', 'libgbm': 'libgbm1', 'libasound': 'libasound2t64',
    'libX11': 'libx11-6', 'libxcb': 'libxcb1', 'libXext': 'libxext6', 'libXcomposite': 'libxcomposite1',
    'libXdamage': 'libxdamage1', 'libXfixes': 'libxfixes3', 'libxkbcommon': 'libxkbcommon0', 'libXrandr': 'libxrandr2',
    'libdrm': 'libdrm2', 'libexpat': 'libexpat1', 'libffi': 'libffi8', 'libpcre2': 'libpcre2-8-0',
    'libselinux': 'libselinux1', 'libmount': 'libmount1', 'libsystemd': 'libsystemd0', 'liblzma': 'liblzma5',
    'libzstd': 'libzstd1', 'libbsd': 'libbsd0', 'libmd': 'libmd0', 'libz.so': 'libz1g', 'libgcc_s': 'libgcc-s1', 'libstdc++': 'libstdc++6',
  };
  let any = false;
  for (const lib of missing) {
    const base = lib.replace(/\.so.*$/, '');
    for (const [k, v] of Object.entries(guess)) {
      if (base.startsWith(k)) {
        try { if (await getDeb(v)) any = true; } catch {}
        break;
      }
    }
  }
  if (!any) {
    console.log('cannot resolve more:', missing.join(' '));
    break;
  }
}
console.log('syslibs ready at', OUT);
