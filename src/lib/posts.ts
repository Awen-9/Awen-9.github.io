import { getCollection, type CollectionEntry } from 'astro:content';
import { HOME } from '../config';

export type Post = CollectionEntry<'posts'>;

// 文件名形如 2026-07-05-Maven-依赖冲突排查.md，对应 URL /2026/07/05/Maven-依赖冲突排查/
export function postPath(post: Post) {
  const [, y, m, d, slug] = post.id.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/) ?? [];
  return `/${y}/${m}/${d}/${slug}/`;
}

export const catHref = (name: string) => `/categories/${name}/`;
export const tagHref = (name: string) => `/tags/${name}/`;

export async function getPosts() {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function groupByCategory(posts: Post[]) {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const list = groups.get(post.data.category) ?? [];
    list.push(post);
    groups.set(post.data.category, list);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

/** 标签按文章数从多到少，数量相同按名字 */
export function tagCounts(posts: Post[]) {
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
}

const dateFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: HOME.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const formatDate = (date: Date) => dateFmt.format(date).replaceAll('/', '.');

// 中文按字数，英文单词按 1 个字估算，300 字/分钟
export function readingMinutes(body = '') {
  const text = body.replace(/```[\s\S]*?```/g, '');
  const cjk = text.match(/[一-鿿]/g)?.length ?? 0;
  const words = text.replace(/[一-鿿]/g, ' ').match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return Math.max(1, Math.round((cjk + words) / 300));
}

/** 去掉 Markdown 记号后的小写正文，给全站搜索用 */
export const plainText = (body = '') =>
  body
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
