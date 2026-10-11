// ============================================================
// awen 主题 · 桌面道具（拖得动的那几件）
//
// 桌上四件摆件：小闹钟、咖啡杯、绿植、唱片机。这里只管「随手挪位置」：
//   拖起来 → 「拎」起来（放大一点 + 影子拉远 + 跟着甩的方向歪）
//   松手   → 带惯性滑一段，撞到窗口边缘弹回来
//   双击   → 这一件归位；双击空白桌面 → 四件一起归位
//   键盘   → 首页 Tab 到道具上，方向键挪 8px（按住 Shift 挪 40px），回车归位
//   位置存 localStorage，刷新 / 翻页之后还在老地方
//
// 存的是「相对原始布局的偏移」，不是屏幕绝对坐标 —— 这样窗口变大变小
// 的时候，道具会跟着它原本靠着的那条边一起走，不会被甩到屏幕外。
//
// 唯一的外部依赖是内核里的 cleanup（翻页时把还在滑的道具停住）和
// dragGuard（刚拖过的那一下别被当成 click —— 唱片机的单击是播放切换，
// 拖完它不该顺手把音乐停了）。唱片机自己的点击不在这里，在 ios.js。
//
// 本文件只「注册」自己，不主动执行；由 ios.js 在 boot() 里按时机拉起。
// ============================================================
(function () {
  var A = window.AWEN;

  // ctx 目前用不到（桌面道具全在自己那层 DOM 里），留着是为了跟
  // ios-globe.js 保持同一个模块签名
  function bootDesk(ctx) {
    var nodes = document.querySelectorAll('.desk .prop, .stage-front .prop');
    if (!nodes.length) return;

    var POS_KEY = 'awen-desk-pos';
    var KEEP = 0.45;        // 至少留这么大一块在屏幕里，别被拖得没影
    var LIFT_AT = 4;        // 位移超过 4px 才算「拖动」，否则当一次普通点击
    var FRAME = 16;         // 惯性一帧的时间（ms）
    var FRICTION = 0.90;    // 每帧掉多少速度
    var BOUNCE = 0.45;      // 撞到窗口边缘回弹多少
    var MAX_V = 42;         // 甩出去的速度上限（px/帧）：别让杯子飞出宇宙
    var TILT_MAX = 8;       // 拖动时最多歪几度
    var isHomePage = document.body.classList.contains('page-home');

    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch (e) { saved = {}; }

    var items = [];
    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n];
      var it = {
        el: el,
        key: el.id || ('desk-prop-' + n),
        x: 0, y: 0, tilt: 0,
        vx: 0, vy: 0,
        base: null, timer: 0,
        side: null,       // 这一段拖动里它站在平板的哪一边（'l' / 'r'）
        dragging: false,
        kill: []            // 这一次拖动挂在 window 上的那几个监听，松手就摘
      };
      var sp = saved[it.key];
      if (sp && isFinite(sp[0]) && isFinite(sp[1])) { it.x = sp[0]; it.y = sp[1]; }
      items.push(it);
    }

    function paint(it) {
      it.el.style.setProperty('--dx', it.x.toFixed(2) + 'px');
      it.el.style.setProperty('--dy', it.y.toFixed(2) + 'px');
      it.el.style.setProperty('--tilt', it.tilt.toFixed(2) + 'deg');
    }

    // 量「没有偏移时」的位置。整个生命周期里都拿它当基准 ——
    // 拖到一半再量，量到的是已经偏移过的盒子，误差会一次次累积，越拖越飘。
    function measure() {
      var k;
      for (k = 0; k < items.length; k++) {
        items[k].el.classList.add('no-anim');
        items[k].el.style.setProperty('--dx', '0px');
        items[k].el.style.setProperty('--dy', '0px');
        items[k].el.style.setProperty('--tilt', '0deg');
        items[k].el.style.removeProperty('--lift');
      }
      var visible = true;
      for (k = 0; k < items.length; k++) {
        var r = items[k].el.getBoundingClientRect();
        items[k].base = { left: r.left, top: r.top, w: r.width, h: r.height };
        if (!r.width) visible = false;      // 窄屏：整张书桌是 display:none
      }
      for (k = 0; k < items.length; k++) {
        items[k].el.classList.remove('no-anim');
        paint(items[k]);
      }
      return visible;
    }

    function bounds(it) {
      var b = it.base;
      var vw = window.innerWidth, vh = window.innerHeight;
      return {
        minX: -b.w * (1 - KEEP) - b.left,
        maxX: vw - b.w * KEEP - b.left,
        minY: -b.h * (1 - KEEP) - b.top,
        maxY: vh - b.h * KEEP - b.top
      };
    }

    // 平板在桌上占掉的那一大块，对道具来说是「一堵墙」。
    // 为什么非拦不可：桌上的物件 z-index 比平板低，真拖到平板背后就
    // 既看不见、又点不到（指针事件被平板接走了）—— 东西等于丢了。
    // 规则是：竖向和平板重叠时，横向只能待在自己那一侧的墙外；
    // 想换边就得从平板上方 / 下方绕过去（那时竖向不重叠，随便过）。
    function tabletRect() {
      var el = document.getElementById('ios');
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return r.width ? r : null;
    }

    // 站哪边就顺着哪边的墙滑。这一段拖动里定死，不然猛地一甩、
    // 中心点越过中线，东西会「唰」地跳到对面去
    function pushOffTablet(it) {
      var t = tabletRect();
      if (!t || !it.base || !it.base.w) return false;
      var top = it.base.top + it.y;
      if (top + it.base.h <= t.top || top >= t.bottom) return false;   // 在平板上方 / 下方，随便过
      var left = it.base.left + it.x;
      if (left + it.base.w <= t.left || left >= t.right) return false;
      if (!it.side) it.side = (left + it.base.w / 2 < t.left + t.width / 2) ? 'l' : 'r';
      it.x = it.side === 'l'
        ? t.left - it.base.w - it.base.left
        : t.right - it.base.left;
      return true;
    }

    function clamp(it) {
      if (!it.base || !it.base.w) return;
      var g = bounds(it);
      if (it.x < g.minX) it.x = g.minX;
      if (it.x > g.maxX) it.x = g.maxX;
      if (it.y < g.minY) it.y = g.minY;
      if (it.y > g.maxY) it.y = g.maxY;
      pushOffTablet(it);
    }

    function save() {
      var out = {};
      for (var s = 0; s < items.length; s++) {
        out[items[s].key] = [Math.round(items[s].x), Math.round(items[s].y)];
      }
      try { localStorage.setItem(POS_KEY, JSON.stringify(out)); } catch (e) {}
    }

    // 惯性用 setTimeout 而不是 requestAnimationFrame —— rAF 只在浏览器
    // 真的产出一帧的时候才回调（后台标签页、无头浏览器里会直接停摆），
    // 那种情况下道具会永远卡在「被拎着」的状态，还不会存档。
    function halt(it) {
      if (it.timer) { clearTimeout(it.timer); it.timer = 0; }
      it.vx = 0; it.vy = 0;
    }

    function unhook(it) {
      for (var k = 0; k < it.kill.length; k++) it.kill[k]();
      it.kill.length = 0;
    }

    // 先把状态摆成「停在原地」，再 paint —— 过渡是开着的，于是自己滑回去
    function park(it) {
      halt(it);
      unhook(it);
      it.dragging = false;
      it.el.classList.remove('is-dragging');
      it.el.style.setProperty('--lift', '1');
      it.x = 0; it.y = 0; it.tilt = 0;
      paint(it);
    }

    function settle(it) {
      it.timer = 0; it.vx = 0; it.vy = 0; it.tilt = 0;
      it.dragging = false;
      it.el.classList.remove('is-dragging');
      it.el.style.setProperty('--lift', '1');   // 过渡回来了，轻轻「落」回桌面
      paint(it);
      save();
    }

    function fling(it) {
      (function step() {
        it.vx *= FRICTION;
        it.vy *= FRICTION;
        it.x += it.vx;
        it.y += it.vy;
        var g = bounds(it);
        if (it.x < g.minX) { it.x = g.minX; it.vx = -it.vx * BOUNCE; }
        else if (it.x > g.maxX) { it.x = g.maxX; it.vx = -it.vx * BOUNCE; }
        if (it.y < g.minY) { it.y = g.minY; it.vy = -it.vy * BOUNCE; }
        else if (it.y > g.maxY) { it.y = g.maxY; it.vy = -it.vy * BOUNCE; }
        // 滑着滑着撞上平板这堵墙，也弹回来
        if (pushOffTablet(it)) {
          if ((it.side === 'l' && it.vx > 0) || (it.side === 'r' && it.vx < 0)) {
            it.vx = -it.vx * BOUNCE;
          }
        }
        it.tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, it.vx * 1.1));
        paint(it);
        if (Math.abs(it.vx) < 0.35 && Math.abs(it.vy) < 0.35) { settle(it); return; }
        it.timer = setTimeout(step, FRAME);
      })();
    }

    // 翻页时把还在滑的道具停住（它的 DOM 马上就要被丢掉了）
    A.cleanup.push(function () {
      for (var h = 0; h < items.length; h++) halt(items[h]);
    });

    function winOn(type, fn) {
      window.addEventListener(type, fn);
      return function () { window.removeEventListener(type, fn); };
    }

    if (!measure()) return;     // 书桌没显示（窄屏），量不出东西，也不用挂监听
    for (var q = 0; q < items.length; q++) { clamp(items[q]); paint(items[q]); }

    items.forEach(function (it) {
      var el = it.el;
      var pid = null, sx = 0, sy = 0, ox = 0, oy = 0, moved = false, samples = [];

      function onMove(e) {
        if (pid === null || e.pointerId !== pid) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved) {
          if (Math.abs(dx) + Math.abs(dy) < LIFT_AT) return;
          moved = true;
          it.dragging = true;
          halt(it);
          el.classList.add('is-dragging');
          el.style.setProperty('--lift', '1.06');
        }
        it.x = ox + dx;
        it.y = oy + dy;
        clamp(it);

        var now = e.timeStamp || Date.now();
        samples.push({ t: now, x: e.clientX, y: e.clientY });
        while (samples.length > 2 && now - samples[0].t > 120) samples.shift();
        // 倾斜照着「最近这一段的速度」来，不是照总位移 —— 不然甩到一半
        // 停下来，东西还会一直歪着
        var len = samples.length;
        if (len >= 2) {
          var s1 = samples[len - 1], s0 = samples[len - 2];
          var dt = Math.max(s1.t - s0.t, 1);
          it.tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, (s1.x - s0.x) / dt * 16.7 * 0.45));
        }
        paint(it);
        if (e.cancelable) e.preventDefault();   // 别顺手选中页面上的文字
      }

      function onUp(e) {
        if (pid === null || e.pointerId !== pid) return;
        pid = null;
        unhook(it);
        if (!moved) { it.dragging = false; return; }   // 只是点了一下，交给 click 处理

        A.dragGuard.ts = Date.now();

        // 从最近 120ms 的采样里估一个「每帧多少像素」的初速度
        var len = samples.length, vx = 0, vy = 0;
        if (len >= 2) {
          var a = samples[0], b = samples[len - 1];
          var dt = b.t - a.t;
          if (dt > 0) { vx = (b.x - a.x) / dt * 16.7; vy = (b.y - a.y) / dt * 16.7; }
        }
        var sp = Math.sqrt(vx * vx + vy * vy);
        if (sp > MAX_V) { vx = vx / sp * MAX_V; vy = vy / sp * MAX_V; }
        if (sp < 0.6) { settle(it); return; }          // 轻轻放下，就不甩了
        it.vx = vx; it.vy = vy;
        fling(it);
      }

      A.on(el, 'pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        halt(it);                                  // 还在滑就一把按住
        pid = e.pointerId;
        sx = e.clientX; sy = e.clientY;
        ox = it.x; oy = it.y;
        it.side = null;                            // 这一段拖动重新判定站在平板哪边
        moved = false;
        samples = [{ t: e.timeStamp || Date.now(), x: e.clientX, y: e.clientY }];
        it.kill.push(winOn('pointermove', onMove), winOn('pointerup', onUp), winOn('pointercancel', onUp));
      });

      A.on(el, 'dblclick', function (e) {
        if (Date.now() - A.dragGuard.ts < 420) return;    // 刚拖过，别把收尾当双击
        e.preventDefault();
        e.stopPropagation();                            // 别顺手触发「全部归位」
        park(it);
        save();
      });

      // 键盘：只有首页把道具放进 Tab 序列。文章页读正文时先撞上四个摆件
      // 太打扰，而键盘用户本来就碰不到它们（拖不动 = 也不需要用）。
      if (isHomePage) {
        el.setAttribute('tabindex', '0');
        A.on(el, 'keydown', function (e) {
          if (e.target !== el) return;                  // 唱片机里那个播放键的 Enter 别抢
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          var k = e.key;
          if (k === 'Enter' || k === ' ') {
            e.preventDefault();
            park(it);
            save();
            return;
          }
          var step = e.shiftKey ? 40 : 8;
          if (k === 'ArrowLeft') it.x -= step;
          else if (k === 'ArrowRight') it.x += step;
          else if (k === 'ArrowUp') it.y -= step;
          else if (k === 'ArrowDown') it.y += step;
          else return;
          e.preventDefault();
          halt(it);
          clamp(it);
          paint(it);
          save();
        });
      }
    });

    // 双击空白桌面 = 全部归位。桌面这层是 pointer-events:none，空白处点不到，
    // 所以挂在 document 上，再把自己人（道具 / 链接 / 按钮 / 小组件）排掉。
    A.on(document, 'dblclick', function (e) {
      if (Date.now() - A.dragGuard.ts < 420) return;
      var t = e.target;
      if (t && t.closest && t.closest('.prop, a, button, input, textarea, select, .widget, .home-app, .dock-app, .cc-tile')) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length) return;            // 人家在选文字，别捣乱
      var moved = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].x || items[i].y) { park(items[i]); moved = true; }
      }
      if (moved) save();
    });

    // 窗口一变大小，基准位置就变了 —— 重新量一遍，顺手把跑到屏幕外的拉回来
    A.on(window, 'resize', function () {
      if (!measure()) return;
      for (var i = 0; i < items.length; i++) { clamp(items[i]); paint(items[i]); }
    });
  }

  A.register('desk', bootDesk);
})();
