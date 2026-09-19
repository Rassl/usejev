// Rank posts with the same Jev questions the API uses. Needs TYPESAFE_API_KEY (env or .env.local)
// and Node 22.18+ (imports the TypeScript module directly).
//   npm run rank -- "some post text"         rank one text
//   npm run rank -- https://x.com/a/status/1  rank an X post (text fetched through oEmbed)
//   npm run rank:eval                         run the calibration set and print a confusion table
import { readFile, readdir } from 'node:fs/promises';
import { rankPost, THRESHOLDS, WEIGHTS } from '../api/_lib/relevance.ts';
import { resolve } from '../api/_lib/verify.ts';

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
process.env.TYPESAFE_API_KEY ??= env.match(/^TYPESAFE_API_KEY=(.+)$/m)?.[1] ?? '';
if (!process.env.TYPESAFE_API_KEY) {
  console.error('TYPESAFE_API_KEY not found. Add it to .env.local (TYPESAFE_API_KEY=...) or the environment.');
  process.exit(1);
}

const line = (label, r) =>
  `${(r?.verdict ?? 'ERROR').padEnd(8)} ${(r?.score ?? 0).toFixed(2)}  about ${r?.signals.aboutJevModel ?? '-'}  usage ${r?.signals.usageDepth ?? '-'}  spam ${r?.signals.isSpam ?? '-'}  ${(r?.kind ?? '').padEnd(24)} ${label}`;

const arg = process.argv.slice(2).filter((a) => a !== '--eval').join(' ').trim();
if (!process.argv.includes('--eval')) {
  if (!arg) {
    console.error('Usage: npm run rank -- "<text>" | <post url>     or: npm run rank:eval');
    process.exit(1);
  }
  let post = { text: arg, source: 'other' };
  if (/^https:\/\//.test(arg)) {
    const found = await resolve(arg);
    if (!found.text) {
      console.error('Could not fetch the text of that post. Pass the text itself instead.');
      process.exit(1);
    }
    post = { text: found.text, source: found.source, authorName: found.author?.name, authorHandle: found.author?.handle };
  }
  const r = await rankPost(post);
  console.log(r ? JSON.stringify(r, null, 2) : 'Jev could not be reached.');
  process.exit(r ? 0 : 1);
}

// Calibration: real published posts should not be rejected; synthetic negatives should be.
const dir = new URL('../src/content/sightings/', import.meta.url);
const positives = [];
for (const file of await readdir(dir)) {
  const d = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
  if (!d.draft) positives.push({ expect: 'publish', label: `${file} (real)`, post: { text: d.text, source: d.source, authorName: d.author.name, authorHandle: d.author.handle } });
}
const fixtures = JSON.parse(await readFile(new URL('./rank-fixtures.json', import.meta.url), 'utf8'));
const set = [...positives, ...fixtures.examples.map((e) => ({ expect: e.expect, label: `${e.label} (synthetic)`, post: { text: e.text, source: 'x' } }))];

console.log(`weights ${JSON.stringify(WEIGHTS)}\nthresholds ${JSON.stringify(THRESHOLDS)}\n`);
let exact = 0, harmful = 0, tokens = 0;
for (const item of set) {
  const r = await rankPost(item.post);
  tokens += r?.inputTokens ?? 0;
  const got = r?.verdict ?? 'ERROR';
  if (got === item.expect) exact++;
  // The two errors that matter: junk published without review, or a real post thrown away.
  const bad = (item.expect === 'reject' && got === 'publish') || (item.expect === 'publish' && got === 'reject');
  if (bad) harmful++;
  console.log(`${got === item.expect ? 'ok  ' : bad ? 'BAD ' : 'soft'} want ${item.expect.padEnd(8)} got ${line(item.label, r)}`);
}
console.log(`\n${exact}/${set.length} exact, ${harmful} harmful errors, ${tokens} input tokens (~$${((tokens * 0.042) / 1e6).toFixed(6)}).`);
console.log('"soft" = off by one band (for example publish vs review), which only costs a manual look.');
process.exit(harmful ? 1 : 0);
