import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const useCases = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/use-cases' }),
  schema: z.object({
    title: z.string().max(60),
    description: z.string().min(140).max(165),
    // `slug` sets the URL; the glob loader reads it as the entry id.
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    category: z.enum([
      'Customer operations',
      'Trust and safety',
      'Documents and finance',
      'Security and observability',
      'Sales and marketing',
      'AI engineering',
      'Search and commerce',
    ]),
    industry: z.array(z.string()).min(1),
    primitives: z.array(z.enum(['Choice', 'Score', 'Noul'])).min(1),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    // Input tokens per item assumed by the cost estimate section.
    tokensPerItem: z.number().int().positive(),
    related: z.array(z.string()).length(3),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  }),
});

// Posts found in the wild (X, Hacker News, Reddit, GitHub, blogs) showing how people use Jev.
// One JSON file per post in src/content/sightings/. An external tracker can write these files;
// the schema below is the contract. See README "Community sightings".
const sightings = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/sightings' }),
  schema: z.object({
    source: z.enum(['x', 'hackernews', 'reddit', 'github', 'blog', 'other']),
    url: z.url(),
    author: z.object({
      name: z.string(),
      handle: z.string().optional(), // without the leading @
      url: z.url().optional(),
    }),
    postedAt: z.coerce.date(),
    // Short verbatim excerpt of the post. Keep it brief and always link to the original.
    text: z.string().min(1).max(600),
    // Our own neutral one-line description of what they built. No claims we cannot stand behind.
    summary: z.string().max(200).optional(),
    useCases: z.array(z.string()).default([]), // slugs from src/content/use-cases
    primitives: z.array(z.enum(['Choice', 'Score', 'Noul'])).default([]),
    // Drafts render in `npm run dev` only and never reach the production build.
    draft: z.boolean().default(false),
  }),
});

export const collections = { 'use-cases': useCases, sightings };
