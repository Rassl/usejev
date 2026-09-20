import { getCollection, type CollectionEntry } from 'astro:content';

export type Sighting = CollectionEntry<'sightings'>;

// Published sightings, newest first. Drafts are visible in dev only.
export async function getSightings(): Promise<Sighting[]> {
  const all = await getCollection('sightings', (s) => import.meta.env.DEV || !s.data.draft);
  return all.sort((a, b) => b.data.postedAt.getTime() - a.data.postedAt.getTime());
}

// Most relevant first, by the score Jev gave the post (see docs/relevance-ranking.md). Posts that
// were never ranked go last, and ties fall back to newest first.
export const byRelevance = (a: Sighting, b: Sighting) =>
  (b.data.relevance?.score ?? -1) - (a.data.relevance?.score ?? -1) || b.data.postedAt.getTime() - a.data.postedAt.getTime();

export const SOURCE_LABEL: Record<Sighting['data']['source'], { short: string; name: string }> = {
  x: { short: 'X', name: 'X' },
  hackernews: { short: 'HN', name: 'Hacker News' },
  reddit: { short: 'r/', name: 'Reddit' },
  github: { short: 'GH', name: 'GitHub' },
  blog: { short: 'Blog', name: 'a blog post' },
  other: { short: 'Web', name: 'the web' },
};
