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
// 外壳拆成四个文件（都是 defer，按下面的顺序加载）：
//   ios-core.js   内核：收尾登记簿、on / every / after、$、拖动守卫
//   ios-globe.js  地球与定位（锁屏背后那颗 WebGL 地球 + IP 定位）
//   ios-desk.js   桌面道具拖拽（闹钟 / 咖啡杯 / 绿植 / 唱片机）
//   ios.js        本文件：外壳编排 —— 锁屏解锁、主屏 App、主题切换、
//                 控制中心、音乐桥、小猫伸爪、搜索面板、唱片机点击、
//                 文档壳、无障碍分层、启动时序
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
  var dragGuard = A.dragGuard;

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

  // 由 initCatPaw 填上，供搜索面板在打开时把爪子收回去
  var pawApi = null;

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
    tickClock(d);
  }

  // ------------------------------------------------------------
  // 桌上的闹钟：秒针每秒跳一下（机械钟本来就该一格一格走）
  // 用 SVG 的 transform 属性而不是 CSS transform —— 属性不会补间
  // ------------------------------------------------------------
  var CLOCK_C = ' 70 86';   // 表盘圆心，跟 prop-clock.ejs 里的坐标一致

  function tickClock(d) {
    var h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();

    var eh = $('pc-h');
    if (eh) eh.setAttribute('transform', 'rotate(' + ((h + m / 60) * 30).toFixed(2) + CLOCK_C + ')');

    var em = $('pc-m');
    if (em) em.setAttribute('transform', 'rotate(' + ((m + s / 60) * 6).toFixed(2) + CLOCK_C + ')');

    var es = $('pc-s');
    if (es) es.setAttribute('transform', 'rotate(' + (s * 6).toFixed(2) + CLOCK_C + ')');

    setText($('pc-date'), (d.getMonth() + 1) + '月' + d.getDate() + '日');
    setText($('pc-week'), WEEK[d.getDay()]);
  }

  // 闹钟只在桌面端露出来（窄屏 .stage-front 是 display:none），
  // 所以每秒醒来一次之前先看一眼它到底在不在
  function clockOnScreen() {
    var el = $('prop-clock');
    return !!el && el.offsetParent !== null;
  }

  function initClock() {
    tickClock(new Date());
    every(1000, function () {
      if (clockOnScreen()) tickClock(new Date());
    });
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
    // 主屏壁纸是压暗 + 模糊的，地球继续每帧渲染纯属白烧电，直接停
    if (state.globe) state.globe.pause();
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
    // is-game 也在这里收掉：小游戏面板不该跟着回锁屏
    root.classList.remove('is-opening', 'is-cc', 'is-search', 'is-game');
    if (state.globe) state.globe.resume();
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
  // App 图标：打开动画 + 锁屏动作
  // ------------------------------------------------------------
  function initApps() {
    var apps = root.querySelectorAll('.home-app, .dock-app');
    Array.prototype.forEach.call(apps, function (a) {
      a.addEventListener('click', function (e) {
        if (a.dataset.action === 'lock') {
          e.preventDefault();
          lock();
          return;
        }
        if (a.dataset.action === 'theme') {
          e.preventDefault();
          toggleTheme();
          return;
        }
        // 小游戏：不跳页面，就地开一块全屏面板（玩法在 /js/games.js）
        if (a.dataset.action === 'game') {
          e.preventDefault();
          if (window.awenGameOpen) window.awenGameOpen(a.dataset.game || 'cat');
          return;
        }
        if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || reduceMotion) return;
        if (!a.href) return;

        e.preventDefault();
        var icon = a.querySelector('.app-icon') || a;
        var ir = icon.getBoundingClientRect();
        var hr = root.getBoundingClientRect();
        root.style.setProperty('--ox', (ir.left + ir.width / 2 - hr.left) + 'px');
        root.style.setProperty('--oy', (ir.top + ir.height / 2 - hr.top) + 'px');
        root.style.setProperty('--oc', a.dataset.color || '#3a7ca5');
        root.classList.add('is-opening');
        // 走 pjax 的通道：不然这里 window.location.href 一赋值，
        // 整个文档重新加载，音乐就断了 —— 打开动画白做
        after(280, function () { go(a.href); });
      });
    });
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
  // 小猫爪：每次点击屏幕，小猫伸爪从右下角按过来
  // 爪子落在触点位置（带一点随位移的旋转），按一下再缩回去
  // ------------------------------------------------------------
  function initCatPaw() {
    var paw = $('cat-paw');
    var layer = $('paw-ripples');
    if (!paw || !layer) return;

    var IN_MS = 170;     // 伸进来
    var TAP_MS = 300;    // 按住
    var inTimer = null, pressTimer = null, outTimer = null;

    function retract() {
      clearTimeout(inTimer);
      clearTimeout(pressTimer);
      clearTimeout(outTimer);
      paw.classList.remove('is-in', 'is-press');
    }

    function ripple(x, y) {
      while (layer.childElementCount > 4) layer.removeChild(layer.firstChild);
      var r = document.createElement('span');
      r.className = 'paw-ripple';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      layer.appendChild(r);
      void r.offsetWidth;
      r.classList.add('go');
      r.addEventListener('animationend', function () { r.remove(); });
    }

    function tapAt(x, y) {
      var w = root.clientWidth || root.offsetWidth;
      var h = root.clientHeight || root.offsetHeight;
      if (!w || !h) return;

      // 触点留一点边距，别让爪子贴边
      var px = Math.max(w * 0.08, Math.min(x, w * 0.92));
      var py = Math.max(h * 0.05, Math.min(y, h * 0.95));
      var dx = (w + 90) - px;     // 收纳位置：屏幕右下角外面
      var dy = (h + 90) - py;
      var rot = Math.max(-15, Math.min(15, (px - w / 2) / w * 26));

      paw.style.left = px + 'px';
      paw.style.top = py + 'px';
      paw.style.setProperty('--pdx', Math.round(dx) + 'px');
      paw.style.setProperty('--pdy', Math.round(dy) + 'px');
      paw.style.setProperty('--prot', rot.toFixed(1) + 'deg');

      clearTimeout(inTimer);
      clearTimeout(pressTimer);
      clearTimeout(outTimer);
      paw.classList.remove('is-in', 'is-press');
      void paw.offsetWidth;                 // 强制重排，让过渡从头播一遍
      paw.classList.add('is-in');
      inTimer = setTimeout(function () { paw.classList.add('is-press'); }, IN_MS);
      outTimer = setTimeout(function () { paw.classList.remove('is-in', 'is-press'); }, TAP_MS);
      ripple(px, py);
    }

    function pointTo(rootRect, clientX, clientY) {
      return {
        x: clientX - rootRect.left,
        y: clientY - rootRect.top,
        inside: clientX >= rootRect.left && clientX <= rootRect.right &&
                clientY >= rootRect.top && clientY <= rootRect.bottom
      };
    }

    // 只对「点」伸爪：手指一移动（滚主屏、拖进度条、熄屏手势）就立刻收回去
    var MOVE_LIMIT = 10;   // px
    var tapId = null, fromX = 0, fromY = 0;

    // 拖进度条 / 调音量 / 拉亮度时别伸爪（这些是要拖的，不是「点」）
    var NO_PAW = '.mp-bar, .mp-vol, input[type="range"], .cc-slider';

    root.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;   // 只认左键
      if (e.target.closest && e.target.closest(NO_PAW)) return;
      var p = pointTo(root.getBoundingClientRect(), e.clientX, e.clientY);
      if (!p.inside) return;
      tapId = e.pointerId;
      fromX = e.clientX;
      fromY = e.clientY;
      tapAt(p.x, p.y);
    }, true);

    root.addEventListener('pointermove', function (e) {
      if (tapId === null || e.pointerId !== tapId) return;
      if (Math.abs(e.clientX - fromX) > MOVE_LIMIT || Math.abs(e.clientY - fromY) > MOVE_LIMIT) {
        tapId = null;
        retract();
      }
    }, true);

    on(window, 'pointerup', function () { tapId = null; }, true);
    on(window, 'pointercancel', function () { tapId = null; retract(); }, true);

    // 锁屏放着不动，小猫会自己伸爪拍一下（每页只来一次，别烦人）
    if (root.dataset.pawIdle !== '0' && !reduceMotion) {
      after(15000, function () {
        if (document.hidden || !isLocked()) return;
        var w = root.clientWidth || root.offsetWidth;
        var h = root.clientHeight || root.offsetHeight;
        tapAt(w * (0.42 + Math.random() * 0.22), h * (0.34 + Math.random() * 0.1));
      }, 15000);
    }

    // 供外部（比如键盘操作）主动逗一下猫
    on(document, 'awen:paw', function () {
      var w = root.clientWidth || root.offsetWidth;
      var h = root.clientHeight || root.offsetHeight;
      tapAt(w * 0.5, h * 0.45);
    });

    pawApi = { retract: retract };
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
      if (pawApi) pawApi.retract();
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
  // 桌上那台唱片机
  // 曲名 / 封面 / 播放态全来自 main.js 派发的 awen:track；
  // 点一下则把 awen:music-toggle 丢回去，跟控制中心走同一条路
  // ------------------------------------------------------------
  function initVinyl() {
    var prop = $('prop-vinyl');
    if (!prop) return;

    var toggle = $('vinyl-toggle');
    var label = $('vinyl-label');
    var title = $('vinyl-title');
    var artist = $('vinyl-artist');
    var prog = $('vinyl-prog');

    if (toggle) {
      var clickTimer = null;
      cleanup.push(function () { if (clickTimer) clearTimeout(clickTimer); });
      // 这个按钮身兼两职：单击 = 播放 / 暂停，双击 = 把整台机器放回原位。
      // 双击的第二下带 detail === 2，靠它把第一下排下的「切换」撤销掉；
      // 也正是因为要等这一下，切换本身往后推 230ms —— 对一台本来就要
      // 花 0.8 秒把唱臂挪过去的机器来说，这点延迟反而更像真的。
      toggle.addEventListener('click', function (e) {
        if (Date.now() - dragGuard.ts < 420) return;   // 刚拖完，这一下不算点击
        clearTimeout(clickTimer);
        clickTimer = null;
        if (e.detail > 1) return;                      // 双击的第二下
        clickTimer = setTimeout(function () {
          clickTimer = null;
          document.dispatchEvent(new CustomEvent('awen:music-toggle'));
        }, 230);
      });
    }

    // 药丸底边那条 2px 的进度线：main.js 只在 play/pause 时广播 awen:track，
    // 不会每个 timeupdate 都喊一嗓子，所以这里自己每秒看一眼那台全局 <audio>。
    // 拿不到（接口还没回、翻页重建中）就归零，不报错。
    if (prog) {
      every(1000, function () {
        var a = window.MUSIC && window.MUSIC.audio;
        if (!a || !isFinite(a.duration) || a.duration <= 0) {
          if (prog.style.width !== '0%') prog.style.width = '0%';
          return;
        }
        prog.style.width = (a.currentTime / a.duration * 100).toFixed(2) + '%';
      });
    }

    on(document, 'awen:track', function (e) {
      var d = e.detail || {};
      var playing = !!d.playing;

      prop.classList.toggle('is-playing', playing);
      if (toggle) toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');

      // 有曲目了才让那块「曲名 / 歌手」药丸常驻（没曲目时只在悬停时露脸）
      if (d.name) {
        setText(title, d.name);
        setText(artist, d.artist || '');
        prop.classList.add('has-track');
      }

      // 封面走 CSS 背景图：播放器那张 <img> 是 loading="lazy" 且容器 hidden，
      // 很可能永远不加载，所以直接用事件里带过来的地址
      if (label && d.pic) label.style.backgroundImage = 'url("' + d.pic + '")';
    });
  }

  // ------------------------------------------------------------
  // 文档 App 外壳：返回 / 阅读模式 / 点状态栏回顶部
  // ------------------------------------------------------------
  function initDocShell() {
    var screen = $('ios-screen');
    var READING_KEY = 'awen-ios-reading';

    function setReading(on) {
      document.body.classList.toggle('is-reading', on);
      var btn = $('ab-reading');
      if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      try { sessionStorage.setItem(READING_KEY, on ? '1' : '0'); } catch (err) {}
      if (on && screen) screen.scrollTop = 0;
    }

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

    var rbtn = $('ab-reading');
    if (rbtn) rbtn.addEventListener('click', function () {
      setReading(!document.body.classList.contains('is-reading'));
    });

    // 上次进过阅读模式就接着用（刷新不该把它抖回去）
    var remembered = false;
    try { remembered = sessionStorage.getItem(READING_KEY) === '1'; } catch (err) {}
    if (remembered) setReading(true);

    on(document, 'keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setReading(!document.body.classList.contains('is-reading'));
      } else if (e.key === 'Escape' && document.body.classList.contains('is-reading')) {
        setReading(false);
      }
    });

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
    var game = root.classList.contains('is-game');
    var busy = cc || search || game;                     // 有浮层压在主屏上

    var lock = $('ios-lock');
    var homeEl = $('ios-home');
    var dock = root.querySelector('.home-dock');
    var ccEl = $('ios-cc');
    var searchEl = $('ios-search');
    var gameEl = $('ios-game');

    setInert(lock, home);                                // 解锁后，锁屏整层屏蔽
    setInert(homeEl, !home || busy);                     // 没解锁 / 有浮层时，主屏屏蔽
    setInert(dock, !home || busy);                       // Dock 跟着主屏走
    setInert(ccEl, !cc);
    setInert(searchEl, !search);
    setInert(gameEl, !game);

    // 同时给读屏一个明确的可见性信号（inert 已覆盖，显式声明更保险）
    if (lock) lock.setAttribute('aria-hidden', home ? 'true' : 'false');
    if (homeEl) homeEl.setAttribute('aria-hidden', (home && !busy) ? 'false' : 'true');
    if (ccEl) ccEl.setAttribute('aria-hidden', cc ? 'false' : 'true');
    if (searchEl) searchEl.setAttribute('aria-hidden', search ? 'false' : 'true');
    if (gameEl) gameEl.setAttribute('aria-hidden', game ? 'false' : 'true');

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
        try { A.modules[i].boot({ root: root, state: state, gen: gen, isDoc: isDoc }); }
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
    initDocShell();
    initDocMusic();
  } else {
    initStartState();
    initA11y();
    runModule('globe');      // 定位 + 地球（ios-globe.js）
    initUnlock();
    initApps();
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

  // 这几样桌面上一直有：闹钟要走时、唱片要能点、四件道具都能拖着挪
  initCatPaw();
  initClock();
  runModule('desk');       // 桌面道具（拖得动的那几件，ios-desk.js）
  initVinyl();

  }   // ← boot() 结束

  window.awenIOSBoot = boot;   // 供 pjax.js 翻页后重新初始化
  boot();
})();
