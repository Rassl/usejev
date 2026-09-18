import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { SITE } from '../lib/site';

export async function GET(context: APIContext) {
  const entries = (await getCollection('use-cases')).sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    trailingSlash: true,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.publishedAt,
      link: `/use-cases/${entry.id}/`,
      categories: [entry.data.category, ...entry.data.primitives],
    })),
    customData: '<language>en-us</language>',
  });
}
