// 站点的全部个人信息都在这里，改完重新构建即可
export const SITE = {
  title: "Awen's Blog",
  author: 'Awen',
  description: '后端开发笔记：Java、Spring、JVM、中间件，以及西安的日常。',
  github: 'https://github.com/Awen-9',
  githubName: 'Awen-9',
  /** 首页左上角的大字，用 \n 换行 */
  brand: "Awen's\nBlog",
  /** 首页左上角那一格的路径标签 */
  handle: '~/awen',
};

// 首页技术栈格子和关于页共用
export const PROFILE = {
  role: '后端开发工程师，在西安，主要写 Java',
  focus: '后端开发、分布式、高并发',
  stack: ['Spring', 'Spring Boot', 'MyBatis', 'MySQL', 'Redis', 'Kafka'],
  learning: 'Spring 源码、JVM、中间件原理',
  intro: ['你好，我是 Awen。一名后端开发工程师，目前在西安，主要写 Java。', '这里记录后端技术上的学习笔记、源码阅读心得，以及一些生活随想。'],
};

// 地球上的橙色光点、双击回正的位置，以及首页时钟用的时区
export const HOME = {
  city: '西安',
  lon: 108.94,
  lat: 34.34,
  timeZone: 'Asia/Shanghai',
};

// giscus 评论：在 https://giscus.app 生成配置后填上 repoId 和 categoryId 才会显示，留空时不加载任何外部脚本
export const GISCUS = {
  repo: 'Awen-9/Awen-9.github.io',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};
