// Resolves a post URL into a stable id, a source, and (for X) verified author and text.

export type Source = 'x' | 'hackernews' | 'reddit' | 'github' | 'blog' | 'other';

export interface Resolved {
  source: Source;
  id: string; // file name without extension
  url: string; // normalized
  author?: { name: string; handle?: string; url?: string };
  text?: string;
  postedAt?: Date; // exact for X, where the id encodes the creation time
  verified: boolean; // true when the post was confirmed to exist at its origin
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&mdash;/g, '—');
}

export function identify(raw: string): Omit<Resolved, 'verified'> {
  const u = new URL(raw);
  const host = u.hostname.replace(/^(www|mobile)\./, '');
  const x = host === 'x.com' || host === 'twitter.com' ? u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/) : null;
  if (x) {
    // X ids are snowflakes: the top bits are milliseconds since 2010-11-04T01:42:54.657Z.
    const postedAt = new Date(Number((BigInt(x[2]!) >> 22n) + 1288834974657n));
    return { source: 'x', id: `x-${x[2]}`, url: `https://x.com/${x[1]}/status/${x[2]}`, postedAt };
  }
  if (host === 'news.ycombinator.com' && u.searchParams.get('id')) {
    const id = u.searchParams.get('id')!.replace(/\D/g, '');
    return { source: 'hackernews', id: `hn-${id}`, url: `https://news.ycombinator.com/item?id=${id}` };
  }
  const clean = `https://${u.hostname}${u.pathname.replace(/\/$/, '')}`;
  if (host.endsWith('reddit.com')) return { source: 'reddit', id: `reddit-${slug(u.pathname)}`, url: clean };
  if (host === 'github.com') return { source: 'github', id: `gh-${slug(u.pathname)}`, url: clean };
  return { source: 'other', id: `web-${slug(host + u.pathname)}`, url: clean };
}

// X's public oEmbed endpoint needs no key and only answers for posts that exist and are public.
async function verifyX(url: string): Promise<Pick<Resolved, 'author' | 'text'> | null> {
  const res = await fetch(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { author_name?: string; author_url?: string; html?: string };
  const paragraph = data.html?.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
  const LINK = /(https:\/\/t\.co\/\S+|pic\.twitter\.com\/\S+)/g;
  let text = decodeEntities(paragraph.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim();
  // Links at the very end are attachments; drop them. Links inside a sentence become "[link]"
  // so the quote still reads correctly.
  while (/(https:\/\/t\.co\/\S+|pic\.twitter\.com\/\S+)$/.test(text)) text = text.replace(/\s*(https:\/\/t\.co\/\S+|pic\.twitter\.com\/\S+)$/, '');
  text = text.replace(LINK, '[link]').replace(/\n{3,}/g, '\n\n').trim();
  const handle = data.author_url?.replace(/\/$/, '').split('/').pop();
  if (!data.author_name) return null;
  return {
    author: { name: data.author_name, handle, url: handle ? `https://x.com/${handle}` : undefined },
    text: text.slice(0, 600) || undefined,
  };
}

export async function resolve(raw: string): Promise<Resolved> {
  const base = identify(raw);
  if (base.source === 'x') {
    const x = await verifyX(base.url).catch(() => null);
    return x ? { ...base, ...x, verified: true } : { ...base, verified: false };
  }
  const res = await fetch(base.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) }).catch(() => null);
  return { ...base, verified: Boolean(res && res.ok) };
}
