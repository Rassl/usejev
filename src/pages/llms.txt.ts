import { getCollection } from 'astro:content';
import { SITE, DOCS } from '../lib/site';
import { loadGuides } from '../lib/markdown';

export async function GET() {
  const entries = (await getCollection('use-cases')).sort((a, b) => a.data.title.localeCompare(b.data.title));
  const abs = (path: string) => new URL(path, SITE.url).href;
  const lines = [
    '# usejev.dev: Jev Use Cases (Unofficial)',
    '',
    `> ${SITE.description} ${SITE.disclaimer}`,
    '',
    'Jev is a "System One" model from TypeSafe AI. You send a `state` plus typed questions (Choice, Score, Noul) and get typed answers with probabilities and confidence instead of generated text. Every page below is available as plain Markdown. Code samples use only API surface documented at https://docs.typesafe.ai. Example responses are illustrative, not measured output.',
    '',
    '## Use cases',
    '',
    ...entries.map((e) => `- [${e.data.title}](${abs(`/use-cases/${e.id}.md`)}): ${e.data.description} (${e.data.primitives.join(' + ')})`),
    '',
    '## Guides',
    '',
    ...loadGuides().map((g) => `- [${g.title}](${abs(`/guides/${g.slug}.md`)}): ${g.description}`),
    '',
    '## Data',
    '',
    `- [All content in one file](${abs('/llms-full.txt')}): every use case and guide concatenated as Markdown`,
    `- [Use-case index as JSON](${abs('/use-cases.json')}): slugs, categories, primitives, token assumptions, URLs`,
    `- [Source repository](${SITE.repo}): MDX sources, verified API notes in docs/jev-api-notes.md`,
    '',
    '## Official sources',
    '',
    `- [TypeSafe documentation index](${DOCS.home}/llms.txt): authoritative API reference; prefer it over this site when they disagree`,
    `- [HTTP API reference](${DOCS.api}.md)`,
    `- [Known limitations of jev-1.13](${DOCS.jaggedness}.md)`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
