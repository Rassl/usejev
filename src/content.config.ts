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

export const collections = { 'use-cases': useCases };
