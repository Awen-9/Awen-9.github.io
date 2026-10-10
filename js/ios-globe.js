// ============================================================
// awen 主题 · 地球与定位（iOS 锁屏）
//
// 锁屏背后那颗能自转、能定位、能打的 WebGL 地球，加上给它提供坐标的
// 定位链（配置城市 → IP 定位（免授权））。不请求浏览器 GPS —— 位置只来自
// 访客的请求 IP，查不到就回落配置里的兜底城市（中国北京）。
//
// 这两件事天生绑在一起：定位的结果最终既写进锁屏文案，也写进地球上的
// 那个蓝点；换主题（明暗）时地球还要换贴图。所以放同一个模块里。
//
// three.js（656KB）是动态 import 的，可能比用户翻页还慢 —— 回来时先用
// ctx.gen 跟内核的 A.gen 比一下，代数对不上就整块作废（那轮的 canvas
// 早就随旧 DOM 一起被丢掉了，硬建会给它建出一个没人要的 WebGL 上下文）。
//
// 本文件只「注册」自己，不主动执行；由 ios.js 在 boot() 里按时机拉起。
// ============================================================
(function () {
  var A = window.AWEN;

  // ctx: { root, state, gen, isDoc } —— 都是 ios.js 每一轮 boot 现造的
  function bootGlobe(ctx) {
    var root = ctx.root;
    var state = ctx.state;
    var myGen = ctx.gen;
    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ------------------------------------------------------------
    // 定位：配置城市 → IP 定位（免授权）
    // ------------------------------------------------------------
    function coordText(lat, lon) {
      return Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' +
             Math.abs(lon).toFixed(2) + '°' + (lon >= 0 ? 'E' : 'W');
    }

    function applyLocation(lat, lon, label) {
      state.lat = lat;
      state.lon = lon;
      state.label = label || state.city;
      A.setText(A.$('lock-city'), state.label);
      A.setText(A.$('lock-coord'), coordText(lat, lon));
      if (state.globe) state.globe.placeMarker(lat, lon);
    }

    // ---------- IP 定位 ----------
    // 好处：不用弹授权框，进站就能把地球转到访客所在的城市。
    // 代价：只精确到城市级（移动网络常被归到省会），所以想要更准只能靠 IP 库本身。
    var IP_CACHE_KEY = 'awen-ip-loc';
    var IP_CACHE_TTL = 6 * 60 * 60 * 1000;   // 同一浏览器 6 小时内不重复查

    // 三个库都开了 CORS。注意必须是 HTTPS —— 站点在 GitHub Pages 上，
    // 请求 HTTP 接口会被浏览器当混合内容拦掉。
    var IP_APIS = [
      {
        url: 'https://get.geojs.io/v1/ip/geo.json',
        pick: function (d) {
          return { ip: d.ip, lat: parseFloat(d.latitude), lon: parseFloat(d.longitude),
                   city: d.city, region: d.region, country: d.country, cc: d.country_code };
        }
      },
      {
        url: 'https://api.ipapi.is/',
        pick: function (d) {
          return { ip: d.ip, lat: d.lat, lon: d.lon,
                   city: d.city, region: d.region, country: d.country, cc: d.country_code };
        }
      },
      {
        url: 'https://ipwho.is/',
        pick: function (d) {
          return { ip: d.ip, lat: d.latitude, lon: d.longitude,
                   city: d.city, region: d.region, country: d.country, cc: d.country_code };
        }
      }
    ];

    // 百度归属地接口：能给「陕西省西安市」这种中文写法，但它不带 CORS 头，
    // 只能走 JSONP（<script> 加载不受同源限制）。B 站那个接口虽然也返回中文，
    // 但不支持回调、又没 CORS，纯静态站点用不了。
    var IP_BAIDU = 'https://sp0.baidu.com/8aQDcjqpAAV3otqbppnN2DJv/api.php?resource_id=6006&oe=utf8&query=';

    // 网易的接口同样走 JSONP，但更省事：一次调用就同时给出中文地名和经纬度，
    // 而且国内直连很快 —— 所以把它放在第一位，国际库只作为海外访客的备胎。
    var IP_NETEASE = 'https://ipservice.ws.126.net/locate/api/getLocByIp';

    function fetchJSON(url, ms) {
      return new Promise(function (resolve, reject) {
        if (typeof fetch !== 'function') { reject(new Error('no fetch')); return; }
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = setTimeout(function () {
          if (ctrl) ctrl.abort();
          reject(new Error('timeout'));
        }, ms);
        fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json();
        }).then(function (d) { clearTimeout(timer); resolve(d); },
                function (e) { clearTimeout(timer); reject(e); });
      });
    }

    function jsonp(url, ms, param) {
      return new Promise(function (resolve, reject) {
        var name = 'awenIpCb' + Math.floor(Math.random() * 1e6);
        var script = document.createElement('script');
        var settled = false;
        var timer = setTimeout(function () { finish(null); }, ms);

        function finish(data) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (script.parentNode) script.parentNode.removeChild(script);
          // 这里千万不能 delete window[name]：请求可能已经在路上（我们超时放弃了，
          // 但响应迟早会到，浏览器还是会执行那个回调）。删掉的话迟到的回调就变成
          // 「xxx is not defined」抛进 console。留个空壳函数让它安全落地，
          // 一页最多也就两三个，开销可以忽略。
          window[name] = function () { };
          if (data) resolve(data); else reject(new Error('jsonp failed'));
        }

        window[name] = function (d) { finish(d); };
        script.onerror = function () { finish(null); };
        script.src = url + (url.indexOf('?') < 0 ? '?' : '&') + (param || 'cb') + '=' + name;
        document.head.appendChild(script);
      });
    }

    // 「陕西省西安市 电信」→「西安市」/「北京市」原样 /「内蒙古自治区呼和浩特市」→「呼和浩特市」
    function shortCity(loc) {
      var s = String(loc || '').split(' ')[0];
      s = s.replace(/^.*?自治区/, '');
      var i = s.lastIndexOf('省');
      if (i >= 0) s = s.slice(i + 1);
      return s.trim();
    }

    function locateByIp() {
      // ① 先看这个会话里有没有查过
      try {
        var hit = JSON.parse(sessionStorage.getItem(IP_CACHE_KEY) || 'null');
        if (hit && Date.now() - hit.t < IP_CACHE_TTL) return Promise.resolve(hit);
      } catch (e) { /* 无痕模式可能没有 sessionStorage，忽略 */ }

      function save(d, city) {
        // 库没给城市名就往下退：城市 → 省/州 → 国家（香港这类 IP 常常没有 city 字段）
        var label = city || d.city || d.region || d.country || '';
        var out = { lat: d.lat, lon: d.lon, city: label, t: Date.now() };
        try { sessionStorage.setItem(IP_CACHE_KEY, JSON.stringify(out)); } catch (e) { }
        return out;
      }

      // ② 首选网易：国内直连，一次调用同时给出中文地名和经纬度
      return jsonp(IP_NETEASE, 4000, 'callback').then(function (d) {
        var r = d && d.result;
        var la = r ? parseFloat(r.areaLat) : NaN;
        var lo = r ? parseFloat(r.areaLng) : NaN;
        if (!isFinite(la) || !isFinite(lo)) throw new Error('netease bad data');
        return save({ lat: la, lon: lo, city: r.city, region: r.province, country: r.country });
      }).catch(function () {
        // ③ 网易不通（多半是海外访客）→ 依次试国际库，谁先答用谁
        var i = 0;
        function next() {
          if (i >= IP_APIS.length) return Promise.reject(new Error('all ip apis failed'));
          var api = IP_APIS[i++];
          return fetchJSON(api.url, 6000).then(function (raw) {
            var d = api.pick(raw);
            if (!isFinite(d.lat) || !isFinite(d.lon)) throw new Error('bad coords');
            return d;
          }).catch(next);
        }
        return next().then(function (d) {
          // ④ 库里认出是国内 IP，就再要一次中文地名；失败就用库里的名字
          if (d.cc === 'CN' && d.ip) {
            return jsonp(IP_BAIDU + encodeURIComponent(d.ip), 5000).then(function (b) {
              var raw = b && b.data && b.data[0] && b.data[0].location;
              return save(d, shortCity(raw));
            }).catch(function () { return save(d); });
          }
          return save(d);
        });
      });
    }

    function initLocation() {
      applyLocation(state.lat, state.lon, state.city);

      // IP 定位：免授权，进站就查（主题配置里 ios.ip_location: false 可关掉）
      if (state.ipLoc) {
        locateByIp().then(function (hit) {
          applyLocation(hit.lat, hit.lon, hit.city);
        }).catch(function () { /* 全挂了就保持配置里的兜底城市（中国北京） */ });
      }

      // 不再调用 navigator.geolocation：浏览器 GPS 会弹「位置授权」框，
      // 与「只从请求 IP 分析位置」的诉求相悖 —— 位置一律只来自 IP。
    }

    // ------------------------------------------------------------
    // WebGL 地球
    // ------------------------------------------------------------
    function markerTexture(THREE, color) {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var ctx = c.getContext('2d');
      var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(0.3, 'rgba(120,210,255,0.75)');
      g.addColorStop(1, 'rgba(58,124,165,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }

    /* 经纬度 → 球面坐标（与 SphereGeometry 的 UV 展开一致） */
    function latLonToVec3(THREE, lat, lon, r) {
      var u = (lon + 180) / 360;
      var v = (90 - lat) / 180;
      var phi = u * Math.PI * 2;
      var theta = v * Math.PI;
      return new THREE.Vector3(
        -r * Math.cos(phi) * Math.sin(theta),
        r * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }

    function buildGlobe(THREE) {
      var canvas = A.$('ios-canvas');
      if (!canvas) return null;

      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
      var group = new THREE.Group();          // 负责纬度倾斜 + 定位朝向
      var earth = new THREE.Group();          // 负责自转
      group.add(earth);
      scene.add(group);

      // 光照（夜景贴图靠自发光，白天贴图靠这盏灯）
      var sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(3, 1.6, 4);
      scene.add(sun);
      scene.add(new THREE.AmbientLight(0x223044, 1.1));

      // 地球本体：先不上贴图。贴图是异步下载的，如果这里就写 emissive 白，
      // 下载完之前会先渲染出一个纯白球（很显眼的 bug）。所以初始全黑，
      // 等贴图到了再点亮；这期间上面盖着兜底星空，看不到黑球。
      var material = new THREE.MeshPhongMaterial({ color: 0x000000, emissive: 0x000000, shininess: 6 });
      var earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 54), material);
      earth.add(earthMesh);

      // 大气辉光
      var glow = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(0x4a9ede) } },
          vertexShader:
            'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal);' +
            ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader:
            'uniform vec3 uColor; varying vec3 vN;' +
            'void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0);' +
            ' gl_FragColor = vec4(uColor * i, 1.0); }',
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false
        })
      );
      glow.scale.setScalar(1.16);
      group.add(glow);

      // 星空
      var starCount = 1100;
      var positions = new Float32Array(starCount * 3);
      for (var i = 0; i < starCount; i++) {
        var r = 40 + Math.random() * 80;
        var t = Math.random() * Math.PI * 2;
        var p = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(p) * Math.cos(t);
        positions[i * 3 + 1] = r * Math.cos(p);
        positions[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
      }
      var starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false
      }));
      scene.add(stars);

      // 定位标记
      var marker = new THREE.Sprite(new THREE.SpriteMaterial({
        map: markerTexture(THREE, 'rgba(150,230,255,1)'),
        transparent: true, depthWrite: false, depthTest: true
      }));
      marker.scale.setScalar(0.17);
      earth.add(marker);

      // 贴图缓存：明暗模式来回切换时不重复下载，也不给显存留垃圾
      var texCache = {};
      function getTexture(url, onOk) {
        if (texCache[url]) { onOk(texCache[url]); return; }
        new THREE.TextureLoader().load(url, function (tex) {
          tex.colorSpace = THREE.SRGBColorSpace;
          texCache[url] = tex;
          onOk(tex);
        }, undefined, function () {
          // 下载失败：保持当前外观（黑球被兜底星空盖着），不要退化成白球
        });
      }

      var api = {
        placeMarker: function (lat, lon) {
          marker.position.copy(latLonToVec3(THREE, lat, lon, 1.015));
          // 让该经纬度正对镜头
          var phi = ((lon + 180) / 360) * Math.PI * 2;
          earth.rotation.y = Math.PI / 2 - phi;
          group.rotation.x = (lat * Math.PI) / 180;
        },
        setWall: function (mode, done) {
          var url = A.texURL(mode === 'day' ? root.dataset.texDay : root.dataset.texNight);
          if (!url) { if (done) done(); return; }

          var small = A.texURL(mode === 'day' ? root.dataset.texDaySmall : root.dataset.texNightSmall);
          var lowTex = null;
          var hdDone = false;      // 高清是否已经上屏
          var notified = false;
          function notify() { if (done && !notified) { notified = true; done(); } }

          // 只有贴图拿到了才改材质，中途失败不会把地球变成黑球/白球
          function apply(tex) {
            if (mode === 'day') {
              material.map = tex;
              material.emissiveMap = null;
              material.color.setHex(0xffffff);
              material.emissive.setHex(0x000000);
            } else {
              material.map = null;
              material.emissiveMap = tex;
              material.color.setHex(0x000000);
              material.emissive.setHex(0xffffff);
            }
            material.needsUpdate = true;
          }

          // 渐进式贴图：先铺 900×450 的小图（约 50KB），大图（2048×1024，
          // 约 240~470KB）到了再无缝换掉。冷启动时"对着黑屏等地球"的
          // 时间差不多砍掉一半，而且小图没到之前也不会露出白球或黑球。
          if (small && small !== url) {
            getTexture(small, function (tex) {
              // 小图要是比大图还晚到（理论上不会，它更小），别把高清盖回去
              if (hdDone) { if (tex.dispose) tex.dispose(); return; }
              lowTex = tex;
              apply(tex);
              notify();
            });
          }

          getTexture(url, function (tex) {
            hdDone = true;
            apply(tex);
            // 高清已经上屏，低清那张就不用再占显存了
            if (lowTex && lowTex !== tex && lowTex.dispose) lowTex.dispose();
            notify();
          });
        },
        rotateBy: function (deltaX) { earth.rotation.y += deltaX; },
        pause: function () { running = false; },
        resume: function () { running = true; last = performance.now(); },
        // 换页时必须收拾干净：渲染循环停掉、几何体/材质/贴图/渲染器逐个释放，
        // 最后把 canvas 尺寸归零 —— 不然每翻一次页就漏一个 WebGL 上下文，
        // 攒到浏览器上限（一般 16 个）整站的地球就全黑了
        destroy: function () {
          dead = true;
          running = false;
          try { renderer.setAnimationLoop && renderer.setAnimationLoop(null); } catch (e) {}
          try {
            scene.traverse(function (obj) {
              if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
              var m = obj.material;
              if (!m) return;
              (Array.isArray(m) ? m : [m]).forEach(function (mat) {
                if (mat.map && mat.map.dispose) mat.map.dispose();
                if (mat.dispose) mat.dispose();
              });
            });
          } catch (e) {}
          try { renderer.dispose(); } catch (e) {}
          try { renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {}
          try { canvas.width = canvas.height = 0; } catch (e) {}
        }
      };

      // 自适应：让地球直径约占画面宽度的 78%
      var sizing = function () {
        var w = canvas.clientWidth || root.clientWidth;
        var h = canvas.clientHeight || root.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        var k = 0.78;
        var dist = 1 / (k * Math.tan((camera.fov * Math.PI / 180) / 2) * camera.aspect);
        camera.position.set(0, 0, dist);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
      };
      sizing();
      A.on(window, 'resize', sizing);

      var running = true;
      var dead = false;              // 换页后置位：既停渲染循环，也释放 WebGL 上下文
      var last = performance.now();
      var speed = parseFloat(root.dataset.rotate) || 0;

      function frame(now) {
        if (dead) return;            // 别再 requestAnimationFrame，循环到此为止
        requestAnimationFrame(frame);
        if (!running || document.hidden) { last = now; return; }
        var dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (!state.dragging && !reduceMotion && speed) earth.rotation.y += speed * dt;
        stars.rotation.y += dt * 0.004;
        renderer.render(scene, camera);
      }
      requestAnimationFrame(frame);

      api.placeMarker(state.lat, state.lon);
      api.setWall(state.wall, function () {
        // 贴图就绪、也画过一帧了，这时才摘掉兜底星空让它淡出，不会看到白球或黑球
        root.classList.remove('ios-noglobe');
      });
      return api;
    }

    function initGlobe() {
      var url = root.dataset.three;
      // 省流量模式 / 2G 网络：656KB 的 three.js 不值得拉，直接用星空兜底
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      var thrifty = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
      if (!url || !window.WebGLRenderingContext || thrifty) {
        root.classList.add('ios-noglobe');
        return;
      }
      var p;
      try {
        p = import(url);
      } catch (err) {
        root.classList.add('ios-noglobe');   // 环境不支持动态 import
        return;
      }
      Promise.resolve(p).then(function (THREE) {
        // three.js（656KB）还没下完用户就翻页了：这一轮已经作废，别再往下建 ——
        // 否则会给一个已经不在文档里的 canvas 建 WebGL 上下文
        if (myGen !== A.gen) return;
        var api = null;
        try {
          api = buildGlobe(THREE);
        } catch (err) {
          api = null;
        }
        if (!api) {
          root.classList.add('ios-noglobe');
          return;
        }
        state.globe = api;
        // 地球加载得慢、用户已经解锁进主屏了：那就别再空转渲染
        if (!root.classList.contains('is-home')) api.pause();
      }).catch(function () {
        root.classList.add('ios-noglobe');   // 文件不可用时退回 CSS 星空
      });
    }

    // 按原来的时机拉起：先定位（写锁屏文案），再建地球
    initLocation();
    initGlobe();
  }

  A.register('globe', bootGlobe);
})();
