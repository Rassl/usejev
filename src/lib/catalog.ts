// One list of "use cases": the guides we wrote (with code) and the real projects people posted.
// Both become the same card shape so a visitor scans one page, not two sections.
import { getCollection, type CollectionEntry } from 'astro:content';
import { byRelevance, getSightings, SOURCE_LABEL, type Sighting } from './sightings';

export interface CatalogItem {
  kind: 'guide' | 'project';
  id: string;
  href: string;
  external: boolean;
  headline: string;
  blurb: string;
  topic: string;
  label: string; // the small line above the headline: who or what this is
  media?: { type: 'image' | 'video'; thumbnail: string; alt: string };
  primitives: string[];
  date: Date;
  score: number; // projects: Jev's relevance; guides: -1
}

// One topic list for both kinds. Guides were filed under broader business categories; each maps
// to the topic a reader would look under.
const GUIDE_TOPIC: Record<CollectionEntry<'use-cases'>['data']['category'], string> = {
  'Customer operations': 'Customer support',
  'Trust and safety': 'Moderation and safety',
  'Documents and finance': 'Documents and finance',
  'Security and observability': 'Security and logs',
  'Sales and marketing': 'Sales and marketing',
  'AI engineering': 'Agents',
  'Search and commerce': 'Search and data',
};

const clip = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.!?-]+$/, '')}…`;
};

// A post has no headline of its own, and nothing here writes text: the author's first sentence
// becomes the headline and the rest becomes the blurb.
export function splitPost(text: string): { headline: string; blurb: string } {
  const flat = text.replace(/\[link\]/g, '').replace(/\s*\n+\s*/g, ' \n ').trim();
  const end = flat.search(/(?<=[.!?…])\s|\s\n\s/);
  const first = (end > 0 && end <= 110 ? flat.slice(0, end) : flat).replace(/\n/g, ' ').trim();
  const headline = clip(first.replace(/[\s:–-]+$/, ''), 84);
  const rest = headline.endsWith('…') ? '' : flat.slice(first.length);
  return { headline, blurb: clip(rest.replace(/\s*\n\s*/g, ' ').trim(), 200) };
}

function fromGuide(e: CollectionEntry<'use-cases'>): CatalogItem {
  return {
    kind: 'guide',
    id: e.id,
    href: `/use-cases/${e.id}/`,
    external: false,
    headline: e.data.title.replace(/ with Jev( Score Questions)?$/, ''),
    blurb: e.data.description,
    topic: GUIDE_TOPIC[e.data.category],
    label: `Guide with code · ${e.data.difficulty}`,
    primitives: e.data.primitives,
    date: e.data.publishedAt,
    score: -1,
  };
}

function fromSighting(s: Sighting): CatalogItem {
  const d = s.data;
  const flat = d.text.replace(/\[link\]/g, '').replace(/\s*\n+\s*/g, ' ').trim();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const words = d.title
    ? { headline: d.title, blurb: d.summary ?? clip(flat, 200) }
    : d.headline
      ? // The rest of the excerpt, without repeating the sentence that became the headline.
        { headline: cap(d.headline), blurb: clip(flat.replace(d.headline, '').replace(/^[\s.…,:;–-]+/, '').trim(), 200) }
      : splitPost(d.text);
  return {
    kind: 'project',
    id: s.id,
    href: d.url,
    external: true,
    ...words,
    topic: d.category ?? 'Other',
    label: `Built by ${d.author.handle ? `@${d.author.handle}` : d.author.name} · on ${SOURCE_LABEL[d.source].name}`,
    media: d.media,
    primitives: d.primitives,
    date: d.postedAt,
    score: d.relevance?.score ?? 0,
  };
}

// Best projects first, with a guide after every third one, so the first screen shows both what
// people built and how to build it.
export async function getCatalog(): Promise<CatalogItem[]> {
  const projects = (await getSightings()).sort(byRelevance).map(fromSighting);
  const guides = (await getCollection('use-cases'))
    .sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime() || a.data.title.localeCompare(b.data.title))
    .map(fromGuide);
  const out: CatalogItem[] = [];
  while (projects.length || guides.length) {
    out.push(...projects.splice(0, 3));
    const g = guides.shift();
    if (g) out.push(g);
  }
  return out;
}

export const topicsOf = (items: CatalogItem[]) => {
  const count = new Map<string, number>();
  for (const i of items) count.set(i.topic, (count.get(i.topic) ?? 0) + 1);
  return [...count.entries()].filter(([t]) => t !== 'Other').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
