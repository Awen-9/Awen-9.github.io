/* ============================================================
 * awen 主题 · Service Worker
 *
 * 给 PWA 补上离线体验。策略：
 *   - 导航（HTML）：网络优先，断网才回落缓存 —— 部署新文章后
 *     访客立刻能看到新内容，不会被旧缓存卡住。
 *   - 同源静态资源（css/js/img/json）：先用缓存、后台静默更新
 *     （stale-while-revalidate），二次访问几乎零延迟。
 *   - 跨域请求（字体 CDN、音乐 API、访问计数）一律不插手。
 *
 * 版本号变了才会重装 SW 并清旧缓存；改了静态资源记得 bump。
 * ============================================================ */
var VERSION = 'awen-sw-v4';

var PRECACHE = [
  '/css/style.css',
  '/css/ios.css',
  '/js/main.js',
  '/js/pjax.js',
  '/js/ios-core.js',
  '/js/ios-globe.js',
  '/js/ios.js',
  '/img/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 只管同源

  var wantsHTML = req.mode === 'navigate' ||
                  (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (wantsHTML) {
    // 导航：网络优先
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('/404.html');
        });
      })
    );
    return;
  }

  // 静态资源：先用缓存，同时后台更新
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });   // 断网时退回旧缓存
      return hit || fresh;
    })
  );
});
