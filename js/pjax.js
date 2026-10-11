// ============================================================
// awen 主题 · 无刷翻页（PJAX）
//
// 为什么需要它：
//   Hexo 是静态站，点站内链接＝整页刷新。旧页面一卸载，里面那台
//   <audio> 就跟着没了；新页面要重新要接口、重新建播放器、再 seek
//   回上一次的位置 —— 这一段就是切页时听见的那一秒空档。
//
// 这里把「换页」改成：fetch 目标页 → 解析 → 只换 <body> 里的东西，
// 文档本身不卸载。音频元素被 main.js 提成了全局单例，于是音乐
// **一秒都不停**，连音量、进度、歌词都原样接着走。
//
// 分工：
//   pjax.js      —— 只管「换 DOM / 管历史 / 管滚动 / 兜底」，不碰业务
//   main.js      —— window.awenPageInit()：一页的初始化，可重复调用
//   ios.js       —— window.awenIOSBoot()：iPad 外壳的初始化，可重复调用
//
// 任何一步出岔子（接口挂了、返回的不是 HTML、解析炸了）都直接
// 退回 window.location.href 整页跳 —— 宁可慢一点，也不能点不动。
// ============================================================
(function () {
  'use strict';

  // 主题配置里 pjax: false 时，layout.ejs 会在 <html> 上写 data-pjax="0"
  if (document.documentElement.getAttribute('data-pjax') === '0') return;
  if (!window.fetch || !window.DOMParser || !window.history || !history.pushState) return;

  var BAR_ID = 'awen-pjax-bar';
  var SKIP_ATTR = 'data-no-pjax';
  var CACHE_TTL = 20000;          // 预取/已取过的页面留 20 秒
  var BAR_DELAY = 180;            // 请求快于这个时间就不闪进度条（免得一晃神看不清）
  var cache = {};                 // url -> { html, at }
  var inflight = {};              // url -> AbortController（预取与真正跳转共用）
  var CURRENT = location.href;    // 我们认定的「当前页」（location 在 popstate 里已经先变过了）
  var busy = false;               // 正在换页

  // ---------- 滚动位置记忆 ----------
  // 站内文档是滚 #ios-screen（文章页）/ #ios-home（主屏）而不是滚窗口，
  // 窗口滚动只在窄屏退回普通版式时才用得上，两边都记。
  var SCROLL_KEY = 'awen-pjax-scroll';
  var scrollMap = {};
  try { scrollMap = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}') || {}; } catch (e) { scrollMap = {}; }
  // 交给浏览器自动还原的话，它会和我们手动换页抢，索性自己管
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function scrollEls() {
    var out = [];
    var a = document.getElementById('ios-screen');
    var b = document.getElementById('ios-home');
    if (a) out.push(a);
    if (b) out.push(b);
    return out;
  }

  function readScroll() {
    var s = { w: window.pageYOffset || 0 };
    var els = scrollEls();
    for (var i = 0; i < els.length; i++) s[els[i].id] = els[i].scrollTop;
    return s;
  }

  function writeScroll(s) {
    if (!s) s = { w: 0 };
    window.scrollTo(0, s.w || 0);
    var els = scrollEls();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (typeof s[el.id] === 'number') el.scrollTop = s[el.id];
      else if (el.id === 'ios-screen') el.scrollTop = 0;   // 换了篇文章，从头读
    }
  }

  function saveScroll(url) {
    if (!url) return;
    scrollMap[url] = readScroll();
    // 只留最近 30 条，sessionStorage 别无限长
    var keys = Object.keys(scrollMap);
    if (keys.length > 30) delete scrollMap[keys[0]];
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify(scrollMap)); } catch (e) {}
  }

  // ---------- 顶部加载条 ----------
  var bar = null, barTimer = null;

  function barEl() {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.setAttribute('aria-hidden', 'true');
      bar.appendChild(document.createElement('i'));
    }
    // 换 body 时它会跟着被丢掉，这里顺手放回来
    if (bar.parentNode !== document.body) document.body.appendChild(bar);
    return bar;
  }

  function showBar() {
    barEl();
    clearTimeout(barTimer);
    // 只在真的慢的时候露脸，快的时候不留痕迹
    barTimer = setTimeout(function () { if (bar) bar.classList.add('is-on'); }, BAR_DELAY);
  }

  function hideBar() {
    clearTimeout(barTimer);
    if (!bar) return;
    if (!bar.classList.contains('is-on')) return;   // 请求很快，压根没露面，别闪一下
    bar.classList.add('is-done');                   // 冲到 100% 再淡出
    setTimeout(function () {
      if (bar) bar.classList.remove('is-on', 'is-done');
    }, 240);
  }

  // ---------- 取页面 ----------
  function fetchPage(url) {
    var hit = cache[url];
    if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.html);

    if (inflight[url]) return inflight[url].promise;

    var ac = window.AbortController ? new AbortController() : null;
    var p = fetch(url, {
      credentials: 'same-origin',
      // 让服务端（以及将来可能加的中间层）知道这是无刷请求
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Pjax': '1' }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var ct = res.headers.get('content-type') || '';
      if (ct.indexOf('text/html') < 0) throw new Error('not html: ' + ct);
      return res.text();
    }).then(function (html) {
      cache[url] = { html: html, at: Date.now() };
      delete inflight[url];
      return html;
    }).catch(function (err) {
      delete inflight[url];
      throw err;
    });

    if (ac) inflight[url] = { ac: ac, promise: p, signal: ac.signal };
    return p;
  }

  // ---------- 预取 ----------
  // 鼠标一搭上链接就先把页面拿回来，点下去时几乎就是「瞬间换页」
  var prefetched = 0;
  function prefetch(url) {
    if (!url || cache[url] || inflight[url]) return;
    if (busy || prefetched > 6) return;      // 一次最多预取 6 张，别把带宽吃光
    prefetched++;
    fetchPage(url).catch(function () { /* 预取失败无所谓，点的时候还会再要一次 */ });
  }

  // ---------- 链接是否该走 PJAX ----------
  function eligible(a, e) {
    if (!a || !a.getAttribute) return null;
    if (e.defaultPrevented) return null;                 // 页面自己处理了（比如 App 打开动画）
    if (e.button !== 0) return null;                     // 只认左键
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;   // 新标签页等交给浏览器
    if (a.hasAttribute(SKIP_ATTR) || a.hasAttribute('download')) return null;
    if (a.target && a.target !== '_self') return null;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return null;     // 页内锚点

    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return null; }
    if (u.origin !== location.origin) return null;        // 外站
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // 同路径仅换 hash：浏览器自己滚就行
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return null;
    // 非 HTML 资源（atom.xml / 图片 / 压缩包 ……）
    if (/\.(xml|json|txt|md|png|jpe?g|webp|gif|svg|ico|pdf|zip|gz|mp3|mp4|webm)$/i.test(u.pathname)) return null;
    return u.href;
  }

  // ---------- 换 DOM ----------
  function swap(doc, url) {
    var incoming = doc.body;
    if (!incoming) throw new Error('no body');

    // 1) 新文档里的 <script> 一律不要 —— main.js / ios.js / pjax.js 都还在，
    //    再执行一遍会挂出两套播放器和两套事件监听。初始化走下面的钩子。
    var nodes = [];
    for (var i = 0; i < incoming.childNodes.length; i++) {
      var n = incoming.childNodes[i];
      if (n.nodeType === 1 && n.tagName === 'SCRIPT') continue;
      nodes.push(n);
    }

    // 2) 标题 / body 类名（page-home ↔ page-doc 就靠它切版式）
    if (doc.title) document.title = doc.title;
    document.body.className = incoming.className || '';

    // 3) 先把新节点拼成一段，再整块换上去 —— 中间不会有「白屏一帧」
    var frag = document.createDocumentFragment();
    for (var j = 0; j < nodes.length; j++) frag.appendChild(nodes[j]);

    var live = document.querySelectorAll('body > *');
    for (var k = 0; k < live.length; k++) {
      // 进度条是我们自己加的，不用动它（下面 appendChild 会把它挤到末尾，顺手挪回来）
      live[k].parentNode.removeChild(live[k]);
    }
    document.body.appendChild(frag);
    barEl();                       // 把加载条放回 body 末尾

    // 4) 交给两套初始化。
    //    顺序要紧：先让 iPad 外壳（应用栏 / 滚动容器）就位，
    //    再跑页面初始化 —— 播放器重建时会派发 awen:track，
    //    那时灵动岛和桌上那台唱片机得已经在听了。
    busy = true;
    try {
      if (window.awenIOSBoot) window.awenIOSBoot();
      if (window.awenPageInit) window.awenPageInit();
    } finally {
      busy = false;
    }
    document.dispatchEvent(new CustomEvent('awen:pjax', { detail: { url: url } }));
  }

  // ---------- 跳转总和 ----------
  function navigate(url, opts) {
    opts = opts || {};
    // 点了当前页（比如在文章页点「回到主屏」但其实已经在主屏）：滚回顶部就好
    if (url === CURRENT) {
      saveScroll(url);
      writeScroll({ w: 0, 'ios-screen': 0, 'ios-home': 0 });
      return;
    }

    saveScroll(CURRENT);
    var target = opts.restore ? (scrollMap[url] || { w: 0 }) : { w: 0, 'ios-screen': 0, 'ios-home': 0 };

    // 先把地址栏和历史改了：用户看到的就是「已经进来了」，
    // 万一 fetch 挂了退回整页跳，地址也是对的
    if (opts.noPush) {
      // 前进/后退：历史已经由浏览器挪好了，什么都不用做
    } else if (opts.replace) {
      history.replaceState({ awen: 1, url: url }, '', url);
    } else {
      history.pushState({ awen: 1, url: url }, '', url);
    }
    CURRENT = url;
    // ios.js 用它判断「这次是从站内翻过来的」，决定首页要不要直接进主屏
    window.awenPjaxed = true;

    // 前进（pushState）进入文档页时播入场动画；后退（noPush）直接落内容。
    // 这样无论从主屏 App 图标还是小组件（widget）点进来，都有统一的「进入」过渡。
    if (!opts.noPush) window.awenDocEnter = true;

    showBar();
    fetchPage(url).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc || !doc.body) throw new Error('parse failed');
      // 只认同一套外壳的页面；404.html / 别的站点混进来就整页跳
      if (!doc.getElementById('ios') && !doc.querySelector('.container')) {
        throw new Error('unexpected document');
      }
      swap(doc, url);
      hideBar();
      prefetched = 0;                // 换了一页，预取配额重新给
      // 等新布局量过一遍再落滚动位置（图片/字体后到的话影响不大，
      // 反正文章都是从顶开始读，返回时才需要精确还原）
      requestAnimationFrame(function () { writeScroll(target); });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      hideBar();
      window.location.href = url;      // 兜底：老老实实整页跳
    });
  }

  // ---------- 事件 ----------
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var url = eligible(a, e);
    if (!url) return;
    // 万一正好在换页的当口（同步流程里几乎不可能），别拦默认行为 ——
    // 让浏览器整页跳，也好过点了没反应
    if (busy) return;
    e.preventDefault();
    navigate(url, {});
  });

  // 预取：鼠标搭上去 / 手指按下去就先开始下
  function maybePrefetch(e) {
    if (e.target && e.target.closest) {
      var a = e.target.closest('a[href]');
      if (a) prefetch(eligible(a, { defaultPrevented: false, button: 0 }));
    }
  }
  document.addEventListener('mouseover', maybePrefetch, { passive: true });
  document.addEventListener('touchstart', maybePrefetch, { passive: true });

  // 只比路径和查询，不带 hash —— 页内锚点（TOC / 标题上的 §）改变的是 hash，
  // 同样会触发 popstate；要是拿完整 href 比，就会被误判成「后退了一次」，
  // 于是整个 body 被重换一遍：TOC 跳转失效、滚动位置清零。
  function pathOf(url) {
    try { var u = new URL(url, location.origin); return u.pathname + u.search; }
    catch (e) { return String(url); }
  }

  window.addEventListener('popstate', function () {
    // 只是 hash 变了（页内锚点）：浏览器自己就会滚到目标，别插手
    if (pathOf(location.href) === pathOf(CURRENT)) {
      CURRENT = location.href;      // 记住带 hash 的地址，下次比较才正确
      return;
    }
    saveScroll(CURRENT);
    navigate(location.href, { noPush: true, restore: true });
  });

  // 给 ios.js 里那些「不走 <a> 的跳转」（App 打开动画、搜索结果）用
  window.awenNavigate = function (url) { navigate(url, {}); };
})();
