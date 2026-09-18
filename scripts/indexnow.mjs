// Submits every URL in the built sitemap to IndexNow (Bing, Yandex, Seznam, Naver, ...).
// Usage: npm run build && npm run indexnow   (run after each production deploy)
// Add --dry-run to print the payload without sending it.
import { readFile, readdir } from 'node:fs/promises';

const HOST = 'usejev.dev';
const KEY = '280f60ee41bf80fbea66b7cac87d4386'; // must match public/<KEY>.txt
const DIST = new URL('../dist/', import.meta.url);
const dryRun = process.argv.includes('--dry-run');

const files = (await readdir(DIST)).filter((f) => /^sitemap-\d+\.xml$/.test(f));
if (!files.length) {
  console.error('No sitemap found in dist/. Run `npm run build` first.');
  process.exit(1);
}

const urls = [];
for (const file of files) {
  const xml = await readFile(new URL(file, DIST), 'utf8');
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(match[1]);
}

const foreign = urls.filter((u) => new URL(u).host !== HOST);
if (foreign.length) {
  console.error(`Refusing to submit: ${foreign.length} URL(s) are not on ${HOST}, e.g. ${foreign[0]}`);
  process.exit(1);
}

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls,
};

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});
console.log(`IndexNow: submitted ${urls.length} URLs, HTTP ${res.status} ${res.statusText}`);
if (!res.ok && res.status !== 202) process.exit(1);
