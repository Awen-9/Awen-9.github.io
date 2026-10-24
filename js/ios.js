// ============================================================
// awen 主题 · iOS 外壳（编排）
//
// 锁屏（地球 / 时间 / 定位 / 音乐）→ 上滑或点击解锁 → 主屏；
// 其它页面则是平板里的「文档 App」（状态栏 + 应用栏 + 可滚动正文）。
//
// 无刷翻页（pjax.js）会把整个 <body> 换掉，连 #ios 外壳都是新的。
// 所以这里不是「跑一遍就完事」的 IIFE，而是一个可以被反复调用的
// boot()：每轮开跑前先让内核收尾上一轮，再按同一套顺序重新拉起。
//
// 外壳拆成三个文件（都是 defer，按下面的顺序加载）：
//   ios-core.js   内核：收尾登记簿、on / every / after、$、拖动守卫
//   ios-globe.js  地球与定位（锁屏背后那颗 WebGL 地球 + IP 定位，
//                 文档页也复用它当背景）
//   ios.js        本文件：外壳编排 —— 锁屏解锁、主屏 App、主题切换、
//                 控制中心、音乐桥、搜索面板、文档壳、无障碍分层、启动时序
//
// 挂在 #ios 内部节点上的监听不用登记收尾 —— 那些节点随旧 DOM 一起
// 被丢掉了；只有挂在 document / window / matchMedia 上的才需要。
// ============================================================
(function () {

  // 内核（收尾登记、常用工具、跨模块共享状态）都在 ios-core.js 里。
  // 这里取一份局部别名，下面这一千多行的读法跟拆分前一模一样。
  var A = window.AWEN;
  var cleanup = A.cleanup;
  var on = A.on, every = A.every, after = A.after, onMQ = A.onMQ, makeObserver = A.makeObserver;
  var $ = A.$, setText = A.setText, pad = A.pad, go = A.go;

  function boot() {
    // ① 先收尾上一轮。翻页时这里清掉的就是「上一页」留下的东西 ——
    //    内核把登记过的监听 / 定时器 / 观察器全摘掉，再把代数 +1
    var gen = A.reset();

    var root = document.getElementById('ios');
    if (!root) return;

  // 整站都装在这台平板里：首页是锁屏 + 主屏，其它页面是「文档 App」。
  // 两套东西共用同一个 #ios 外壳，这里先分流，后面的 init 各管一摊。
  var isDoc = root.classList.contains('ios-doc');

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var UNLOCK_KEY = 'awen-ios-unlocked';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    city: root.dataset.city || '',
    lat: parseFloat(root.dataset.lat),
    lon: parseFloat(root.dataset.lon),
    wall: root.dataset.wall || 'night',
    ipLoc: root.dataset.ipLoc !== '0',   // 是否允许用访客 IP 自动定位（主题配置 ios.ip_location）
    label: '',                           // 锁屏当前显示的地点名
    spin: 0,
    dragging: false,
    globe: null
  };
  if (isNaN(state.lat)) state.lat = 39.9042;   // 兜底：中国北京
  if (isNaN(state.lon)) state.lon = 116.4074;

  // 翻页收尾：地球（真建起来了的话）要连 WebGL 上下文一起放掉，
  // 不然翻一次页漏一个，攒够十几个整站的地球就全黑
  cleanup.push(function () {
    if (state.globe && state.globe.destroy) state.globe.destroy();
    state.globe = null;
  });

  // ------------------------------------------------------------
  // 时间 / 日期
  // ------------------------------------------------------------
  function tick() {
    var d = new Date();
    setText($('lock-time'), pad(d.getHours()) + ':' + pad(d.getMinutes()));
    setText($('sb-time'), pad(d.getHours()) + ':' + pad(d.getMinutes()));
    setText($('lock-date'), (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()]);
    // iPad 模式的状态栏还会在时间右边带一个日期（窄屏这条不显示）
    setText($('sb-date'), (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()]);
  }

  // ------------------------------------------------------------
  // 锁屏：上滑 / 点击解锁
  // ------------------------------------------------------------
  var lockEl = $('ios-lock');

  function isLocked() { return !root.classList.contains('is-home'); }

  function unlock() {
    if (!isLocked()) return;
    root.classList.add('is-home');
    root.classList.remove('is-cc', 'is-search');
    // 解锁后地球缓缓「退远 + 慢转」，而不是整颗球冻住 —— 像 iPhone 天文主题
    // 那样解锁的瞬间壁纸仍有生命感（配合 CSS 的 scale/blur 一起出纵深）
    if (state.globe) state.globe.toHome();
    try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch (e) {}
    // 先把主屏从 inert 里放出来，下面那句 focus 才落得下去
    //（观察器是异步的，等它跑完再 focus 就晚了）
    syncA11y();
    // 焦点交给主屏，键盘用户接着按 Tab 就能顺着图标走，不用从文档开头重来
    var homeEl = $('ios-home');
    if (homeEl) { try { homeEl.focus({ preventScroll: true }); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('awen:unlock'));
  }

  function lock(instant) {
    // 先让搜索面板清掉自己的状态（input / 结果列表），再统一收层。
    // 漏掉 is-search 的话，锁屏上会残留一块搜索面板。
    document.dispatchEvent(new CustomEvent('awen:lock'));
    root.classList.remove('is-cc', 'is-search');
    if (state.globe) state.globe.toLock();
    if (instant) {
      root.classList.add('no-anim');
      root.classList.remove('is-home');
      after(60, function () { root.classList.remove('no-anim'); });
    } else {
      root.classList.remove('is-home');
    }
    try { sessionStorage.setItem(UNLOCK_KEY, '0'); } catch (e) {}
  }

  function initUnlock() {
    if (!lockEl) return;

    var startY = 0, startX = 0, dy = 0, dx = 0, mode = null, pointerId = null;

    function reset() {
      lockEl.style.transition = '';
      lockEl.style.transform = '';
      lockEl.style.opacity = '';
      mode = null;
      state.dragging = false;
    }

    lockEl.addEventListener('pointerdown', function (e) {
      if (e.target.closest('a, button, .music-root, input')) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      startX = e.clientX;
      dy = dx = 0;
      mode = null;
      try { lockEl.setPointerCapture(pointerId); } catch (err) {}
    });

    lockEl.addEventListener('pointermove', function (e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      dy = e.clientY - startY;
      dx = e.clientX - startX;

      if (!mode) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          mode = Math.abs(dx) > Math.abs(dy) ? 'rotate' : 'swipe';
          state.dragging = mode === 'rotate';
          if (mode === 'swipe') lockEl.style.transition = 'none';
        } else {
          return;
        }
      }

      if (mode === 'rotate') {
        if (state.globe) state.globe.rotateBy(dx * -0.005);
      } else if (mode === 'swipe') {
        var y = Math.min(dy, 0);
        lockEl.style.transform = 'translateY(' + y + 'px)';
        lockEl.style.opacity = String(Math.max(1 + y / 320, 0.2));
        if (e.cancelable) e.preventDefault();
      }
    });

    function end(e) {
      if (pointerId === null || (e && e.pointerId !== pointerId)) return;
      var moved = Math.abs(dy) > 8 || Math.abs(dx) > 8;
      var swipedUp = mode === 'swipe' && dy < -70;
      pointerId = null;
      reset();
      if (swipedUp || !moved) unlock();   // 上滑到底 → 解锁；轻点 → 解锁
    }

    lockEl.addEventListener('pointerup', end);
    lockEl.addEventListener('pointercancel', end);

    on(document, 'keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && isLocked()) {
        e.preventDefault();
        unlock();
      }
      if (e.key === 'Escape') {
        if (root.classList.contains('is-cc')) {
          root.classList.remove('is-cc');
          syncA11y();
          // 焦点还给「还看得见的那一层」：锁屏态回控制中心按钮，解锁态回主屏
          var back = isLocked() ? $('cc-open') : $('ios-home');
          if (back) { try { back.focus({ preventScroll: true }); } catch (err) {} }
        }
      }
    });

    var openBtn = $('cc-open');
    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        root.classList.toggle('is-cc');
      });
    }

    // 主屏点状态栏也能拉开控制中心
    var bar = root.querySelector('.ios-statusbar');
    if (bar) {
      bar.addEventListener('click', function () {
        if (!isLocked()) root.classList.toggle('is-cc');
      });
    }
  }

  // ------------------------------------------------------------
  // 主屏台前调度（Stage Manager）：
  // 左边调度栏收着没在台前的卡片，台前舞台放当前聚焦的那张。
  // 解锁后默认把「最近更新」推上台前；点背景把它收回栏里、露出地球；
  // 点栏里的卡片把它推上台前 —— 跨容器移动用 FLIP 补间，位置尺寸连续变化。
  // ------------------------------------------------------------
  function initStage() {
    var rail = $('sm-rail');
    var stage = $('sm-stage');
    if (!rail || !stage) return;
    var cards = {};          // key → 卡片节点
    var slots = {};          // key → 栏里的槽位（卡片缩略时住的地方）
    var active = null;
    var THUMB = 0.34;        // 缩略比例，与 .sm-slot .widget 的 scale 保持一致

    // 把栏里的卡片包进槽位：槽位定缩略后的占位尺寸，卡片在槽内
    // transform 等比缩小 —— 内容原样的「窗口缩略图」，不是重新排版
    Array.prototype.forEach.call(Array.prototype.slice.call(rail.children), function (card) {
      if (!card.classList.contains('widget')) return;
      var slot = document.createElement('div');
      slot.className = 'sm-slot';
      card.parentNode.insertBefore(slot, card);
      slot.appendChild(card);
      var key = card.dataset.stageKey;
      slots[key] = slot;
      cards[key] = card;
    });

    // 量卡片自然高度，把槽位撑到缩略后的高度（transform 不改变布局，
    // 槽高得手动写；图片/字体就绪后再量一次才准）
    function sizeSlots() {
      Object.keys(slots).forEach(function (key) {
        var slot = slots[key];
        if (slot.style.display === 'none') return;
        var card = slot.firstElementChild;
        if (card) slot.style.height = Math.round(card.offsetHeight * THUMB) + 'px';
      });
    }
    sizeSlots();
    after(600, sizeSlots);
    after(1800, sizeSlots);
    on(window, 'resize', sizeSlots);
    on(document, 'awen:unlock', sizeSlots);

    // 「当前浏览」卡回显：上次读的文章（读的是本机 localStorage，构建期拿不到）
    try {
      var lastRead = JSON.parse(localStorage.getItem('awen-last-read') || 'null');
      var bt = $('browse-title'), bd = $('browse-date'), bw = $('widget-browse');
      if (lastRead && lastRead.h && bt && bt.textContent === '还没开始浏览') {
        bt.textContent = lastRead.t || '上次读的文章';
        var days = Math.floor((Date.now() - (lastRead.d || 0)) / 86400000);
        bd.textContent = days <= 0 ? '就是刚刚' : (days === 1 ? '昨天读过' : days + ' 天前读过');
        if (bw) bw.setAttribute('href', lastRead.h);
      }
    } catch (err) {}

    // FLIP：先量起点，搬完量终点，倒放一次 transform 再松手 ——
    // 缩略(0.34)↔台前(1) 的整窗缩放就成了连续动画，而不是瞬移
    function flip(card, mutate) {
      if (reduceMotion) { mutate(); return; }
      var a = card.getBoundingClientRect();
      mutate();
      var b = card.getBoundingClientRect();
      card.style.transition = 'none';
      card.style.transformOrigin = 'top left';
      card.style.transform = 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) scale(' + (a.width / b.width) + ',' + (a.height / b.height) + ')';
      void card.offsetWidth;
      // 摘掉倒放的 transform，靠内联过渡滑回终点态（槽里是 CSS 的 0.34，
      // 台前是 1）。过渡要写成内联而不能清成 '' 交给样式表 ——
      // 否则入场规则的 transition-delay 会拖着这次补间晚半拍才动
      card.style.transform = '';
      card.style.transition = 'transform 0.48s var(--ios-ease-out)';
      after(520, function () { card.style.transition = ''; card.style.transformOrigin = ''; });
    }

    function promote(key, animate) {
      var card = cards[key];
      var slot = slots[key];
      if (!card || !slot || card.parentElement === stage) return;
      var run = function () {
        stage.appendChild(card);
        slot.style.display = 'none';   // 上台前后槽位让位，栏里不留空洞
      };
      if (animate) flip(card, run);
      else run();
      root.dataset.stage = key;
      active = key;
    }

    function collapse(animate) {
      if (!active) return;
      var card = cards[active];
      var slot = slots[active];
      if (card && slot && card.parentElement === stage) {
        var run = function () {
          slot.style.display = '';
          slot.appendChild(card);
        };
        if (animate) flip(card, run);
        else run();
      }
      root.dataset.stage = '';
      active = null;
    }

    // 解锁后默认聚焦「最近更新」——boot 里静默推上去（不动画），
    // pjax 回首页整轮 boot 重跑时，parentElement 判断会挡掉重复推
    promote('latest', false);

    // 点栏里的缩略图 → 整窗放大上台前（拦掉它自带的跳转，
    // 上台前再点里面的链接才走）
    rail.addEventListener('click', function (e) {
      var card = e.target.closest('.widget');
      if (!card || !card.parentElement.classList.contains('sm-slot')) return;
      e.preventDefault();
      promote(card.dataset.stageKey, true);
    });

    // 点背景（桌面空白处）→ 台前的窗口缩回栏里
    var homeEl = $('ios-home');
    if (homeEl) {
      homeEl.addEventListener('click', function (e) {
        if (e.target.closest('.widget') || e.target.closest('.sm-topbar')) return;
        collapse(true);
      });
    }
  }

  // ------------------------------------------------------------
  // 控制中心
  // ------------------------------------------------------------
  function currentTheme() {
    var t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t === 'dark' || t === 'light') return t;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  // 把 <meta name="theme-color"> 一起改掉 —— 浏览器 UI / iOS 状态栏会跟着换色，
  // 否则深色模式下浏览器顶栏还留着一条浅色，很割裂
  function syncThemeColor() {
    var mc = $('meta-theme-color');
    if (mc) mc.setAttribute('content', document.documentElement.dataset.theme === 'dark' ? '#1c1e22' : '#fcfcfa');
  }

  function applyTheme(next, remember) {
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    if (remember !== false) { try { localStorage.setItem('theme', next); } catch (e) {} }
    syncThemeUI();
    syncThemeColor();
    if (state.globe) state.globe.setWall(next === 'dark' ? 'night' : 'day');
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  function syncThemeUI() {
    var t = currentTheme();
    var st = $('cc-theme-state');
    // 太阳 / 月亮图标由 CSS 的 [data-theme] 自动切换，这里只更新文字
    if (st) st.textContent = t === 'dark' ? '已开启' : '已关闭';
  }

  function initControlCenter() {
    var themeBtn = $('cc-theme');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    var lockBtn = $('cc-lock');
    if (lockBtn) lockBtn.addEventListener('click', function () { lock(); });

    var musicBtn = $('cc-music');
    if (musicBtn) {
      musicBtn.addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('awen:music-toggle'));
      });
    }

    var range = $('cc-brightness');
    if (range) {
      range.addEventListener('input', function () {
        root.style.setProperty('--ios-brightness', String(range.value / 100));
      });
    }

    root.addEventListener('click', function (e) {
      if (!root.classList.contains('is-cc')) return;
      if (e.target.closest('.ios-cc')) return;
      if (e.target.closest('#cc-open')) return;
      if (e.target.closest('.ios-statusbar')) return;
      root.classList.remove('is-cc');
    });

    syncThemeUI();
  }

  // ------------------------------------------------------------
  // 音乐：跟随 main.js 的播放状态（灵动岛 + 控制中心）
  // ------------------------------------------------------------
  function initMusicBridge() {
    // 只在「这一趟真的播过」之后才让灵动岛展开：
    // 否则播放器一挂上（曲目预载完成）岛上就冒出个歌名，像出 bug
    var everPlayed = false;

    // 灵动岛能点：有曲目时点它进音乐页（跟 iOS 点灵动岛进 App 一个意思）
    var island = $('ios-island');
    var musicPage = root.dataset.musicPage;
    if (island && musicPage) {
      island.addEventListener('click', function () {
        if (root.classList.contains('has-track')) go(musicPage);
      });
    }

    on(document, 'awen:track', function (e) {
      var d = e.detail || {};
      if (d.playing) everPlayed = true;
      var hasTrack = !!d.name && everPlayed;
      root.classList.toggle('is-playing', !!d.playing);
      // 播过之后暂停也保留曲名（跟 iOS 一样），只是少了呼吸绿点
      root.classList.toggle('has-track', hasTrack);
      setText($('island-text'), hasTrack ? d.name + (d.artist ? ' · ' + d.artist : '') : '');
      setText($('cc-music-state'), hasTrack ? (d.playing ? '正在播放' : '已暂停') : '未播放');
    });
  }

  // ------------------------------------------------------------
  // Spotlight 搜索：主屏向下拉 / ⌘K / Ctrl+K / 斜杠 唤出
  // 索引来自 hexo-generator-searchdb 生成的 search.json（首页才请求）
  // ------------------------------------------------------------
  function initSearch() {
    var panel = $('ios-search');
    var input = $('search-input');
    var cancelBtn = $('search-cancel');
    var list = $('search-results');
    var emptyEl = $('search-empty');
    var indexUrl = root.dataset.search;
    if (!panel || !input || !list || !indexUrl) return;

    var posts = null;
    var loading = false;
    var results = [];
    var active = -1;

    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
    }
    function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function open() {
      if (root.classList.contains('is-search')) return;
      root.classList.remove('is-cc');
      root.classList.add('is-search');
      loadIndex(function () { render(input.value.trim()); });
      after(80, function () { try { input.focus(); } catch (e) {} });
    }

    function close() {
      if (!root.classList.contains('is-search')) return;
      root.classList.remove('is-search');
      input.value = '';
      list.innerHTML = '';
      if (emptyEl) emptyEl.hidden = true;
      active = -1;
      results = [];
      try { input.blur(); } catch (e) {}
      // 焦点交回主屏（先解除 inert），键盘再按 Tab 才是从主屏继续。
      // 锁屏时不抢焦点 —— 那时主屏整个是 inert 的，抢也抢不到。
      syncA11y();
      var homeEl = $('ios-home');
      if (homeEl && root.classList.contains('is-home')) {
        try { homeEl.focus({ preventScroll: true }); } catch (e) {}
      }
    }

    function loadIndex(done) {
      if (posts) { done(); return; }
      if (loading) return;
      loading = true;
      fetch(indexUrl).then(function (r) { return r.json(); }).then(function (data) {
        posts = (Array.isArray(data) ? data : []).map(function (p) {
          return {
            title: p.title || '',
            url: p.url || '',
            content: String(p.content || '').replace(/\s+/g, ' ').trim()
          };
        });
        loading = false;
        done();
      }).catch(function () {
        posts = [];          // 索引拉不到就当没结果，别让面板一直空转
        loading = false;
        done();
      });
    }

    function score(p, tokens, q) {
      var title = p.title.toLowerCase();
      var body = p.content.toLowerCase();
      var s = 0;
      for (var i = 0; i < tokens.length; i++) {
        var hitTitle = title.indexOf(tokens[i]) >= 0;
        var hitBody = body.indexOf(tokens[i]) >= 0;
        if (!hitTitle && !hitBody) return -1;    // 有一个词没命中就不算
        if (hitTitle) s += 20 + (title.indexOf(tokens[i]) === 0 ? 8 : 0);
        if (hitBody) s += 3;
      }
      if (q && title.indexOf(q) >= 0) s += 30;   // 整串命中标题再加权
      return s;
    }

    function snippet(p, tokens) {
      var text = p.content;
      var lower = text.toLowerCase();
      var at = -1;
      for (var i = 0; i < tokens.length; i++) {
        var pos = lower.indexOf(tokens[i]);
        if (pos >= 0 && (at < 0 || pos < at)) at = pos;
      }
      if (at < 0) return text.slice(0, 70);
      var from = Math.max(0, at - 22);
      return (from > 0 ? '…' : '') + text.slice(from, from + 70);
    }

    /* 先转义再插 <mark>：用不可见占位符隔开，避免二次替换把标签也标进去 */
    function mark(text, tokens) {
      var out = esc(text);
      for (var i = 0; i < tokens.length; i++) {
        if (!tokens[i]) continue;
        out = out.replace(new RegExp(escRe(tokens[i]), 'gi'), function (m) {
          return '\u0001' + m + '\u0002';
        });
      }
      return out.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>')
                .replace(/<mark>(\s*)<\/mark>/g, '$1');
    }

    function render(q) {
      var tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
      results = [];
      if (posts && posts.length && tokens.length) {
        var scored = [];
        for (var i = 0; i < posts.length; i++) {
          var s = score(posts[i], tokens, q.toLowerCase());
          if (s > 0) scored.push({ p: posts[i], s: s });
        }
        scored.sort(function (a, b) { return b.s - a.s; });
        results = scored.slice(0, 8).map(function (x) { return x.p; });
      }
      active = results.length ? 0 : -1;
      list.innerHTML = results.map(function (p, i) {
        return '<button class="search-item' + (i === 0 ? ' is-active' : '') + '" type="button" role="option"' +
          ' aria-selected="' + (i === 0 ? 'true' : 'false') + '" data-i="' + i + '" data-url="' + esc(p.url) + '">' +
          '<span class="search-item-title">' + mark(p.title, tokens) + '</span>' +
          '<span class="search-item-sub">' + mark(snippet(p, tokens), tokens) + '</span>' +
          '</button>';
      }).join('');
      if (emptyEl) emptyEl.hidden = !(posts && q && !results.length);
      input.setAttribute('aria-expanded', results.length ? 'true' : 'false');
    }

    function move(delta) {
      if (!results.length) return;
      active = (active + delta + results.length) % results.length;
      var items = list.children;
      for (var i = 0; i < items.length; i++) {
        var on = i === active;
        items[i].classList.toggle('is-active', on);
        items[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      var el = items[active];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    function go(i) {
      var p = results[i];
      if (p && p.url) navTo(p.url);
    }

    // 搜索结果也想享受无刷翻页（音乐不断）—— 但这里的函数名 go 被占了，
    // 单独走这个别名
    function navTo(url) {
      if (window.awenNavigate) window.awenNavigate(url);
      else window.location.href = url;
    }

    input.addEventListener('input', function () { render(input.value.trim()); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); go(active < 0 ? 0 : active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    list.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.search-item') : null;
      if (item) go(parseInt(item.getAttribute('data-i'), 10));
    });
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    // 回到锁屏时把搜索一并关掉，别让面板残留在锁屏上
    on(document, 'awen:lock', close);

    // 点面板空白处（结果区之外）收起
    panel.addEventListener('click', function (e) {
      if (e.target === panel) close();
    });

    // 主屏向下拉 → 唤出搜索（只在已经滚到顶部时，跟 iOS 一致）
    var home = $('ios-home');
    if (home) {
      var pullId = null, pullY = 0;
      var endPull = function () { pullId = null; };

      home.addEventListener('pointerdown', function (e) {
        if (root.classList.contains('is-search')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (home.scrollTop > 0) return;
        if (e.target.closest && e.target.closest('a, button, input, .widget')) return;
        pullId = e.pointerId;
        pullY = e.clientY;
      });
      home.addEventListener('pointermove', function (e) {
        if (pullId === null || e.pointerId !== pullId) return;
        if (e.clientY - pullY > 56) { pullId = null; open(); }
      });
      home.addEventListener('pointerup', endPull);
      home.addEventListener('pointercancel', endPull);
    }

    on(document, 'keydown', function (e) {
      var k = e.key;
      // Esc 关搜索：不只挂在输入框上 —— 用户点过别处之后焦点就不在框里了，
      // 那时按 Esc 也得能收起来
      if (k === 'Escape' && root.classList.contains('is-search')) {
        e.preventDefault();
        close();
        return;
      }
      if ((k === 'k' || k === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        if (root.classList.contains('is-search')) close(); else open();
        return;
      }
      if (k === '/' && !root.classList.contains('is-search') && !isLocked()) {
        e.preventDefault();
        open();
      }
    });
  }

  // ------------------------------------------------------------
  // 文档 App 外壳：返回 / 阅读模式 / 点状态栏回顶部
  // ------------------------------------------------------------
  function initDocShell() {
    var screen = $('ios-screen');

    // 记下「当前浏览」：首页调度栏的那张卡靠它回显（标题 + 路径 + 时间）
    try {
      localStorage.setItem('awen-last-read', JSON.stringify({
        t: (document.querySelector('.post-title') || {}).textContent || document.title,
        h: window.location.pathname,
        d: Date.now()
      }));
    } catch (err) {}

    // 入场过渡：点 App 进来时（awenDocEnter 标记）播一次淡入上移；
    // 后退 / 站内翻页 / 直接甩链接过来都不播 —— 那是「回内容」，不该再闪。
    if (!window.awenDocEnter) root.classList.add('no-doc-enter');
    window.awenDocEnter = false;

    var back = $('ab-back');
    if (back) {
      back.addEventListener('click', function () {
        // 无刷翻页时 referrer 不会变，得看 pjax 留下的标记（同上）
        var fromSelf = !!window.awenPjaxed ||
          (document.referrer && document.referrer.indexOf(window.location.origin) === 0);
        // 站内点进来的就退回上一页；直接把链接甩过来的回主屏
        if (fromSelf && window.history.length > 1) window.history.back();
        else go(root.dataset.home || '/');
      });
    }

    // 点状态栏 = 回到顶部（iPadOS 的老习惯）
    var sb = root.querySelector('.ios-statusbar');
    if (sb && screen) {
      sb.addEventListener('click', function () {
        screen.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }
  }

  // ------------------------------------------------------------
  // 全站胶囊播放器：文档页里请它进平板
  // 直接浮在 body 上是以视口左下角定位的 —— 桌上那台闹钟正好在那儿。
  // ≥1024px 把它挂进应用栏；窄屏整条应用栏是 display:none，
  // 挂进去等于把它藏了，所以窄屏留在 body 上（原来的左下角胶囊）。
  // 只搬节点，不重建 DOM：main.js 的 mountMusic 早就把它初始化好了。
  // ------------------------------------------------------------
  function initDocMusic() {
    var el = document.querySelector('.music-root[data-mode="global"]');
    var bar = document.querySelector('.ios-appbar .ab-actions');
    if (!el || !bar) return;

    var home = el.parentNode;
    var mq = window.matchMedia('(min-width: 1024px)');

    function place() {
      if (mq.matches) {
        if (el.parentNode !== bar) bar.appendChild(el);
      } else if (home && el.parentNode !== home) {
        home.appendChild(el);
      }
    }

    place();
    onMQ(mq, place);
  }

  // ------------------------------------------------------------
  // 可访问性：让「当前看不见的那一层」退出键盘 Tab 顺序
  //
  // 这套界面靠 opacity / visibility 切换层，但这两者都**不影响焦点顺序**：
  // 锁屏时按 Tab 会跳进主屏那些看不见的图标，解锁后又会继续 Tab 回锁屏按钮。
  // inert 会把整棵子树同时从焦点顺序和读屏树里摘掉，是这里最对症的做法
  //（Chromium 102+ / Safari 15.5+ / Firefox 112+ 均已支持）。
  // ------------------------------------------------------------
  function setInert(el, on) {
    if (!el) return;
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }

  function syncA11y() {
    if (isDoc) return;                                   // 文档页没有这几层
    var home = root.classList.contains('is-home');
    var cc = root.classList.contains('is-cc');
    var search = root.classList.contains('is-search');
    var busy = cc || search;                             // 有浮层压在主屏上

    var lock = $('ios-lock');
    var homeEl = $('ios-home');
    var ccEl = $('ios-cc');
    var searchEl = $('ios-search');

    setInert(lock, home);                                // 解锁后，锁屏整层屏蔽
    setInert(homeEl, !home || busy);                     // 没解锁 / 有浮层时，主屏屏蔽
    setInert(ccEl, !cc);
    setInert(searchEl, !search);

    // 同时给读屏一个明确的可见性信号（inert 已覆盖，显式声明更保险）
    if (lock) lock.setAttribute('aria-hidden', home ? 'true' : 'false');
    if (homeEl) homeEl.setAttribute('aria-hidden', (home && !busy) ? 'false' : 'true');
    if (ccEl) ccEl.setAttribute('aria-hidden', cc ? 'false' : 'true');
    if (searchEl) searchEl.setAttribute('aria-hidden', search ? 'false' : 'true');

    var ccBtn = $('cc-open');
    if (ccBtn) ccBtn.setAttribute('aria-expanded', cc ? 'true' : 'false');
  }

  function initA11y() {
    if (isDoc) return;
    syncA11y();
    // 所有层状态都落在 #ios 的 class 上，盯住它一处就够 ——
    // 不用再去每个开关点（解锁 / 控制中心 / 搜索）手动同步。
    if (window.MutationObserver) {
      makeObserver(syncA11y, root, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // 独立模块（地球与定位 / 桌面道具）在各自文件里注册自己，这里按原来的
  // 时机把它们拉起 —— 传进去的 root / state / 代数都是这一轮全新的，
  // 模块重新跑一遍就行，不用去猜上一页发生过什么。
  function runModule(name) {
    for (var i = 0; i < A.modules.length; i++) {
      if (A.modules[i].name === name) {
        try { A.modules[i].boot({ root: root, state: state, gen: gen, isDoc: isDoc, isPost: root.dataset.post === '1' }); }
        catch (e) { }
        return;
      }
    }
  }

  // ------------------------------------------------------------
  // 启动
  // ------------------------------------------------------------
  function initStartState() {
    // 无刷翻页时 document.referrer 是不会变的（文档根本没重新加载），
    // 所以「是不是从站内过来的」还要看 pjax 留下的这个标记
    var fromSelf = !!window.awenPjaxed ||
      (document.referrer && document.referrer.indexOf(window.location.origin) === 0);
    var unlockedBefore = false;
    try { unlockedBefore = sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) {}

    if (root.dataset.relock !== '0' && fromSelf && unlockedBefore) {
      // 从站内其它页面返回：直接进主屏，不再走解锁
      root.classList.add('no-anim', 'is-home');
      after(80, function () { root.classList.remove('no-anim'); });
    }
  }

  // 时钟对齐到整分再走：每 20 秒刷一次会让锁屏大时间最多慢 20 秒
  function scheduleTick() {
    var now = new Date();
    var delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 25;
    after(delay, function () {
      tick();
      every(60000, tick);
    });
  }

  tick();
  scheduleTick();
  on(document, 'visibilitychange', function () { if (!document.hidden) tick(); });

  if (isDoc) {
    // 文章页：地球「放大贴近 + 壁纸模糊」，化作正文的氛围背景；
    // 列表页（归档/标签/分类…）维持退远慢转。pjax 在文章 ↔ 列表之间
    // 切换时整轮 boot 重跑，地球跟着 toDoc/toHome 缩放，CSS 模糊同步过渡。
    if (root.dataset.post === '1') root.classList.add('is-post');
    initDocShell();
    initDocMusic();
    runModule('globe');      // 文档页也拉地球：退远慢转，当内容的天文背景
  } else {
    initStartState();
    initA11y();
    runModule('globe');      // 定位 + 地球（ios-globe.js）
    initUnlock();
    initStage();
    initControlCenter();
    initMusicBridge();
    initSearch();
  }

  // 用户没手动选过主题时，跟随系统的明暗切换
  //（连地球贴图、theme-color 一起换；手动选过就不再打扰）
  if (window.matchMedia) {
    onMQ(window.matchMedia('(prefers-color-scheme: dark)'), function (e) {
      if (localStorage.getItem('theme')) return;
      applyTheme(e.matches ? 'dark' : 'light', false);   // false = 不写 localStorage
    });
  }

  // 时间走时在 tick() 里已经挂了每秒的 every（见上方 scheduleTick），
  // 这里不再有闹钟 / 唱片机 / 小猫爪这些桌面道具要单独初始化。
  }   // ← boot() 结束

  window.awenIOSBoot = boot;   // 供 pjax.js 翻页后重新初始化
  boot();
})();
