// Скачивает CC0-набор Kenney: node tools/kenney.mjs <slug> [outdir]
// Распаковывает zip через python3 zipfile.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const slug = process.argv[2];
const outDir = process.argv[3] || `public/assets/kenney/${slug}`;

if (!slug) {
  console.log('usage: node tools/kenney.mjs <slug> [outdir]');
  process.exit(1);
}

const pageRes = await fetch(`https://kenney.nl/assets/${slug}`, { headers: { 'User-Agent': UA } });
if (!pageRes.ok) throw new Error(`page ${pageRes.status} for ${slug}`);
const page = await pageRes.text();
const m = page.match(/data-download-id='([^']+)'/);
if (!m) throw new Error(`no download id on page for ${slug}`);
console.log(`[${slug}] download-id: ${m[1]}`);

const linkRes = await fetch(`https://kenney.nl/download-link/${m[1]}`, {
  headers: { 'User-Agent': UA, Referer: `https://kenney.nl/assets/${slug}`, Accept: 'application/json' }
});
const linkJson = await linkRes.json();
const url = linkJson.url;
if (!url) throw new Error(`no url in response for ${slug}: ${JSON.stringify(linkJson).slice(0, 200)}`);

console.log(`[${slug}] fetching ${url.slice(0, 90)}...`);
const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
mkdirSync('tools/dl', { recursive: true });
const zip = `tools/dl/${slug}.zip`;
writeFileSync(zip, buf);
console.log(`[${slug}] ${buf.length} bytes -> ${zip}`);
mkdirSync(outDir, { recursive: true });
execFileSync('python3', ['-m', 'zipfile', '-e', zip, outDir]);
console.log(`[${slug}] extracted -> ${outDir}`);
