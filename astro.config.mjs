// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://awen-9.github.io',
  trailingSlash: 'always',
  // 首页脚本里打包了 three.js，压缩后约 540 kB（gzip 约 135 kB），只在首页加载
  vite: { build: { chunkSizeWarningLimit: 600 } },
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
