// ============================================================
// awen 主题 · 主屏小游戏
//
// 入口是主屏上那个 data-action="game" 的 App 图标（见 _config.yml 的
// ios.apps）。ios.js 只管喊一声 window.awenGameOpen()，玩法全在这儿。
//
// 目前一个：逗猫 —— 九宫格洞口里猫爪随机探头，点中得分，连着中
// 加成翻倍；30 秒一局，最高纪录存在本地。
//
// 面板本身写在 layout/partial/game.ejs 里（只在首页渲染），
// 显示 / 隐藏由 #ios 上的 is-game 类控制 —— 跟控制中心、搜索同一套路，
// 于是 ios.js 的 syncA11y() 顺手就把 inert 分层一起管了。
//
// 无刷翻页（pjax）会把整个 <body> 换掉，连面板都是新的，所以这里
// 跟 ios.js 一样写成可以反复 boot() 的形式：每次 boot 先停掉上一份
// DOM 上还在跑的局，再重新指认元素、重新挂监听。
// ============================================================
(function () {
  'use strict';

  var BEST_KEY = 'awen-cat-best';
  var ROUND = 30;                       // 一局多少秒
  var UP_FROM = 1150, UP_TO = 560;      // 猫爪一次探头停留多久（越到后面越短）
  var COMBO_CAP = 5;                    // 连击加成封顶几倍

  // ---------- 命中粒子（毛色系，跟爪子渐变同源） ----------
  // 落点炸一蓬径向粒子：随机角度 + 随机速度往外飞，受重力下落、带阻力、
  // 生命值归零淡出。用单张 canvas（g-fx）画，比 DOM 粒子省太多。
  var FX = {
    colors: ['#f8e7cd', '#f4e0c4', '#d8bb94', '#cfa87c', '#fbc3ca', '#fffaf1'],
    gravity: 0.16,          // 每帧向下加速度
    drag: 0.985,            // 每帧速度衰减（阻力）
    base: 10,               // 基础粒子数
    comboExtra: 4,          // 每级连击多几个
    speed: 7.2              // 初速上限
  };

  var panel = null, root = null, cat = null;
  var fx = null, fxCtx = null;        // 粒子画布
  var parts = [];                     // 活跃粒子
  var fxRAF = 0;                      // rAF 句柄（0 = 没在跑）
  var fxLast = 0;                     // 上一帧时间戳（算 dt 用）
  var reduced = false;                // 系统开了「减少动态效果」就不放粒子
  var holes = [];
  var scoreEl = null, timeEl = null, overEl = null, finalEl = null, bestEl = null;
  var score = 0, combo = 0, left = ROUND, best = readBest();
  var running = false;
  var timers = [];
  var lastFocus = null;

  function $(id) { return document.getElementById(id); }

  function readBest() {
    var v = 0;
    try { v = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { v = 0; }
    return v;
  }

  // 所有定时器都从这儿开，收尾时能一把全清 —— 少一个没清掉的
  // setTimeout，翻页之后就会有一只爪子永远收不回去。
  // 回调触发时顺手把自己从登记表里摘掉（数组里只放数字 id，用原生 indexOf）。
  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timers.indexOf(id);
      if (k >= 0) timers.splice(k, 1);
      if (running || ms === 0) fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function clearAll() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
    running = false;
    for (var j = 0; j < holes.length; j++) {
      var h = holes[j];
      h.dataset.busy = '';
      h.classList.remove('is-up', 'is-hit', 'is-miss');
      var floats = h.querySelectorAll('.g-float');
      for (var f = 0; f < floats.length; f++) {
        if (floats[f].parentNode) floats[f].parentNode.removeChild(floats[f]);
      }
    }
    clearFX();
  }

  // ---------- 命中粒子（canvas） ----------

  // 把画布像素对齐到它的 CSS 尺寸（乘 DPR），否则 Retina 屏上发虚
  function sizeFX() {
    if (!fx) return;
    var r = fx.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    fx.width = Math.max(1, Math.round(r.width * dpr));
    fx.height = Math.max(1, Math.round(r.height * dpr));
    if (fxCtx) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearFX() {
    parts.length = 0;
    if (fx && fxCtx) fxCtx.clearRect(0, 0, fx.width, fx.height);
  }

  function stopFX() {
    if (fxRAF) { cancelAnimationFrame(fxRAF); fxRAF = 0; }
  }

  // 在 stage 坐标系里的 (x, y) 炸一蓬。combo 越高粒子越密、越亮。
  function burst(x, y, combo) {
    if (reduced || !fx || !fxCtx) return;
    var n = FX.base + Math.min(combo || 0, COMBO_CAP) * FX.comboExtra;
    var boost = 1 + Math.min(combo || 0, COMBO_CAP) * 0.16;   // 连击提速
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (0.3 + Math.random() * 0.7) * FX.speed * boost;
      parts.push({
        x: x + (Math.random() - 0.5) * 8,    // 落点散开一点，不是严格一个点
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.72 - 1.6,   // 压扁纵向 + 上偏，像炸毛弹起
        r: 1.8 + Math.random() * 3.2,
        c: FX.colors[Math.floor(Math.random() * FX.colors.length)],
        life: 1,
        decay: 0.016 + Math.random() * 0.022
      });
    }
    if (!fxRAF) fxRAF = requestAnimationFrame(fxTick);   // 懒启动，粒子清空即停
  }

  function fxTick() {
    fxRAF = 0;
    if (!fxCtx) return;
    // dt：这一帧距上一帧多少个「标准帧」。按时间而非按帧衰减 ——
    // 掉帧的设备上粒子也按墙钟时间消散，不会赖着不走。
    var now = Date.now();
    var dt = fxLast ? Math.min((now - fxLast) / 16.7, 3) : 1;
    fxLast = now;
    var dpr = window.devicePixelRatio || 1;
    fxCtx.save();
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxCtx.clearRect(0, 0, fx.width / dpr, fx.height / dpr);
    // lighter：粒子叠加处发亮，才有「爆」的感觉
    fxCtx.globalCompositeOperation = 'lighter';
    var drag = Math.pow(FX.drag, dt);
    var alive = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.vx *= drag;
      p.vy = p.vy * drag + FX.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      alive.push(p);
      fxCtx.globalAlpha = p.life < 0 ? 0 : p.life;
      fxCtx.fillStyle = p.c;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.restore();
    parts = alive;
    if (parts.length) fxRAF = requestAnimationFrame(fxTick);
    else fxLast = 0;                                 // 停表，下一蓬从 dt=1 开始
  }

  // ---------- 一局 ----------

  function start() {
    if (!panel) return;
    clearAll();
    score = 0; combo = 0; left = ROUND; running = true;
    if (scoreEl) scoreEl.textContent = '0';
    if (timeEl) timeEl.textContent = String(ROUND);
    if (overEl) overEl.hidden = true;
    panel.classList.remove('is-hurry');
    // 先给半秒缓一缓，别一进来迎面就是一爪子
    later(tick, 1000);
    later(scheduleSpawn, 700);
  }

  function tick() {
    if (!running) return;
    left--;
    if (timeEl) timeEl.textContent = String(left > 0 ? left : 0);
    if (panel) panel.classList.toggle('is-hurry', left <= 5);
    if (left <= 0) { finish(); return; }
    later(tick, 1000);
  }

  function scheduleSpawn() {
    if (!running) return;
    var t = left / ROUND;                            // 1 → 0，越往后越密
    var delay = (200 + Math.random() * 420) * (0.45 + 0.55 * t);
    later(function () { spawn(); scheduleSpawn(); }, delay);
  }

  function spawn() {
    if (!running) return;
    var free = [];
    for (var i = 0; i < holes.length; i++) {
      if (holes[i].dataset.busy !== '1') free.push(holes[i]);
    }
    if (!free.length) return;
    var h = free[Math.floor(Math.random() * free.length)];
    var up = UP_TO + (UP_FROM - UP_TO) * (left / ROUND);
    h.dataset.busy = '1';
    h.classList.add('is-up');
    later(function () {
      if (h.dataset.busy !== '1' || !running) return;
      h.dataset.busy = '';
      h.classList.remove('is-up');
      combo = 0;                                     // 漏一只，连击断
      h.classList.add('is-miss');
      later(function () { h.classList.remove('is-miss'); }, 320);
    }, Math.round(up));
  }

  function hit(h) {
    if (!h || !running || h.dataset.busy !== '1') return;
    h.dataset.busy = '';
    h.classList.remove('is-up');
    h.classList.add('is-hit');
    later(function () { h.classList.remove('is-hit'); }, 240);

    combo++;
    var gain = 10 * Math.min(combo, COMBO_CAP);
    score += gain;
    if (scoreEl) scoreEl.textContent = String(score);

    var tag = document.createElement('span');
    tag.className = 'g-float';
    tag.textContent = '+' + gain;
    h.appendChild(tag);
    later(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); }, 780);

    // 连击 ≥3 时洞口亮一圈（is-hot），强化「手热了」的反馈
    if (combo >= 3 && !h.classList.contains('is-hot')) {
      h.classList.add('is-hot');
      later(function () { h.classList.remove('is-hot'); }, 460);
    }

    // 命中粒子：落点取洞中心偏上（掌肉位置），连击越高炸得越开
    burstAt(h, combo);
  }

  // 把洞口中心换算到粒子画布坐标系，再炸。
  // 注意 .g-fx 盖的是 .g-stage 而洞口网格 .g-cat 在 stage 里居中，
  // 两者原点不重合 —— 必须相对 canvas 取坐标，否则粒子会整体偏移。
  function burstAt(h, combo) {
    if (!fx) return;
    var sr = fx.getBoundingClientRect();
    var hr = h.getBoundingClientRect();
    var x = hr.left - sr.left + hr.width / 2;
    var y = hr.top - sr.top + hr.height * 0.38;
    burst(x, y, combo);
  }

  function finish() {
    running = false;
    clearAll();
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    if (finalEl) finalEl.textContent = String(score);
    if (bestEl) bestEl.textContent = String(best);
    if (overEl) overEl.hidden = false;
    if (panel) panel.classList.remove('is-hurry');
  }

  // ---------- 开 / 关 ----------

  function open(name) {
    if (!panel || !root) return;
    if ((name || 'cat') !== 'cat') return;            // 目前只有「逗猫」这一个
    if (root.classList.contains('is-game')) return;
    lastFocus = document.activeElement;
    root.classList.add('is-game');
    start();
    // 焦点交给第一个洞口：键盘用户 Tab / Enter 直接能用，
    // 鼠标用户不会看到焦点圈（:focus-visible 只认键盘）
    later(function () { try { holes[0].focus(); } catch (e) {} }, 340);
  }

  function close() {
    if (!root || !root.classList.contains('is-game')) return;
    clearAll();
    root.classList.remove('is-game');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  // ---------- 挂载（每次换 DOM 都要重来一遍） ----------

  function boot() {
    clearAll();                                       // 上一份 DOM 上的局先停掉

    panel = $('ios-game');
    root = $('ios');
    cat = panel ? panel.querySelector('.g-cat') : null;
    holes = [];
    scoreEl = timeEl = overEl = finalEl = bestEl = null;

    if (!panel || !root || !cat) return;              // 不是首页 / 没开小游戏

    // 粒子层：跟着游戏面板走，尺寸对齐它（含 DPR）
    fx = $('g-fx');
    fxCtx = fx ? fx.getContext('2d') : null;
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sizeFX();

    var nodes = cat.querySelectorAll('.g-hole');
    for (var i = 0; i < nodes.length; i++) holes.push(nodes[i]);

    scoreEl = $('g-score');
    timeEl = $('g-time');
    overEl = $('g-over');
    finalEl = $('g-final');
    bestEl = $('g-best');

    if (bestEl) bestEl.textContent = String(best);
    if (panel.dataset.bound === '1') return;          // 同一份 DOM，别挂第二遍
    panel.dataset.bound = '1';

    // 洞口：按下就算数（比等 click 快一截），键盘回来的 click 里
    // detail === 0，顺手也接住
    (function bindHoles() {
      var onDown = function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        hit(e.currentTarget);
      };
      var onClick = function (e) {
        if (e.detail === 0) hit(e.currentTarget);
      };
      for (var k = 0; k < holes.length; k++) {
        holes[k].addEventListener('pointerdown', onDown);
        holes[k].addEventListener('click', onClick);
      }
    })();

    var closeBtn = $('g-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var againBtn = $('g-again');
    if (againBtn) againBtn.addEventListener('click', start);
  }

  window.awenGamesBoot = boot;
  window.awenGameOpen = open;

  // 窗口 / 平板尺寸变化时，粒子画布的像素缓冲得跟着对齐，否则坐标错位
  window.addEventListener('resize', sizeFX);

  // 首屏自己拉起来；翻页后 pjax 只扫 DOM 不重跑脚本，所以还得听它一声
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('awen:pjax', boot);

  // 回锁屏时把面板收掉（ios.js 的 lock() 只改 class，局还得自己停）
  document.addEventListener('awen:lock', close);

  // Esc 关掉；数字键 1–9 直接拍对应的洞
  document.addEventListener('keydown', function (e) {
    if (!root || !root.classList.contains('is-game')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && holes[n - 1]) {
      e.preventDefault();
      hit(holes[n - 1]);
    }
  });
})();
