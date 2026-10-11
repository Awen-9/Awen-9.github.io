// ============================================================
// awen 主题 · 页面交互
//
// 这里管的是「平板里显示的那一页」：正文目录、代码块、标题锚点、
// 返回顶部、阅读进度、页脚统计、文章阅读次数……
// 那台平板本身（锁屏 / 主屏 / 桌面道具 / 地球 / 系统浮层）在 ios.js
// 那一套里（ios-core / ios-globe / ios-desk / ios）。
//
// 两边只有一处搭界：音乐播放器。它被提成全局单例放在本文件（见
// initMusic 与 window.MUSIC）—— 因为无刷翻页换掉 <body> 时，它必须
// 活下来，否则切页那一秒音乐就断了。
// ============================================================
document.addEventListener('DOMContentLoaded', function () { awenPageInit(); });

// ------------------------------------------------------------
// 一页的初始化。
//
// 注意：这个函数会被调用不止一次 —— 无刷翻页（pjax.js）换完 DOM 之后
// 会再喊一遍。所以这里的规矩是：
//   ① 只干「跟当前 DOM 有关」的事，别在 window 上留摘不掉的监听；
//   ② 播放器单独走全局单例（见 initMusic），重复调用只换壳、不重建音频。
// ------------------------------------------------------------
function awenPageInit() {
  winOffAll();                 // 先摘掉上一页挂在 window 上的监听
  _scrollHostEl = undefined;   // 新的 #ios-screen 是个新节点，缓存的旧引用得丢掉
  initThemeToggle();
  initCodeBlocks();
  initHeadingAnchors();
  initToc();
  initReadProgress();
  initBackToTop();
  initUptime();
  initStatsWidget();
  initRandomPick();
  initKeyboardNav();
  initMusic();
}
window.awenPageInit = awenPageInit;

// ---------- 键盘翻页：← 上一篇 / → 下一篇（仅文章页） ----------
function initKeyboardNav() {
  var nav = document.querySelector('.post-nav');
  if (!nav) return;

  winOn('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    // 焦点在输入控件里时不劫持方向键
    var t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
              t.tagName === 'SELECT' || t.isContentEditable)) return;

    // iOS 外壳的搜索 / 游戏面板开着时不劫持方向键（小游戏要用）
    var search = document.getElementById('ios-search');
    var game = document.getElementById('ios-game');
    if ((search && search.getAttribute('aria-hidden') === 'false') ||
        (game && game.getAttribute('aria-hidden') === 'false')) return;

    var el = nav.querySelector(e.key === 'ArrowLeft' ? '.post-nav-item.prev' : '.post-nav-item.next');
    if (el) el.click();   // click 会被 pjax 接住，走无刷翻页
  });
}

// ---------- Service Worker：只在线上域名注册，本地预览不受影响 ----------
if ('serviceWorker' in navigator && location.hostname === 'awen-9.github.io') {
  navigator.serviceWorker.register('/sw.js').catch(function () { /* 注册失败就当没有 */ });
}

// ---------- 明暗模式切换 ----------
function initThemeToggle() {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function current() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
    localStorage.setItem('theme', next);
  });
}

// ---------- 代码块：语言标签 + 一键复制 ----------
var LANG_MAP = {
  plaintext: '文本', text: '文本', bash: 'Bash', sh: 'Shell', shell: 'Shell',
  zsh: 'Shell', yaml: 'YAML', yml: 'YAML', json: 'JSON', jsonc: 'JSON',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  java: 'Java', xml: 'XML', html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
  sql: 'SQL', python: 'Python', py: 'Python', go: 'Go', rust: 'Rust',
  ini: 'INI', toml: 'TOML', properties: 'Properties', diff: 'Diff',
  markdown: 'Markdown', md: 'Markdown', nginx: 'Nginx', dockerfile: 'Dockerfile',
  ruby: 'Ruby', php: 'PHP', c: 'C', cpp: 'C++', csharp: 'C#',
  kotlin: 'Kotlin', scala: 'Scala', lua: 'Lua', swift: 'Swift'
};

function initCodeBlocks() {
  var candidates = document.querySelectorAll('.post-content .highlight, .post-content pre');
  var blocks = [];

  // 修正：highlight 内部的 pre 不再单独处理，否则会生成第二个复制按钮
  candidates.forEach(function (el) {
    if (el.tagName === 'PRE' && el.closest('.highlight')) return;
    blocks.push(el);
  });

  blocks.forEach(function (block) {
    if (block.classList.contains('code-block')) return;
    block.classList.add('code-block');

    // 语言标签
    var lang = null;
    Array.prototype.forEach.call(block.classList, function (c) {
      if (c === 'highlight' || c === 'code-block' || lang) return;
      lang = c;
    });
    if (lang) {
      var label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = LANG_MAP[lang] || lang;
      block.appendChild(label);
    }

    // 复制按钮
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制代码');

    btn.addEventListener('click', function () {
      var src = block.querySelector('td.code, code, pre');
      var content = src ? src.innerText : block.innerText;
      navigator.clipboard.writeText(content).then(function () {
        btn.textContent = '已复制';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = '复制';
          btn.classList.remove('copied');
        }, 1600);
      });
    });

    block.appendChild(btn);
  });
}

// ---------- 标题锚点（悬浮显示 §） ----------
function initHeadingAnchors() {
  var headings = document.querySelectorAll('.post-content h2, .post-content h3, .post-content h4');

  headings.forEach(function (h) {
    if (!h.id) return;
    var link = document.createElement('a');
    link.className = 'heading-anchor';
    link.href = '#' + h.id;
    link.textContent = '§';
    link.setAttribute('aria-label', '链接到此标题');
    h.appendChild(link);
  });
}

// ---------- 文章目录（标题数 ≥ 3 时才生成） ----------
function initToc() {
  var box = document.getElementById('post-toc');
  var body = document.getElementById('toc-body');
  if (!box || !body) return;

  var content = document.querySelector('.post-content');
  if (!content) return;

  var heads = content.querySelectorAll('h2, h3');
  if (heads.length < 3) return;

  var root = document.createElement('ol');
  root.className = 'toc-list';
  var links = [];

  heads.forEach(function (h) {
    if (!h.id) return;
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent.replace(/§/g, '').trim();

    var li = document.createElement('li');
    li.appendChild(a);

    if (h.tagName === 'H2') {
      root.appendChild(li);
    } else {
      var parentLi = root.lastElementChild;
      if (parentLi) {
        var sub = parentLi.querySelector('.toc-sub');
        if (!sub) {
          sub = document.createElement('ol');
          sub.className = 'toc-sub';
          parentLi.appendChild(sub);
        }
        sub.appendChild(li);
      } else {
        root.appendChild(li);
      }
    }
    links.push({ el: a, target: h });
  });

  if (!root.children.length) return;
  body.appendChild(root);
  box.hidden = false;

  function spy() {
    var host = scrollHost();
    // 130 是"标题算滚过线了"的阈值；在平板里要加上滚动区自身的顶边
    var limit = (host ? host.getBoundingClientRect().top : 0) + 130;
    var idx = -1;
    for (var i = 0; i < links.length; i++) {
      if (links[i].target.getBoundingClientRect().top <= limit) idx = i;
    }
    links.forEach(function (l, i) {
      l.el.classList.toggle('active', i === idx);
    });
  }

  onScroll(spy);
  spy();
}

// ---------- 滚动宿主 ----------
// 桌面端整站在一台 iPad 里，文档是在 #ios-screen 里滚而不是窗口滚。
// 下面所有跟滚动有关的地方都只认"当前真正在滚的那个容器"。
var _scrollHostEl;
function scrollHost() {
  if (_scrollHostEl === undefined) _scrollHostEl = document.getElementById('ios-screen');
  var el = _scrollHostEl;
  return (el && el.scrollHeight > el.clientHeight + 2) ? el : null;
}

// ---------- 挂在 window 上的监听器登记簿 ----------
// 无刷翻页会把这个 init 流程重跑一遍，挂在 window 上的监听不会随 DOM 消失，
// 不摘的话翻十页就叠十份滚动回调（越来越卡）。
var _winHooks = [];
function winOn(type, fn, opts) {
  window.addEventListener(type, fn, opts);
  _winHooks.push([type, fn, opts]);
}
function winOffAll() {
  for (var i = 0; i < _winHooks.length; i++) {
    window.removeEventListener(_winHooks[i][0], _winHooks[i][1], _winHooks[i][2]);
  }
  _winHooks.length = 0;
}

function scrollTopNow() {
  var h = scrollHost();
  return h ? h.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
}

function scrollSpan() {
  var h = scrollHost();
  if (h) return h.scrollHeight - h.clientHeight;
  return document.documentElement.scrollHeight - window.innerHeight;
}

function onScroll(fn) {
  winOn('scroll', fn, { passive: true });
  if (_scrollHostEl === undefined) _scrollHostEl = document.getElementById('ios-screen');
  if (_scrollHostEl) _scrollHostEl.addEventListener('scroll', fn, { passive: true });
}

// ---------- 阅读进度条 ----------
function initReadProgress() {
  var bar = document.getElementById('read-progress-bar');
  if (!bar) return;

  function update() {
    var total = scrollSpan();
    var ratio = total > 0 ? scrollTopNow() / total : 1;
    if (ratio > 1) ratio = 1;
    if (ratio < 0) ratio = 0;
    bar.style.width = ratio * 100 + '%';
  }

  onScroll(update);
  winOn('resize', update);
  update();
}

// ---------- 返回顶部 ----------
function initBackToTop() {
  var btn = document.getElementById('back-to-top');
  if (!btn) return;

  function update() {
    btn.hidden = scrollTopNow() < 400;
  }

  btn.addEventListener('click', function () {
    var h = scrollHost();
    if (h) h.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  onScroll(update);
  update();
}

// ---------- 站点运行时长 ----------
function initUptime() {
  var el = document.getElementById('site-uptime');
  if (!el) return;

  var since = el.getAttribute('data-since');
  if (!since) return;

  var start = new Date(since.replace(/-/g, '/')).getTime();
  if (isNaN(start)) return;

  var days = Math.floor((Date.now() - start) / 86400000) + 1;
  el.textContent = (days > 0 ? days : 1) + ' 天';
}

// ---------- 首页「访问统计」小组件：计数器哑了就退回本站数字 ----------
// 浏览/访客数是 vercount / 不蒜子 这类第三方脚本异步填的，
// 本地预览、接口抽风或被浏览器拦掉时它会一直停在模板里的占位符「—」，
// 首页上就成了「— 次浏览 / — 位访客」，看着像坏了。
// 给 6 秒宽限，还没填上就整套换成站点自己一定有的数字（文章 / 标签），
// 并把小组件的标题从「访问统计」改成「本站数据」—— 数字永远是真的。
function initStatsWidget() {
  var box = document.getElementById('widget-stats');
  if (!box) return;

  var live = box.querySelectorAll('[data-stats="live"]');
  var local = box.querySelectorAll('[data-stats="local"]');
  if (!live.length || !local.length) return;

  var label = document.getElementById('stats-label');

  function answered() {
    for (var i = 0; i < live.length; i++) {
      var b = live[i].querySelector('b');
      var txt = (b ? b.textContent : '').trim();
      if (!txt || txt === '—') return false;
    }
    return true;
  }

  setTimeout(function () {
    if (answered()) return;               // 计数器答了，真实数据留着
    for (var i = 0; i < live.length; i++) live[i].hidden = true;
    for (var j = 0; j < local.length; j++) local[j].hidden = false;
    if (label) label.textContent = '本站数据';
  }, 6000);
}

// ---------- 首页「随便看看」：从文章池里随机挑一篇 ----------
// 路径池是构建期注入在 #widget-stats 的 data-pool 里的（纯路径数组）。
// 只在 click 时改 href：第一次渲染指向第一篇只是兜底，真正点下去的
// 永远是「点这一下」随机出来的那篇；连着点两次会去两篇不同的文章。
// 改完就撒手让默认行为走 —— pjax 会拦下这次导航，走无刷翻页。
function initRandomPick() {
  var btn = document.getElementById('w-random');
  if (!btn) return;
  var pool = (btn.closest('.widget').getAttribute('data-pool') || '')
    .split('|').filter(function (s) { return s; });
  if (!pool.length) { btn.hidden = true; return; }
  btn.addEventListener('click', function () {
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) btn.href = pick;
  });
}

// ---------- 音乐播放器 ----------
// 没引第三方 UI 库：只从 Meting 接口取曲目数据（名称/歌手/音频/封面/歌词），
// 界面是自己写的——封面唱片 + 胶囊条 + 毛玻璃面板。
var MUSIC_STATE_KEY = 'awen-music-state';
var MUSIC_VOLUME_KEY = 'awen-music-volume';

var MP_ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L19 12z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 5h2.7v14H8.4zM12.9 5h2.7v14h-2.7z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.5v13"/><path d="M18.5 6.3v11.4L9.7 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5.5v13"/><path d="M5.5 6.3v11.4L14.3 12z"/></svg>',
  loop: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 4.5L19 7l-2.5 2.5"/><path d="M19 7H8.5A4 4 0 004.5 11v1"/><path d="M7.5 19.5L5 17l2.5-2.5"/><path d="M5 17h10.5a4 4 0 004-4v-1"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3L11 6v12l-4-3.5H4z"/><path d="M15 9.6a3.4 3.4 0 010 4.8"/><path d="M17.6 7a7 7 0 010 10"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3L11 6v12l-4-3.5H4z"/><path d="M15.5 10l4 4M19.5 10l-4 4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14.5l6-6 6 6"/></svg>'
};

// 播放器起不来时给 <html> 挂个标记：首页主屏据此把底部留给音乐的那块留白收掉，
// 免得到处空一大截、看着像没加载完
function markNoMusic() {
  document.documentElement.classList.add('awen-no-music');
}

// 封面的兜底地址：Meting 返回的 pic 走的是「谁答的就在谁身上」
// （injiah 答的 JSON 就给 injiah 的 pic 地址），而镜像经常是
// **JSON 通了、图片超时** —— 于是每个页面都挂着一个破图图标。
// 把同一张封面换到其它镜像域名上再试一遍，路径与 query 完全相同，
// 所以直接换 origin 就行。全试完仍失败才收手（CSS 会露出底纹）。
// 放在模块作用域：调用它的 load() 在 mountMusic 里，不能藏在 initMusic 里。
function coverCandidates(u, apis) {
  if (!u) return [];
  var m = /^(https?:\/\/[^/]+)(\/[\s\S]*)?$/.exec(u);
  if (!m) return [u];
  var rest = m[2] || '/';
  var out = [u];
  for (var i = 0; i < (apis || []).length; i++) {
    var o = /^(https?:\/\/[^/]+)/.exec(apis[i]);
    if (!o) continue;
    var cand = o[1] + rest;
    if (out.indexOf(cand) < 0) out.push(cand);
  }
  return out;
}

// ---------- 播放器全局单例 ----------
// 整站只有一台 <audio>，而且它挂在 window.MUSIC 上、不随页面销毁 ——
// 这是「翻页不断音」最关键的一步。无刷翻页（pjax.js）换完 DOM 之后，
// 新页面只是把**界面壳子**重新挂到这个仍在播放的音频上，
// src / currentTime / 音量一律不动，所以听感上是完全连续的。
var MUSIC = null;   // { root, cfg, tracks, state, audio, teardown }

// 从 .music-root 的 data-* 上读一份配置（各页模板都从同一份主题配置渲染，
// 只有 mode / lrc 会随页面变：音乐页是 page 模式且带歌词）
function musicCfg(root) {
  var cfg = {
    // 可以给多条接口（配置里写成数组，模板用 | 连起来）：
    // 公共 Meting 镜像三天两头抽风，一条不通就自动换下一条
    apis: (root.getAttribute('data-api') || '').split('|')
      .map(function (s) { return s.trim(); })
      .filter(Boolean),
    server: root.getAttribute('data-server') || 'netease',
    type: root.getAttribute('data-type') || 'song',
    id: root.getAttribute('data-id') || '',
    volume: parseFloat(root.getAttribute('data-volume')),
    loop: root.getAttribute('data-loop') || 'all',
    order: root.getAttribute('data-order') || 'list',
    lrc: root.getAttribute('data-lrc') === '1',
    mode: root.getAttribute('data-mode') || 'global'
  };
  cfg.page = cfg.mode === 'page';
  return cfg;
}

// 换壳：摘掉旧界面上的监听，把新界面重新挂到那台还在响的音频上
function remountMusic(root, cfg) {
  var live = MUSIC;
  if (live.teardown) live.teardown();
  live.cfg = cfg;
  live.root = root;
  mountMusic(root, live.tracks, cfg, live);
}

function initMusic() {
  var root = document.querySelector('.music-root');
  if (!root || !window.fetch || !window.Audio) { markNoMusic(); return; }

  var cfg = musicCfg(root);
  // 没配 id（或模板里输出成了字符串 "undefined"）就直接不挂，免得去接口要一首不存在的歌
  if (!cfg.id || cfg.id === 'undefined' || cfg.id === 'null') { markNoMusic(); return; }

  if (!cfg.apis.length) { markNoMusic(); return; }

  // 已经有一台活着的播放器、而且还是同一首歌 —— 只换壳，绝不去碰 <audio>
  if (MUSIC && MUSIC.tracks.length && MUSIC.cfg.id === cfg.id) {
    remountMusic(root, cfg);
    return;
  }

  // Meting 的接口模板：:server / :type / :id / :r 会被替换；
  // 不带 :id 的老式地址退回 query 拼接
  function buildUrl(tpl) {
    return tpl.indexOf(':id') >= 0
      ? tpl.replace(':server', cfg.server).replace(':type', cfg.type)
           .replace(':id', cfg.id).replace(':r', String(Date.now()))
      : tpl.replace(/\/+$/, '') + '?server=' + cfg.server + '&type=' + cfg.type + '&id=' + cfg.id;
  }

  // 逐条试：任一条拿到可播放的曲目就挂上播放器；全挂完了才认输
  var next = 0;
  (function attempt() {
    if (next >= cfg.apis.length) {
      // 接口全不通就什么都不显示，不给访客看一个坏掉的播放器
      markNoMusic();
      return;
    }
    // 卡住的接口不该把后面几条一起拖死，9 秒还不回来就换下一条
    var ac = window.AbortController ? new AbortController() : null;
    var timer = ac ? setTimeout(function () { ac.abort(); }, 9000) : null;
    fetch(buildUrl(cfg.apis[next++]), ac ? { signal: ac.signal } : undefined)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        var raw = Array.isArray(data) ? data : [data];
        var tracks = [];
        raw.forEach(function (t) {
          if (!t || !t.url) return;
          tracks.push({
            name: t.name || t.title || '未命名曲目',
            artist: t.artist || t.author || '',
            url: t.url,
            // 注：Meting 的封面接口固定发 90y90，改不了尺寸（试过 &param / &size 都被忽略），
            // 所以别把它拉成大横幅 —— 首页那块小组件改成方形展示，1:1 就不发虚了
            cover: t.cover || t.pic || '',
            lrc: t.lrc || t.lyric || ''
          });
        });
        if (!tracks.length) { attempt(); return; }   // 这条给了个空壳，换下一条
        mountMusic(root, tracks, cfg, null);
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        attempt();                                    // 超时 / 非 JSON / 网络错 —— 换下一条
      });
  })();
}

// prev = 上一页那台还在响的播放器（无刷翻页时传进来）。
// 传了就说明：音频别动、曲目别要、进度别重置 —— 我们只是给它换一身壳。
function mountMusic(root, tracks, cfg, prev) {
  if (root.getAttribute('data-mounted')) return; // 防止被重复初始化挂出两套播放器
  root.setAttribute('data-mounted', '1');
  document.documentElement.classList.remove('awen-no-music');   // 之前失败过也没关系，这回挂上了

  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function trackKey(t) { return t.name + '|' + t.artist; }

  // 挂在 audio / document / window 上的监听都记一份，换壳时统一摘掉。
  // （挂在壳子内部按钮上的不用管 —— 那些节点会跟着旧 DOM 一起被丢掉）
  var bound = [];
  function bind(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    bound.push([target, type, fn, opts]);
  }

  var audio = prev ? prev.audio : new Audio();
  if (!prev) audio.preload = 'metadata';

  // 恢复上一页的进度：只在「整页刷新」这条路上需要
  //（无刷翻页压根不会断，prev 有值时这段直接跳过）
  var saved = null, found = -1, startTime = 0, resumePlay = false;
  if (!prev) {
    try { saved = JSON.parse(sessionStorage.getItem(MUSIC_STATE_KEY) || 'null'); } catch (e) {}
    if (saved && saved.key) {
      for (var i = 0; i < tracks.length; i++) {
        if (trackKey(tracks[i]) === saved.key) { found = i; break; }
      }
    }
    startTime = found >= 0 ? (saved.time || 0) : 0;
    resumePlay = found >= 0 && !!saved.playing;
  }

  // 复用上一页的状态对象：当前第几首、循环模式、歌词进度都得接着走
  var state = prev ? prev.state : {
    index: found >= 0 ? found : 0,
    loop: cfg.loop,
    lrcLines: [],
    lrcNodes: null,
    lrcIndex: -2
  };
  if (prev) {
    state.lrcLines = [];
    state.lrcNodes = null;
    state.lrcIndex = -2;
  }

  // 音量：优先用上次调过的
  var savedVolume = parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY) || '');
  if (isNaN(savedVolume)) savedVolume = isNaN(cfg.volume) ? 0.6 : cfg.volume;

  // ---------- 结构 ----------
  var isIos = cfg.mode === 'ios';
  var pill = null;
  var panel = null;
  var toggleBtn = null;
  var expandBtn = null;

  if (isIos) {
    // iOS 形态：锁屏大卡片 / 主屏常驻小条，同一个节点换位置（CSS 控制）
    root.innerHTML =
      '<div class="mp-ios">' +
        '<div class="mp-ios-top">' +
          '<span class="mp-cover"><img class="mp-cover-img" alt="" decoding="async"></span>' +
          '<span class="mp-ios-meta"><span class="mp-title">—</span><span class="mp-artist"></span></span>' +
        '</div>' +
        '<div class="mp-bar"><span class="mp-played"><span class="mp-thumb"></span></span></div>' +
        '<div class="mp-time"><span class="mp-cur">00:00</span><span class="mp-total">00:00</span></div>' +
        '<div class="mp-controls">' +
          '<button class="mp-btn mp-loop" type="button" aria-label="循环模式">' + MP_ICON.loop + '</button>' +
          '<button class="mp-btn mp-prev" type="button" aria-label="上一首">' + MP_ICON.prev + '</button>' +
          '<button class="mp-btn mp-play mp-btn-main" type="button" aria-label="播放或暂停">' + MP_ICON.play + '</button>' +
          '<button class="mp-btn mp-next" type="button" aria-label="下一首">' + MP_ICON.next + '</button>' +
          '<button class="mp-btn mp-mute" type="button" aria-label="静音">' + MP_ICON.volume + '</button>' +
          '<span class="mp-vol"><span class="mp-vol-fill"></span></span>' +
        '</div>' +
      '</div>';
    root.hidden = false;
  } else {
    pill = h('div', 'mp-pill');
    expandBtn = h('button', 'mp-expand');
    expandBtn.type = 'button';
    expandBtn.setAttribute('aria-label', '展开播放器');
    expandBtn.innerHTML =
      '<span class="mp-cover"><img class="mp-cover-img" alt="" decoding="async"></span>' +
      '<span class="mp-text"><span class="mp-title">—</span><span class="mp-artist"></span></span>' +
      '<span class="mp-chevron">' + MP_ICON.chevron + '</span>';

    toggleBtn = h('button', 'mp-toggle');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', '播放或暂停');
    toggleBtn.innerHTML = MP_ICON.play;

    pill.appendChild(expandBtn);
    pill.appendChild(toggleBtn);

    panel = h('div', 'mp-panel');
    panel.innerHTML =
      '<div class="mp-head">' +
        '<span class="mp-cover mp-cover-lg"><img class="mp-cover-img" alt="" decoding="async"></span>' +
        '<span class="mp-meta"><span class="mp-title">—</span><span class="mp-artist"></span></span>' +
      '</div>' +
      '<div class="mp-bar"><span class="mp-played"><span class="mp-thumb"></span></span></div>' +
      '<div class="mp-time"><span class="mp-cur">00:00</span><span class="mp-total">00:00</span></div>' +
      '<div class="mp-controls">' +
        '<button class="mp-btn mp-prev" type="button" aria-label="上一首">' + MP_ICON.prev + '</button>' +
        '<button class="mp-btn mp-play mp-btn-main" type="button" aria-label="播放或暂停">' + MP_ICON.play + '</button>' +
        '<button class="mp-btn mp-next" type="button" aria-label="下一首">' + MP_ICON.next + '</button>' +
        '<button class="mp-btn mp-loop" type="button" aria-label="循环模式">' + MP_ICON.loop + '</button>' +
        '<button class="mp-btn mp-mute" type="button" aria-label="静音">' + MP_ICON.volume + '</button>' +
        '<span class="mp-vol"><span class="mp-vol-fill"></span></span>' +
      '</div>' +
      '<div class="mp-lrc"><div class="mp-lrc-inner"></div></div>';

    root.appendChild(pill);
    root.appendChild(panel);
    root.hidden = false;
  }

  var covers = root.querySelectorAll('.mp-cover-img');
  var titles = root.querySelectorAll('.mp-title');
  var artists = root.querySelectorAll('.mp-artist');
  var played = root.querySelector('.mp-played');
  var thumb = root.querySelector('.mp-thumb');
  var bar = root.querySelector('.mp-bar');
  var curEl = root.querySelector('.mp-cur');
  var totalEl = root.querySelector('.mp-total');
  var mainBtn = root.querySelector('.mp-btn-main');
  var loopBtn = root.querySelector('.mp-loop');
  var muteBtn = root.querySelector('.mp-mute');
  var volBox = root.querySelector('.mp-vol');
  var volFill = root.querySelector('.mp-vol-fill');
  var lrcBox = root.querySelector('.mp-lrc');
  var lrcInner = root.querySelector('.mp-lrc-inner');
  toggleBtn = root.querySelector('.mp-toggle') || toggleBtn;
  expandBtn = root.querySelector('.mp-expand') || expandBtn;

  // 封面兜底：加载失败先换下一条镜像地址重试，全部失败才收起 <img>
  // —— 宁可不显示封面（露出 .mp-cover 的底纹），也不要留个破图图标
  function coverFailed(img) {
    var list = img.__covers || [];
    if (img.__ci + 1 < list.length) {
      img.__ci++;
      img.src = list[img.__ci];
      return true;          // 还有候选可试
    }
    clearTimeout(img.__timer);
    img.removeAttribute('src');
    img.setAttribute('hidden', '');
    root.classList.add('mp-cover-failed');
    var card = root.querySelector('.mp-ios');
    if (card) card.classList.remove('has-cover');   // 顺手把模糊底色也收掉
    return false;           // 彻底放弃
  }

  // 图片「卡住」时既不触发 load 也不触发 error（镜像半死不活的典型症状）：
  // 请求发出去就没下文了，光等 error 会让破图一直僵在那儿。
  // 到点还没拿到 naturalWidth 就当失败处理，走同一套「换候选 → 收起」。
  var COVER_TIMEOUT = 10000;
  function armCover(img) {
    clearTimeout(img.__timer);
    img.__timer = setTimeout(function () {
      if (!img.getAttribute('src')) return;
      if (img.complete && img.naturalWidth > 0) return;   // 其实已经加载好了
      if (coverFailed(img)) armCover(img);                // 换了下一条，重新计时
    }, COVER_TIMEOUT);
  }

    covers.forEach(function (img) {
    img.addEventListener('error', function () {
      if (coverFailed(img)) armCover(img);
    });
    img.addEventListener('load', function () {
      clearTimeout(img.__timer);
      root.classList.remove('mp-cover-failed');
      // 首页那块「正在播放」卡（.mp-ios）拿这张封面当模糊底色，
      // 把封面左右空出来的那片玻璃填满。地址交给 CSS 变量，换歌时自动跟着换。
      // 非 iOS 形态下查不到 .mp-ios，这里自然是个空操作。
      var card = root.querySelector('.mp-ios');
      if (card && img.naturalWidth > 0) {
        card.style.setProperty('--cover', 'url("' + (img.currentSrc || img.src) + '")');
        card.classList.add('has-cover');
      }
    });
  });

  // ---------- 小工具 ----------
  function current() { return tracks[state.index]; }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setIcon(playing) {
    var html = playing ? MP_ICON.pause : MP_ICON.play;
    if (toggleBtn) toggleBtn.innerHTML = html;
    if (mainBtn) mainBtn.innerHTML = html;
  }

  // 把当前曲目同步给首页（灵动岛 / 控制中心 / 桌上那台唱片机）
  function emitTrack() {
    var t = current();
    if (!t) return;
    document.dispatchEvent(new CustomEvent('awen:track', {
      detail: { name: t.name, artist: t.artist, playing: !audio.paused, pic: t.cover || '' }
    }));
  }

  function setProgress(ratio) {
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    played.style.width = (ratio * 100) + '%';
  }

  function whenReady(fn) {
    var done = false;
    function once() {
      if (done) return;
      done = true;
      fn();
    }
    if (audio.readyState >= 1) return once();
    audio.addEventListener('loadedmetadata', once, { once: true });
    setTimeout(once, 3000);
  }

  // ---------- 载入曲目 ----------
  function load(index, autoplay) {
    var n = tracks.length;
    state.index = ((index % n) + n) % n;
    var t = current();

    state.lrcLines = [];
    state.lrcNodes = null;
    state.lrcIndex = -2;
    if (lrcInner) lrcInner.innerHTML = '';
    if (lrcInner) lrcInner.style.transform = '';
    showLrc(false);             // 换歌先收起来，等新歌词到了再展开

    titles.forEach(function (el) { el.textContent = t.name; });
    artists.forEach(function (el) { el.textContent = t.artist; });
    covers.forEach(function (img) {
      var list = coverCandidates(t.cover, cfg.apis);
      img.__covers = list;
      img.__ci = 0;
      root.classList.remove('mp-cover-failed');
      if (list.length) {
        img.removeAttribute('hidden');
        img.src = list[0];
        armCover(img);            // 卡住不响应时也有兜底
      } else {
        clearTimeout(img.__timer);
        img.removeAttribute('src');
        img.setAttribute('hidden', '');
      }
    });
    root.classList.toggle('mp-no-cover', !t.cover);

    audio.src = t.url;
    totalEl.textContent = '00:00';
    curEl.textContent = '00:00';
    setProgress(0);
    setIcon(false);
    root.classList.remove('is-playing');

    loadLrc(t);
    if (autoplay) play();
  }

  function play() {
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function () {
        // 浏览器拦截自动播放：把界面复位，等用户自己点
        setIcon(false);
        root.classList.remove('is-playing');
      });
    }
  }

  function toggle() {
    if (audio.paused) play();
    else audio.pause();
  }

  function step(delta, forcePlay) {
    if (tracks.length <= 1) {
      audio.currentTime = 0;
      if (forcePlay) play();
      return;
    }
    var next = state.index + delta;
    if (cfg.order === 'random' && delta > 0) next = Math.floor(Math.random() * tracks.length);
    load(next, forcePlay === undefined ? !audio.paused : forcePlay);
  }

  // ---------- 循环模式 ----------
  function applyLoop() {
    audio.loop = state.loop === 'one' || (tracks.length === 1 && state.loop !== 'none');
    loopBtn.setAttribute('data-mode', state.loop);
    loopBtn.classList.toggle('is-on', state.loop !== 'none');
  }

  loopBtn.addEventListener('click', function () {
    state.loop = state.loop === 'all' ? 'one' : (state.loop === 'one' ? 'none' : 'all');
    applyLoop();
    saveState(true);
  });

  // ---------- 音量 ----------
  function syncVolume() {
    var v = audio.muted ? 0 : audio.volume;
    volFill.style.width = (v * 100) + '%';
    muteBtn.innerHTML = v <= 0 ? MP_ICON.mute : MP_ICON.volume;
  }

  function setVolume(v) {
    v = Math.min(Math.max(v, 0), 1);
    audio.muted = false;
    audio.volume = v;
    syncVolume();
    try { localStorage.setItem(MUSIC_VOLUME_KEY, String(v)); } catch (e) {}
  }

  muteBtn.addEventListener('click', function () {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      if (audio.volume === 0) audio.volume = 0.6;
    } else {
      audio.muted = true;
    }
    syncVolume();
  });

  function ratioAt(box, clientX) {
    var r = box.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
  }

  // 进度条：按下即定位，拖动实时预览，松手才真正跳转
  var dragging = false;
  var dragRatio = 0;

  function preview(ratio) {
    dragRatio = ratio;
    setProgress(ratio);
    curEl.textContent = fmt((isFinite(audio.duration) ? audio.duration : 0) * ratio);
  }

  bar.addEventListener('pointerdown', function (e) {
    dragging = true;
    preview(ratioAt(bar, e.clientX));
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  bar.addEventListener('pointermove', function (e) {
    if (dragging) preview(ratioAt(bar, e.clientX));
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = dragRatio * audio.duration;
    }
    renderProgress();
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  var volDragging = false;
  volBox.addEventListener('pointerdown', function (e) {
    volDragging = true;
    setVolume(ratioAt(volBox, e.clientX));
    try { volBox.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  volBox.addEventListener('pointermove', function (e) {
    if (volDragging) setVolume(ratioAt(volBox, e.clientX));
  });
  volBox.addEventListener('pointerup', function () { volDragging = false; });
  volBox.addEventListener('pointercancel', function () { volDragging = false; });

  // ---------- 歌词 ----------
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function parseLrc(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (line) {
      var content = line.replace(/\[[^\]]*\]/g, '').trim();
      if (!content) return;
      var re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
      var m;
      while ((m = re.exec(line))) {
        var frac = m[3] || '';
        if (frac.length === 1) frac += '00';
        else if (frac.length === 2) frac += '0';
        out.push({
          t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (parseInt(frac, 10) || 0) / 1000,
          text: content
        });
      }
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  // 歌词窗开着却一行都没有时，卡片中部会空出一大块（116px），
  // 看着像没加载完。没有歌词就把它收起来，卡片贴着内容长。
  function showLrc(box) {
    if (lrcBox) lrcBox.hidden = !box;
  }

  function loadLrc(track) {
    if (!cfg.lrc || !lrcInner || !track.lrc) { showLrc(false); return; }
    showLrc(false);
    var key = trackKey(track);
    fetch(track.lrc).then(function (res) {
      return res.text();
    }).then(function (text) {
      if (trackKey(current()) !== key) return; // 已经切歌了，丢掉这份歌词
      var lines = parseLrc(text);
      if (!lines.length) return;
      state.lrcLines = lines;
      var html = '';
      for (var i = 0; i < lines.length; i++) html += '<p>' + esc(lines[i].text) + '</p>';
      lrcInner.innerHTML = html;
      state.lrcNodes = lrcInner.children;
      state.lrcIndex = -2;
      showLrc(true);
      syncLrc(audio.currentTime);
    }).catch(function () { showLrc(false); });
  }

  function syncLrc(t) {
    var nodes = state.lrcNodes;
    if (!nodes || !nodes.length) return;
    var idx = -1;
    for (var i = 0; i < state.lrcLines.length; i++) {
      if (state.lrcLines[i].t <= t + 0.3) idx = i;
      else break;
    }
    if (idx === state.lrcIndex) return;
    state.lrcIndex = idx;
    for (var k = 0; k < nodes.length; k++) nodes[k].classList.toggle('active', k === idx);
    var node = nodes[idx];
    if (node && node.offsetTop >= 0) {
      var offset = lrcBox.clientHeight / 2 - node.offsetTop - node.offsetHeight / 2;
      lrcInner.style.transform = 'translateY(' + offset + 'px)';
    }
  }

  // ---------- 跨页续播（整页刷新那条路用得上） ----------
  // 无刷翻页时音频根本不断，这份存档只是给「用户直接刷新 / 从站外进来」兜底
  var lastSave = 0;
  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 1000) return;
    lastSave = now;
    try {
      sessionStorage.setItem(MUSIC_STATE_KEY, JSON.stringify({
        key: trackKey(current()),
        time: audio.currentTime || 0,
        playing: !audio.paused
      }));
    } catch (e) {}
  }
  bind(window, 'pagehide', function () { saveState(true); });

  // ---------- 统一刷新进度（改动 currentTime 后要手动同步界面） ----------
  function renderProgress() {
    var d = audio.duration;
    if (!dragging && isFinite(d) && d > 0) {
      setProgress(audio.currentTime / d);
      curEl.textContent = fmt(audio.currentTime);
    }
    if (isFinite(d) && d > 0) totalEl.textContent = fmt(d);
    syncLrc(audio.currentTime);
  }

  // ---------- 换壳后的补水 ----------
  // 无刷翻页换了一身新 UI，得把界面拉回到音频**当前**的真实状态：
  // 曲名、封面、进度、播放键图标、歌词。这里同样一行都不动音频。
  function hydrate() {
    var t = current();
    if (!t) return;
    titles.forEach(function (el) { el.textContent = t.name; });
    artists.forEach(function (el) { el.textContent = t.artist; });
    covers.forEach(function (img) {
      var list = coverCandidates(t.cover, cfg.apis);
      img.__covers = list;
      img.__ci = 0;
      root.classList.remove('mp-cover-failed');
      if (list.length) {
        img.removeAttribute('hidden');
        img.src = list[0];
        armCover(img);
      } else {
        clearTimeout(img.__timer);
        img.removeAttribute('src');
        img.setAttribute('hidden', '');
      }
    });
    root.classList.toggle('mp-no-cover', !t.cover);
    root.classList.toggle('is-playing', !audio.paused);
    setIcon(!audio.paused);
    renderProgress();
    loadLrc(t);
  }

  // ---------- 事件 ----------
  bind(audio, 'play', function () {
    root.classList.add('is-playing');
    setIcon(true);
    emitTrack();
    saveState(true);
  });
  bind(audio, 'pause', function () {
    root.classList.remove('is-playing');
    setIcon(false);
    emitTrack();
    saveState(true);
  });
  bind(audio, 'loadedmetadata', function () {
    totalEl.textContent = fmt(audio.duration);
  });
  bind(audio, 'seeked', renderProgress);
  bind(audio, 'timeupdate', function () {
    renderProgress();
    saveState(false);
  });
  bind(audio, 'ended', function () {
    emitTrack();
    if (audio.loop) return;
    if (tracks.length === 1 || (state.loop === 'none' && state.index === tracks.length - 1)) {
      setIcon(false);
      root.classList.remove('is-playing');
      setProgress(0);
      curEl.textContent = '00:00';
      return;
    }
    step(1, true);
  });
  bind(audio, 'error', function () {
    setIcon(false);
    root.classList.remove('is-playing');
  });

  expandBtn && expandBtn.addEventListener('click', function () {
    root.classList.toggle('open');
  });
  toggleBtn && toggleBtn.addEventListener('click', toggle);
  mainBtn.addEventListener('click', toggle);
  root.querySelector('.mp-prev').addEventListener('click', function () { step(-1); });
  root.querySelector('.mp-next').addEventListener('click', function () { step(1); });

  // 控制中心里的播放/暂停
  bind(document, 'awen:music-toggle', function () { toggle(); });

  bind(document, 'click', function (e) {
    if (root.classList.contains('open') && !root.contains(e.target)) root.classList.remove('open');
  });
  bind(document, 'keydown', function (e) {
    if (e.key === 'Escape') root.classList.remove('open');
  });

  // ---------- 换壳时的收尾 ----------
  // 由 remountMusic 调用：把挂在 audio / document / window 上的监听全部摘掉，
  // 新壳会重新绑一套。**它绝不碰音频本身** —— 声音正从那儿出来。
  MUSIC = {
    root: root,
    cfg: cfg,
    tracks: tracks,
    state: state,
    audio: audio,
    teardown: function () {
      for (var i = 0; i < bound.length; i++) {
        bound[i][0].removeEventListener(bound[i][1], bound[i][2], bound[i][3]);
      }
      bound.length = 0;
    }
  };

  // ---------- 启动 ----------
  applyLoop();
  if (prev) {
    // 接力：音量条 / 播放键 / 进度 / 歌词按音频现状重画，音频一动不动
    syncVolume();
    hydrate();
    emitTrack();
  } else {
    setVolume(savedVolume);
    load(state.index, false);
    emitTrack();
    if (startTime > 3 || resumePlay) {
      whenReady(function () {
        if (startTime > 3 && isFinite(audio.duration) && startTime < audio.duration - 5) {
          audio.currentTime = startTime;
          renderProgress(); // 浏览器不一定会补发 timeupdate，这里手动同步界面
        }
        if (resumePlay) play();
      });
    }
  }
}
