import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Documentation mirrored from kelvincushman/orphus by `npm run sync`.
// The repo is the source of truth; nothing in src/content/docs is hand-edited.
const docs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    group: z.string().default('Reference'),
    order: z.number().default(999),
    sourcePath: z.string(),
    editUrl: z.string().url(),
  }),
});

export const collections = { docs };
