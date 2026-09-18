// SEO and integrity checks over the built site. Usage: npm run build && npm run check:dist
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const ORIGIN = 'https://usejev.dev';
const DISCLAIMER = 'Unofficial community resource. Not affiliated with TypeSafe AI.';
const errors = [];
const fail = (page, msg) => errors.push(`${page}: ${msg}`);

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const files = await walk(DIST);
const pages = new Map(); // url path -> { html, links }
for (const file of files) {
  const rel = relative(DIST, file);
  const path = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '');
  pages.set(path, { html: await readFile(file, 'utf8') });
}

const titles = new Map();
const descriptions = new Map();
for (const [path, page] of pages) {
  const { html } = page;
  const is404 = path === '/404.html';
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? '';

  if (!title) fail(path, 'missing <title>');
  if (title.length > 60) fail(path, `title is ${title.length} chars (max 60): ${title}`);
  if (titles.has(title)) fail(path, `duplicate title with ${titles.get(title)}`);
  titles.set(title, path);
  if (desc.length < 70 || desc.length > 165) fail(path, `description is ${desc.length} chars`);
  if (descriptions.has(desc)) fail(path, `duplicate description with ${descriptions.get(desc)}`);
  descriptions.set(desc, path);
  if (!is404 && canonical !== ORIGIN + path) fail(path, `canonical is "${canonical}"`);
  if (!/<html lang="en"/.test(html)) fail(path, 'missing lang="en"');
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) fail(path, 'must have exactly one <h1>');
  if (!html.includes(DISCLAIMER)) fail(path, 'footer disclaimer missing');
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:site_name']) {
    if (!html.includes(`property="${tag}"`)) fail(path, `missing ${tag}`);
  }
  if (!html.includes('name="twitter:card"')) fail(path, 'missing twitter:card');
  if (/localhost|127\.0\.0\.1|\.pages\.dev/.test(html)) fail(path, 'contains a localhost or pages.dev URL');
  for (const img of html.match(/<img\b[^>]*>/g) ?? []) if (!/\balt="/.test(img)) fail(path, `img without alt: ${img}`);

  // Heading hierarchy: never skip a level going down.
  let last = 0;
  for (const m of html.matchAll(/<h([1-6])[\s>]/g)) {
    const level = Number(m[1]);
    if (last && level > last + 1) fail(path, `heading jumps from h${last} to h${level}`);
    last = level;
  }

  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      types.push(data['@type']);
      if (!JSON.stringify(data).includes(ORIGIN) && data['@type'] !== 'FAQPage') fail(path, `${data['@type']} JSON-LD lacks ${ORIGIN}`);
    } catch {
      fail(path, 'invalid JSON-LD');
    }
  }
  if (path === '/' && !types.includes('WebSite')) fail(path, 'missing WebSite JSON-LD');
  if (/^\/(use-cases|guides)\/[^/]+\/$/.test(path)) {
    for (const t of ['TechArticle', 'BreadcrumbList']) if (!types.includes(t)) fail(path, `missing ${t} JSON-LD`);
  }
  if (html.includes('id="faq-heading"') && !types.includes('FAQPage')) fail(path, 'FAQ section without FAQPage JSON-LD');

  page.links = [...html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)/g)].map((m) => m[1]);
  for (const href of page.links) {
    const isFile = /\.[a-z0-9]+$/.test(href);
    if (!isFile && !href.endsWith('/')) fail(path, `internal link without trailing slash: ${href}`);
    if (!isFile && !pages.has(href)) fail(path, `broken internal link: ${href}`);
    if (href !== href.toLowerCase()) fail(path, `uppercase URL: ${href}`);
  }
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    const text = m[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (['click here', 'here', 'read more', 'link', 'this'].includes(text)) fail(path, `non-descriptive link text: "${text}"`);
  }

  if (/^\/use-cases\/[^/]+\/$/.test(path)) {
    const body = html.match(/<div class="prose">([\s\S]*?)<section class="related"/)?.[1] ?? '';
    const words = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    page.words = words;
    if (words < 600) fail(path, `only ${words} words outside code blocks (min 600)`);
    for (const h of ['The problem', 'Why Jev fits', 'Question design', 'Code', 'Example response', 'Decision logic', 'Cost estimate', 'Pitfalls', 'Related use cases']) {
      if (!new RegExp(`<h2[^>]*>${h}</h2>`).test(html)) fail(path, `missing section "${h}"`);
    }
    if (/noul[^\n]{0,40}\.confidence|"type": "noul"[^}]*confidence/.test(html.replace(/<[^>]+>/g, ''))) fail(path, 'Noul answers have no confidence field');
  }
}

// Click depth from home (breadth-first).
const depth = new Map([['/', 0]]);
const queue = ['/'];
while (queue.length) {
  const current = queue.shift();
  for (const href of pages.get(current)?.links ?? []) {
    if (pages.has(href) && !depth.has(href)) {
      depth.set(href, depth.get(current) + 1);
      queue.push(href);
    }
  }
}
for (const path of pages.keys()) {
  if (path === '/404.html') continue;
  if (!depth.has(path)) fail(path, 'not reachable from home');
  else if (depth.get(path) > 2) fail(path, `click depth ${depth.get(path)} (max 2)`);
}

// Sitemap, robots, RSS.
const sitemap = await readFile(join(DIST, 'sitemap-0.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) if (!loc.startsWith(ORIGIN + '/') || !loc.endsWith('/')) fail('sitemap', `bad loc ${loc}`);
for (const path of pages.keys()) if (path !== '/404.html' && !locs.includes(ORIGIN + path)) fail('sitemap', `missing ${path}`);
if (!(await readFile(join(DIST, 'robots.txt'), 'utf8')).includes(`Sitemap: ${ORIGIN}/sitemap-index.xml`)) fail('robots.txt', 'sitemap line missing');
const rss = await readFile(join(DIST, 'rss.xml'), 'utf8');
if (/localhost/.test(rss) || !rss.includes(`${ORIGIN}/use-cases/`)) fail('rss.xml', 'bad item links');

console.log(`Checked ${pages.size} pages, ${locs.length} sitemap URLs.`);
for (const [path, page] of pages) if (page.words) console.log(`  ${String(page.words).padStart(5)} words  ${path}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('All checks passed.');
