// Инспектор GLB: node tools/glbinfo.mjs <file.glb>
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.log('not a GLB');
  process.exit(1);
}
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
console.log('== nodes ==');
(json.nodes || []).forEach((n, i) => {
  const t = n.translation ? ` t=[${n.translation.map((v) => +v.toFixed(2))}]` : '';
  const r = n.rotation ? ` r=[${n.rotation.map((v) => +v.toFixed(2))}]` : '';
  const s = n.scale ? ` s=[${n.scale.map((v) => +v.toFixed(2))}]` : '';
  console.log(`${i}: "${n.name}"${n.mesh !== undefined ? ` mesh=${n.mesh}` : ''}${t}${r}${s}`);
});
console.log('== meshes ==');
(json.meshes || []).forEach((m, i) => {
  const p = m.primitives[0];
  const acc = json.accessors[p.attributes.POSITION];
  const mn = acc.min ? acc.min.map((v) => +v.toFixed(2)) : '?';
  const mx = acc.max ? acc.max.map((v) => +v.toFixed(2)) : '?';
  console.log(`${i}: "${m.name}" prims=${m.primitives.length} verts=${acc.count} min=[${mn}] max=[${mx}]`);
});
console.log('== materials ==', (json.materials || []).map((m) => m.name));
console.log('== animations ==', (json.animations || []).map((a) => a.name));
console.log('== images ==', (json.images || []).map((i) => i.name || (i.uri || '').slice(0, 80)));
console.log('== size ==', buf.length, 'bytes');
