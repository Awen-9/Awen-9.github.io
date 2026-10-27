import { getPosts, postPath, formatDate, plainText } from '../lib/posts';

// 全站搜索的索引：标题、摘要、分类、标签和去掉 Markdown 记号的正文，第一次打开搜索时才去拉
export async function GET() {
  const posts = await getPosts();
  const index = posts.map((post) => ({
    url: postPath(post),
    title: post.data.title,
    description: post.data.description,
    date: formatDate(post.data.date),
    category: post.data.category,
    tags: post.data.tags,
    body: plainText(post.body),
  }));
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
}
