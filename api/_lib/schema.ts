// Request validation for the posting API. Mirrors the `sightings` schema in
// src/content.config.ts, which stays the final gate: a file that passes here but fails there
// breaks the build instead of publishing.
import { z } from 'zod';

export const USE_CASE_SLUGS = [
  'support-ticket-routing',
  'email-triage-priority-scoring',
  'content-moderation-prompt-injection-screening',
  'invoice-document-classification',
  'security-alert-triage',
  'lead-scoring',
  'news-relevance-filtering',
  'llm-output-qa-agent-run-review',
  'intent-routing-chatbots-agents',
  'search-result-reranking',
  'log-anomaly-classification',
  'hierarchical-product-categorization',
] as const;

const httpsUrl = z.url({ protocol: /^https$/ });

export const sightingInput = z.strictObject({
  source: z.enum(['x', 'hackernews', 'reddit', 'github', 'blog', 'other']).optional(), // inferred from url
  url: httpsUrl,
  author: z
    .strictObject({ name: z.string().min(1).max(100), handle: z.string().max(50).optional(), url: httpsUrl.optional() })
    .optional(), // filled from X oEmbed when omitted
  postedAt: z.coerce.date().optional(),
  title: z.string().min(1).max(70).optional(),
  category: z.string().min(1).max(40).optional(),
  media: z
    .strictObject({ type: z.enum(['image', 'video']), thumbnail: httpsUrl, alt: z.string().min(1).max(200) })
    .optional(),
  text: z.string().min(1).max(600).optional(), // filled from X oEmbed when omitted
  summary: z.string().max(200).optional(),
  useCases: z.array(z.string()).max(4).default([]),
  primitives: z.array(z.enum(['Choice', 'Score', 'Noul'])).default([]),
  draft: z.boolean().default(false),
  // A ranking the caller already made. The server only ever sees the card excerpt (X cuts it at
  // about 280 characters), while a tracker with X API access ranks the whole post, so its score
  // is the better one. Token holders only: the public form cannot send this.
  relevance: z
    .strictObject({
      score: z.number().min(0).max(1),
      verdict: z.enum(['publish', 'review', 'reject']),
      kind: z.string().min(1).max(40),
      model: z.string().min(1).max(60),
      checkedAt: z.iso.datetime(),
    })
    .optional(),
  // "commit" publishes on the next deploy; "pr" opens a pull request for review; "auto" lets the
  // Jev relevance ranking decide: publish, pull request, or refuse (needs TYPESAFE_API_KEY).
  mode: z.enum(['commit', 'pr', 'auto']).default('commit'),
});
export type SightingInput = z.infer<typeof sightingInput>;

export const publicSubmission = z.strictObject({
  url: httpsUrl,
  note: z.string().max(500).optional(),
  submitter: z.string().max(100).optional(),
  // Anti-spam: `website` is a honeypot that must stay empty; `elapsedMs` is time spent on the form.
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
});
