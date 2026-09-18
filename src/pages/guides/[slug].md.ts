import type { APIContext } from 'astro';
import { loadGuides, guideMarkdown, markdownResponse } from '../../lib/markdown';

export function getStaticPaths() {
  return loadGuides().map((guide) => ({ params: { slug: guide.slug }, props: { guide } }));
}

export function GET({ props }: APIContext) {
  return markdownResponse(guideMarkdown(props.guide));
}
