import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    author: z.string().default('EVLBYTE'),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.string().default('Ciberseguridad'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
