// Publish a community post from the command line through the site's own API.
//   npm run post -- <url> [--title "..."] [--category "..."] [--summary "..."]
//                        [--use-case slug]... [--primitive Choice|Score|Noul]...
//                        [--image <thumbnail url> --alt "..."] [--video] [--draft] [--pr]
// Reads POSTS_API_TOKEN from .env.local. For X posts only the URL is required.
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const url = args.find((a) => /^https:\/\//.test(a));
if (!url) {
  console.error('Usage: npm run post -- <url> [--title "..."] [--category "..."] [--summary "..."] [--use-case slug] [--draft] [--pr]');
  process.exit(1);
}
const one = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const many = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
const token = process.env.POSTS_API_TOKEN ?? env.match(/^POSTS_API_TOKEN=(.+)$/m)?.[1];
if (!token) {
  console.error('POSTS_API_TOKEN not found in the environment or .env.local');
  process.exit(1);
}

const body = {
  url,
  title: one('--title'),
  category: one('--category'),
  summary: one('--summary'),
  useCases: many('--use-case'),
  primitives: many('--primitive'),
  media: one('--image') ? { type: args.includes('--video') ? 'video' : 'image', thumbnail: one('--image'), alt: one('--alt') ?? 'Preview of the post' } : undefined,
  draft: args.includes('--draft') || undefined,
  mode: args.includes('--pr') ? 'pr' : undefined,
};

const res = await fetch('https://usejev.dev/api/posts/', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Failed (${res.status}): ${out.error ?? 'unknown error'}`, out.details ? JSON.stringify(out.details) : '');
  process.exit(1);
}
console.log(`${out.mode === 'pr' ? 'Pull request opened' : 'Published'}: ${out.id}`);
console.log(`  by ${out.entry.author.name}: "${out.entry.text.slice(0, 80).replace(/\n/g, ' ')}…"`);
console.log(`  ${out.pullRequest ?? out.file}`);
if (out.mode !== 'pr') console.log('  Live at https://usejev.dev/use-cases/ in about a minute.');
