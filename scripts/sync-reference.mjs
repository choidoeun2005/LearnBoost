import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = 'https://www.sidequestly.app';
const output = path.resolve('public');
const pages = ['/', '/product', '/product/branching', '/pricing', '/science', '/impressum', '/datenschutz'];
const assets = new Set();

async function downloadAsset(asset) {
  const url = new URL(asset, origin);
  if (url.origin !== origin || /\.js$/.test(url.pathname)) return;
  if (assets.has(url.pathname)) return;
  assets.add(url.pathname);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname}: ${response.status}`);
  const destination = path.join(output, url.pathname);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
  if (url.pathname.endsWith('.css')) {
    for (const match of buffer.toString().matchAll(/url\(["']?([^\s)'"?]+)[^)]*\)/g)) {
      if (!match[1].startsWith('data:')) await downloadAsset(new URL(match[1], url).href);
    }
  }
}

for (const route of pages) {
  const response = await fetch(new URL(route, origin));
  if (!response.ok) throw new Error(`${route}: ${response.status}`);
  let html = await response.text();
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*(?:as="script"|rel="canonical"|property="og:url")[^>]*>/gi, '')
    .replace(/href="\/(?:auth\/[^"#]*|billing)"/g, 'href="/app"')
    .replace(/<\/head>/, '<meta name="robots" content="noindex,nofollow"/><script src="/reference-controls.js" defer></script></head>');
  for (const match of html.matchAll(/(?:src|href)="(\/(?:_next\/static\/[^" ]+|landing\/[^" ]+|icon\.png[^" ]*))"/g)) await downloadAsset(match[1]);
  for (const match of html.matchAll(/srcSet="([^"]+)"/gi)) {
    for (const candidate of match[1].split(',')) await downloadAsset(candidate.trim().split(/\s/)[0]);
  }
  const destination = path.join(output, 'site', route, 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
  console.log(`Saved ${route}`);
}
await writeFile(path.join(output, 'site', 'source.json'), JSON.stringify({ origin, capturedAt: new Date().toISOString(), pages, assets: assets.size }, null, 2));
console.log(`Saved ${pages.length} pages and ${assets.size} assets.`);
