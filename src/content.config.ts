import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  // id 直接取文件名，保留大小写和中文标点，URL 由文件名决定
  loader: glob({ pattern: '**/*.md', base: './src/content/posts', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: z.string().default('随笔'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // 可选：同名 series 的文章在阅读页串成一个系列，按日期排序
    series: z.string().optional(),
  }),
});

export const collections = { posts };
