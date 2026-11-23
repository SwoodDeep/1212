// Скачивает ассет Poly Haven (CC0): node tools/ph.mjs <slug> <textures|hdris|models> <res> <outdir> [mapsCSV]
import { writeFileSync, mkdirSync } from 'node:fs';

const [slug, type, res, outdir, mapsArg] = process.argv.slice(2);
if (!slug || !type || !res || !outdir) {
  console.log('usage: node tools/ph.mjs <slug> <textures|hdris> <res:1k|2k|4k> <outdir> [mapsCSV]');
  process.exit(1);
}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const files = await (await fetch(`https://api.polyhaven.com/files/${slug}`, { headers: { 'User-Agent': UA } })).json();
mkdirSync(outdir, { recursive: true });

const keyMap = { diff: 'Diffuse', nor: 'nor_gl', nor_dx: 'nor_dx', rough: 'rough', ao: 'ao', arm: 'arm', disp: 'disp', metal: 'metal', emis: 'emissive' };

async function save(url, name) {
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(`${outdir}/${name}`, buf);
  console.log(`${name}: ${(buf.length / 1024).toFixed(0)} KB`);
}

const findEntry = (key, r) => {
  for (const k of Object.keys(files)) {
    if (k.toLowerCase() === key.toLowerCase()) {
      const e = files[k]?.[r];
      if (e) return e.jpg || e.png || e.hdr || e;
    }
  }
  return null;
};

if (type === 'hdris') {
  const group = files.hdri || files.hdr || {};
  const e = group[res];
  const entry = e?.hdr || e;
  if (!entry || !entry.url) throw new Error(`no hdri ${res} for ${slug}; top=${Object.keys(files)} res=${Object.keys(group)}`);
  await save(entry.url, `${slug}_${res}.hdr`);
} else if (type === 'models') {
  const entry = files.gltf?.[res]?.url || files.glb?.[res]?.url;
  if (!entry) throw new Error(`no model ${res} for ${slug}`);
  await save(entry, `${slug}.glb`);
} else {
  const maps = (mapsArg || 'diff,nor,rough,ao').split(',');
  for (const map of maps) {
    const key = keyMap[map] || map;
    let used = res;
    let entry = findEntry(key, res);
    if (!entry) { entry = findEntry(key, '2k'); used = '2k'; }
    if (!entry) { entry = findEntry(key, '4k'); used = '4k'; }
    if (!entry || !entry.url) { console.log(`skip ${map}`); continue; }
    const ext = entry.url.split('.').pop();
    await save(entry.url, `${slug}_${map}_${used}.${ext}`);
  }
}
console.log('done:', slug);
