import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { useCaseMarkdown, markdownResponse } from '../../lib/markdown';

export async function getStaticPaths() {
  const entries = await getCollection('use-cases');
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { entry, entries } }));
}

export function GET({ props }: APIContext) {
  return markdownResponse(useCaseMarkdown(props.entry, props.entries));
}
