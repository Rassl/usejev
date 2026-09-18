import { getCollection } from 'astro:content';
import { SITE, PRICE_PER_MTOK } from '../lib/site';

export async function GET() {
  const entries = (await getCollection('use-cases')).sort((a, b) => a.id.localeCompare(b.id));
  const abs = (path: string) => new URL(path, SITE.url).href;
  const data = {
    site: SITE.url,
    disclaimer: SITE.disclaimer,
    officialDocs: 'https://docs.typesafe.ai',
    pricePerMillionInputTokensUsd: PRICE_PER_MTOK,
    count: entries.length,
    useCases: entries.map((e) => ({
      slug: e.id,
      title: e.data.title,
      description: e.data.description,
      category: e.data.category,
      industry: e.data.industry,
      primitives: e.data.primitives,
      difficulty: e.data.difficulty,
      tokensPerItem: e.data.tokensPerItem,
      related: e.data.related,
      publishedAt: e.data.publishedAt.toISOString().slice(0, 10),
      updatedAt: e.data.updatedAt.toISOString().slice(0, 10),
      url: abs(`/use-cases/${e.id}/`),
      markdown: abs(`/use-cases/${e.id}.md`),
    })),
  };
  return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
