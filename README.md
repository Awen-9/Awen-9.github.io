# Awen's Blog

个人博客 https://awen-9.github.io 的源码，Astro 构建，GitHub Actions 发布到 GitHub Pages。

## 本地运行

需要 Node 22.23 或更新的版本。Windows 和 macOS 上怎么装环境、要注意什么，见 [docs/setup.md](docs/setup.md)。

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # 输出到 dist/
npm run preview   # 预览构建结果
npm run check     # 类型检查，GitHub 上发布前也会跑
```

## 写文章

在 `src/content/posts/` 下新建 `YYYY-MM-DD-标题.md`，文件名决定文章地址，比如 `2026-10-27-hello.md` 对应 `/2026/10/27/hello/`。

```yaml
---
title: "标题"
description: "一句话摘要，显示在列表和搜索结果里"
date: 2026-10-27T20:00:00+08:00
updated: 2026-10-28T10:00:00+08:00   # 可选
category: "博客搭建"
tags: ["Astro", "GitHub Pages"]
series: "系列名"                        # 可选，同名的文章串成系列
draft: true                             # 可选，草稿不会发布
---
```

完整步骤（图片、预览、发布、修改）和一篇年终总结的例子见 [docs/writing.md](docs/writing.md)。

## 改个人信息

标题、简介、技术栈、地球上的城市坐标和时区、giscus 评论都在 `src/config.ts`。giscus 的 `repoId` 和 `categoryId` 留空时不显示评论，也不加载外部脚本。

## 发布

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并发布。仓库的 Settings → Pages → Source 需要选 GitHub Actions。

`package-lock.json` 里记录的是官方 npm 源地址，本地和 GitHub Actions 上都能直接 `npm ci`；本机如果配了内网源，用 `npm ci --registry=https://registry.npmjs.org/` 强制走官方源。

## 目录

```
src/config.ts          个人信息
src/content/posts/     文章
src/pages/             页面路由，index.astro 是首页
src/components/        文章列表、分类分组、关于、搜索框
src/layouts/           Base 是 HTML 外壳，Page 是子页面外壳
src/scripts/           地球、首页抽屉和时钟、全站搜索、阅读页（post.ts）
src/styles/            base.css 基础排版，theme.css 配色和共用样式，home.css 首页，page.css 子页面
public/textures/       地球贴图，来源见 ATTRIBUTION.md
docs/                  启动手册 setup.md，写文章手册 writing.md
```
