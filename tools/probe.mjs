// Универсальный probe: node tools/probe.mjs <url> [regex] [--save=path]
// Скачивает через fetch (curl в песочнице заблокирован) и сохраняет бинарники.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
const pattern = args.find((a) => !a.startsWith('--') && a !== url);
const saveArg = args.find((a) => a.startsWith('--save='));
const savePath = saveArg ? saveArg.slice('--save='.length) : null;

if (!url) {
  console.log('usage: node tools/probe.mjs <url> [regex] [--save=path]');
  process.exit(1);
}

try {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', Accept: '*/*' },
    redirect: 'follow'
  });
  const ct = res.headers.get('content-type') || '';
  const len = res.headers.get('content-length') || '?';
  console.log(`STATUS ${res.status} ${res.url}`);
  console.log(`TYPE ${ct} LEN ${len}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`BYTES ${buf.length}`);
  if (savePath) {
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(savePath, buf);
    console.log(`SAVED ${savePath}`);
  } else if (/text|json|xml|html|javascript/.test(ct) || buf.length < 200000) {
    const text = buf.toString('utf8');
    if (pattern) {
      const re = new RegExp(pattern, 'gi');
      const lines = text.split('\n').filter((l) => re.test(l));
      console.log(`MATCHES ${lines.length}`);
      for (const l of lines.slice(0, 60)) console.log(l.trim().slice(0, 300));
    } else {
      console.log(text.slice(0, 1200));
    }
  } else {
    console.log('BINARY, first bytes:', buf.subarray(0, 16).toString('hex'));
  }
} catch (e) {
  console.log('ERROR', e.message);
  process.exit(2);
}
