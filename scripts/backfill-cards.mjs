// Fill in what Jev can decide for posts that are already published: `headline` (the author's
// sentence that best says what was built) and `category`. Needs TYPESAFE_API_KEY.
//   node scripts/backfill-cards.mjs [--force]
// Uses the full post text from the local watcher log when there is one; the stored excerpt is
// cut by X at about 280 characters and often stops before the interesting sentence.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { classifyPost, pickHeadline } from '../api/_lib/classify.ts';

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
process.env.TYPESAFE_API_KEY ||= env.match(/^TYPESAFE_API_KEY=(.+)$/m)?.[1] ?? '';
const force = process.argv.includes('--force');

const log = await readFile(new URL('../.scratch/watch-runs.jsonl', import.meta.url), 'utf8').catch(() => '');
const fullText = new Map();
for (const line of log.split('\n').filter(Boolean)) {
  try {
    const l = JSON.parse(line);
    if (l.type === 'post') fullText.set(l.id, l.text);
  } catch {}
}

const useCaseDir = new URL('../src/content/use-cases/', import.meta.url);
const useCases = [];
for (const f of (await readdir(useCaseDir)).filter((f) => f.endsWith('.mdx'))) {
  const front = (await readFile(new URL(f, useCaseDir), 'utf8')).split('---')[1] ?? '';
  const field = (k) => front.match(new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1] ?? '';
  useCases.push({ slug: field('slug') || f.replace(/\.mdx$/, ''), title: field('title'), description: field('description') });
}

const dir = new URL('../src/content/sightings/', import.meta.url);
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
  const url = new URL(file, dir);
  const d = JSON.parse(await readFile(url, 'utf8'));
  if (d.draft) continue;
  const text = fullText.get(file.replace(/\.json$/, '')) ?? d.text;
  const did = [];
  if (!d.title && (force || !d.headline)) {
    const h = await pickHeadline(text);
    if (h && h.confidence >= 0.4) {
      d.headline = h.headline.slice(0, 160);
      did.push(`headline (${h.confidence.toFixed(2)})`);
    }
  }
  if (force || !d.category) {
    const c = await classifyPost(text, useCases);
    if (c?.category) {
      d.category = c.category;
      did.push(`category ${c.category}`);
    }
    if (c && !d.useCases?.length && c.useCases.length) d.useCases = c.useCases;
  }
  if (did.length) await writeFile(url, `${JSON.stringify(d, null, 2)}\n`);
  console.log(`${file.padEnd(30)} ${did.join(', ') || 'unchanged'}`);
}
