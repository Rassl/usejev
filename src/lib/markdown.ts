// Plain-Markdown exports of the site's content for LLMs, agents, and scrapers.
import type { CollectionEntry } from 'astro:content';
import { SITE, PRICE_PER_MTOK, costFor } from './site';
import { costTableMarkdown, ITEMS, IN_TOK, LLM_PROMPT_OVERHEAD, OUT_TOK } from './compare';

const abs = (path: string) => new URL(path, SITE.url).href;

// Make root-relative links absolute so the Markdown works outside the site.
const absolutize = (md: string) => md.replace(/\]\((\/[^)]*)\)/g, (_, path) => `](${abs(path)})`);

function costTable(tokens: number, unit: string): string {
  const rows = [1_000, 100_000, 1_000_000].map(
    (n) => `| ${n.toLocaleString('en-US')} ${unit} | ${(n * tokens).toLocaleString('en-US')} | ${costFor(tokens, n)} |`,
  );
  return [
    `Assumes ${tokens.toLocaleString('en-US')} input tokens per request at $${PRICE_PER_MTOK} per million input tokens (output is free).`,
    '',
    '| Volume | Input tokens | Estimated cost |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function useCaseMarkdown(entry: CollectionEntry<'use-cases'>, all: CollectionEntry<'use-cases'>[]): string {
  const d = entry.data;
  const body = (entry.body ?? '')
    .replace(/<CostTable[^>]*unit="([^"]*)"[^>]*\/>/g, (_, unit) => costTable(d.tokensPerItem, unit))
    .replace(/<CostTable[^>]*\/>/g, () => costTable(d.tokensPerItem, 'items'))
    .replace(/<Fragment slot="python">/g, '**Python**')
    .replace(/<Fragment slot="ts">/g, '**TypeScript**')
    .replace(/^<\/?(CodeTabs|Fragment)[^>]*>\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const related = d.related
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is CollectionEntry<'use-cases'> => Boolean(e))
    .map((e) => `- [${e.data.title}](${abs(`/use-cases/${e.id}/`)})`);
  return [
    `# ${d.title}`,
    '',
    `> ${d.description}`,
    '',
    `- Canonical URL: ${abs(`/use-cases/${entry.id}/`)}`,
    `- Category: ${d.category}`,
    `- Industry: ${d.industry.join(', ')}`,
    `- Jev primitives: ${d.primitives.join(', ')}`,
    `- Difficulty: ${d.difficulty}`,
    `- Updated: ${d.updatedAt.toISOString().slice(0, 10)}`,
    `- ${SITE.disclaimer} Official docs: https://docs.typesafe.ai`,
    '',
    absolutize(body),
    '',
    '## Related use cases',
    '',
    ...related,
    '',
  ].join('\n');
}

export interface GuideSource {
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  faqs: { q: string; a: string }[];
  body: string;
}

// Guides are MDX pages; parse the raw file without a YAML dependency.
export function parseGuide(slug: string, raw: string): GuideSource {
  const [, front = '', rest = ''] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
  const field = (name: string) => front.match(new RegExp(`^${name}:\\s*"?(.*?)"?\\s*$`, 'm'))?.[1] ?? '';
  const faqs = [...front.matchAll(/^\s*- q:\s*(.*)\n\s*a:\s*(.*)$/gm)].map((m) => ({ q: m[1]!.trim(), a: m[2]!.trim() }));
  const body = rest
    .replace(/^import .* from '\.\.\/.*$/gm, '')
    .replace(/<div class="table-scroll">[\s\S]*?<\/div>/g, costTableMarkdown())
    .replace(/^<\/?div[^>]*>\s*$/gm, '')
    .replace(/\{ITEMS\.toLocaleString\('en-US'\)\}/g, ITEMS.toLocaleString('en-US'))
    .replace(/\{IN_TOK\}/g, String(IN_TOK))
    .replace(/\{LLM_PROMPT_OVERHEAD\}/g, String(LLM_PROMPT_OVERHEAD))
    .replace(/\{OUT_TOK\}/g, String(OUT_TOK))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { slug, title: field('title'), description: field('description'), updatedAt: field('updatedAt'), faqs, body };
}

export function guideMarkdown(g: GuideSource): string {
  const faq = g.faqs.length
    ? ['', '## Frequently asked questions', '', ...g.faqs.flatMap((f) => [`### ${f.q}`, '', f.a, ''])]
    : [];
  return [
    `# ${g.title}`,
    '',
    `> ${g.description}`,
    '',
    `- Canonical URL: ${abs(`/guides/${g.slug}/`)}`,
    `- Updated: ${g.updatedAt}`,
    `- ${SITE.disclaimer} Official docs: https://docs.typesafe.ai`,
    '',
    absolutize(g.body),
    ...faq,
    '',
  ].join('\n');
}

export function loadGuides(): GuideSource[] {
  const files = import.meta.glob<string>('../pages/guides/*.mdx', { query: '?raw', import: 'default', eager: true });
  return Object.entries(files)
    .map(([path, raw]) => parseGuide(path.split('/').pop()!.replace(/\.mdx$/, ''), raw))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export const markdownResponse = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
