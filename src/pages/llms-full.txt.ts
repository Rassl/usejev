import { getCollection } from 'astro:content';
import { SITE } from '../lib/site';
import { loadGuides, guideMarkdown, useCaseMarkdown } from '../lib/markdown';

export async function GET() {
  const entries = (await getCollection('use-cases')).sort((a, b) => a.id.localeCompare(b.id));
  const parts = [
    `# usejev.dev: full content\n\n> ${SITE.description} ${SITE.disclaimer} Authoritative API reference: https://docs.typesafe.ai`,
    ...loadGuides().map(guideMarkdown),
    ...entries.map((e) => useCaseMarkdown(e, entries)),
  ];
  return new Response(parts.join('\n\n---\n\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
