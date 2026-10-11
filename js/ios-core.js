// ============================================================
// awen 主题 · iOS 外壳内核
//
// 整站装在一台「平板」里（#ios）。无刷翻页（pjax.js）会把整个 <body>
// 换掉，所以外壳脚本不能是「跑一遍就完事」的 IIFE，而是一套可以被
// 反复 boot 的模块：每轮开跑前，先把上一轮挂在 document / window /
// matchMedia 上的监听、定时器、观察器、WebGL 上下文统统收尾。
//
// 这个文件装的是各模块共用的那点东西：
//   · 收尾登记簿 cleanup + boot 代数 gen
//   · 登记收尾的三个包装：on / every / after（配 onMQ / makeObserver）
//   · 常用小工具：$ / setText / pad / go
//   · 贴图 webp 判定：WEBP_OK / texURL
//   · 跨模块共享的一份拖动守卫 dragGuard
//
// 加载顺序（都是 defer，按出现顺序执行）：
//   ios-core.js → ios-globe.js → ios-desk.js → ios.js
// 前三个里的后两个只负责「注册自己的 boot 函数」，真正的调用时机由
// ios.js 的 boot() 掌握 —— 这样翻页时能按同一套顺序收尾、再重来一遍。
// ============================================================
window.AWEN = (function () {
  // 当前这一轮 boot 需要收尾的东西
  var cleanup = [];
  // 每轮 boot 的编号。地球是异步 import（three.js，656KB）回来的，
  // 回来时可能早就翻页了，拿它比对一下就知道「这个地球还要不要」
  var gen = 0;

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanup.push(function () { target.removeEventListener(type, fn, opts); });
  }
  function every(ms, fn) {
    var id = setInterval(fn, ms);
    cleanup.push(function () { clearInterval(id); });
  }
  function after(ms, fn) {
    var id = setTimeout(fn, ms);
    cleanup.push(function () { clearTimeout(id); });
  }
  // matchMedia 的老浏览器接口是 addListener / removeListener
  function onMQ(mq, fn) {
    if (mq.addEventListener) on(mq, 'change', fn);
    else if (mq.addListener) {
      mq.addListener(fn);
      cleanup.push(function () { mq.removeListener(fn); });
    }
  }
  function makeObserver(fn, target, opts) {
    var mo = new MutationObserver(fn);
    mo.observe(target, opts);
    cleanup.push(function () { mo.disconnect(); });
  }

  function $(id) { return document.getElementById(id); }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 站内跳转一律走这里：优先交给 pjax.js 做无刷翻页（音乐才不会断），
  // 没有 pjax（配置关了 / 老浏览器）就退回整页跳，行为跟以前一样。
  function go(url) {
    if (!url) return;
    if (window.awenNavigate) window.awenNavigate(url);
    else window.location.href = url;
  }

  // WebP 支持探测：canvas.toDataURL 是同步 API，能在拼地址之前就定下来，
  // 不必等异步 <img> 探完再换地址（那样地球会先闪一下 jpg 再换）。
  // 地球贴图转 webp 后，夜景 243KB → 80KB，首屏明显快一截。
  var WEBP_OK = (function () {
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 1;
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
  })();

  // 贴图地址按需换成 webp；不支持 webp 的老浏览器继续用 jpg
  function texURL(u) {
    return (u && WEBP_OK && /\.jpe?g$/i.test(u)) ? u.replace(/\.jpe?g$/i, '.webp') : u;
  }

  var api = {
    cleanup: cleanup,     // 数组本体。模块也可以直接往里 push 收尾函数
    gen: 0,               // 当前代数，每次 reset() 后 +1
    on: on, every: every, after: after, onMQ: onMQ, makeObserver: makeObserver,
    $: $, setText: setText, pad: pad, go: go,
    WEBP_OK: WEBP_OK, texURL: texURL,

    // 刚拖过桌面道具的时间戳。拖动收尾时记一下，用来吃掉紧跟着那一次
    // click / dblclick —— 不然「把杯子甩到角落」会顺手把唱片机的播放
    // 暂停也切了（松手之后浏览器照样会补一个 click）。
    dragGuard: { ts: 0 },

    // 模块登记表：每个模块 push 一个 { name, boot }
    modules: [],
    register: function (name, bootFn) { api.modules.push({ name: name, boot: bootFn }); },

    // 每轮 boot 开头调一次：收尾上一轮 → 清空登记簿 → 代数 +1。
    // 返回新代数，模块拿它跟 api.gen 比对判断自己的异步任务是否已作废。
    reset: function () {
      for (var i = 0; i < cleanup.length; i++) {
        try { cleanup[i](); } catch (e) { }
      }
      cleanup.length = 0;
      api.gen = ++gen;
      return api.gen;
    }
  };
  return api;
})();
