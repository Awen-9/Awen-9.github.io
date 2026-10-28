// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://awen-9.github.io',
  trailingSlash: 'always',
  // 开发时左下角那条 Astro 工具栏不要：它会去 astro.build 拉「精选集成」广告，网络不好时还渲染出一堆 undefined
  devToolbar: { enabled: false },
  // 首页脚本里打包了 three.js，压缩后约 540 kB（gzip 约 135 kB），只在首页加载
  vite: { build: { chunkSizeWarningLimit: 600 } },
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
