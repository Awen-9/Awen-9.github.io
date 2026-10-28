import * as THREE from 'three';
import { subsolarPoint } from './sun';
import { LAND } from './world';

const DEG = Math.PI / 180;
const TEX = '/textures/';
/** 手绘兜底的纸色和墨色，和 theme.css 的 --paper、--fg 一致 */
const PAPER = '#fafaf8';
const INK = '26, 26, 26';
/** 照片贴图，依次是白天、夜灯、海面高光、云。
 * 手机和省流量模式只用 low（四张约 370 kB）不再升级；宽屏等 1k 画出来、浏览器空闲了再换 high */
export const TEXTURES = {
  low: ['earth-natural-1k.jpg', 'earth_lights_1024.jpg', 'earth_specular_1024.jpg', 'earth_clouds_1024.jpg'],
  high: ['earth-natural-2k.jpg', 'earth_lights_2048.png', 'earth_specular_2048.jpg', 'earth_clouds_1024.jpg'],
};

// 与 SphereGeometry 的 UV 展开一致：经纬度 → 球面局部方向
function lonLatToVec(lon: number, lat: number, out = new THREE.Vector3()) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return out.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
}

const worldVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/**
 * 一层球面同时画两种地球：手绘海图和照片贴图，靠 photoMix 在两者之间过渡。
 * 手绘图是现画的，第一帧就有；照片贴图在后台下，到齐了再淡进来，下不来就一直用手绘的兜底。
 */
const earthFragment = /* glsl */ `
  uniform sampler2D chart;
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float cloudShift;
  uniform float photoMix;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, sunDir);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 6.0);

    // 手绘海图：白天是纸和墨，夜里把整张纸反过来。颜色先在 sRGB 里算，负片才够黑，最后再转到线性
    vec3 inkSRGB = texture2D(chart, vUv).rgb;
    vec3 ink = mix(1.0 - inkSRGB, inkSRGB, smoothstep(-0.05, 0.06, ndl));
    ink = mix(ink, vec3(0.1), rim * 0.72);
    vec3 col = pow(ink, vec3(2.2));

    if (photoMix > 0.001) {
      float dayMix = smoothstep(-0.1, 0.16, ndl);
      float cloud = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;

      vec3 day = texture2D(dayMap, vUv).rgb * (1.0 - cloud * 0.3);
      vec3 dayCol = day * (0.06 + 1.15 * max(ndl, 0.0));
      vec3 night = texture2D(nightMap, vUv).rgb;
      vec3 nightCol = night * vec3(1.0, 0.72, 0.42) * 1.8 * (1.0 - cloud * 0.7);
      vec3 photo = mix(nightCol, dayCol, dayMix);

      float ocean = texture2D(specMap, vUv).r;
      vec3 h = normalize(sunDir + v);
      photo += vec3(1.0, 0.93, 0.8) * pow(max(dot(n, h), 0.0), 70.0) * ocean * 0.55 * dayMix;

      float twilight = smoothstep(-0.18, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.22, ndl));
      photo += vec3(0.95, 0.38, 0.12) * twilight * 0.1;

      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      photo += vec3(0.32, 0.62, 1.0) * fres * 0.85 * smoothstep(-0.35, 0.5, ndl);

      col = mix(col, photo, photoMix);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const cloudFragment = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float cloudShift;
  uniform float photoMix;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float cloud = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
    float ndl = dot(normalize(vNormalW), sunDir);
    float lit = smoothstep(-0.2, 0.25, ndl);
    gl_FragColor = vec4(vec3(0.05 + 0.95 * max(ndl, 0.0)), cloud * (0.04 + 0.86 * lit) * photoMix);
    #include <colorspace_fragment>
  }
`;

/**
 * 外层球：手绘时沿轮廓描一圈墨，换成照片后变回一圈淡淡的大气光，
 * 两种光晕按 photoMix 过渡，切换的时候不会突然换一种边。
 */
const atmoFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 ink;
  uniform vec3 paper;
  uniform float lightBg;
  uniform float photoMix;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float i = pow(smoothstep(0.0, 0.3, -dot(n, v)), 1.8);
    float lit = smoothstep(-0.45, 0.6, dot(n, sunDir));
    vec3 glow = mix(ink, paper, photoMix);
    float a = i * mix(0.06 + 0.3 * lit, 0.12 + 0.88 * lit, photoMix);
    gl_FragColor = lightBg > 0.5 ? vec4(glow, a) : vec4(glow * a, 1.0);
  }
`;

/**
 * 地球的兜底贴图在页面里现画：一张等距圆柱投影的手绘海图。
 * 纸底、点阵陆地、虚线经纬网，海岸线描两遍，第二遍故意抖一点，像手描的复写线。
 * 不下载任何图片、第一帧就能有；照片贴图到齐之后再淡入换掉它。
 * @param size 贴图宽度，高度是宽度的一半
 */
function drawChart(size: number) {
  const w = size;
  const h = size / 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return c;

  const u = w / 360; // 一度几像素
  const x = (lon: number) => (lon + 180) * u;
  const y = (lat: number) => (90 - lat) * u;
  // 笔宽、点距都按画布缩放，2048 和 4096 画出来是同一张，只是细一倍
  const k = w / 4096;

  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);

  // 经纬网：每 30° 一条虚线，赤道留一条实线当基准
  g.strokeStyle = `rgba(${INK}, 0.16)`;
  g.lineWidth = 1.6 * k;
  g.setLineDash([7 * k, 9 * k]);
  g.beginPath();
  for (let lon = -150; lon < 180; lon += 30) {
    g.moveTo(x(lon), 0);
    g.lineTo(x(lon), h);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    g.moveTo(0, y(lat));
    g.lineTo(w, y(lat));
  }
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = `rgba(${INK}, 0.34)`;
  g.lineWidth = 2.2 * k;
  g.beginPath();
  g.moveTo(0, y(0));
  g.lineTo(w, y(0));
  g.stroke();

  // 陆地：用点阵当网点。一格 28px，里一个点，远看是一片灰，近看是点和纸
  const tile = document.createElement('canvas');
  tile.width = tile.height = Math.round(28 * k);
  const tg = tile.getContext('2d');
  if (tg) {
    tg.fillStyle = `rgba(${INK}, 0.05)`;
    tg.fillRect(0, 0, tile.width, tile.height);
    tg.fillStyle = `rgba(${INK}, 0.26)`;
    tg.beginPath();
    tg.arc(tile.width / 2, tile.height / 2, 1.6 * k, 0, Math.PI * 2);
    tg.fill();
  }
  const dots = g.createPattern(tile, 'repeat');

  g.beginPath();
  for (const ring of LAND) {
    for (let i = 0; i < ring.length; i += 2) {
      const px = x(ring[i]);
      const py = y(ring[i + 1]);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }
  if (dots) {
    g.fillStyle = dots;
    g.fill();
  }

  // 第一遍：贴着实测绘深一点的海岸线
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = `rgba(${INK}, 0.58)`;
  g.lineWidth = 2.4 * k;
  g.stroke();

  // 第二遍：每个点抖一点点，叠出一道浅的复写线，像手描的
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  g.beginPath();
  for (const ring of LAND) {
    for (let i = 0; i < ring.length; i += 2) {
      const px = x(ring[i]) + rnd() * 4 * k;
      const py = y(ring[i + 1]) + rnd() * 4 * k;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }
  g.strokeStyle = `rgba(${INK}, 0.24)`;
  g.lineWidth = 1.2 * k;
  g.stroke();

  return c;
}

export interface EarthOptions {
  home: { lon: number; lat: number };
  reducedMotion: boolean;
  onReady?: () => void;
  /** 画布后面是浅色页面时，大气改用透明度混合（叠加混合会在浅底上留下黑圈），星点改成墨色 */
  backdrop?: 'dark' | 'light';
  /** 地球直径占画布高度的比例，默认 0.76 */
  size?: number;
  /** 只用 1k 照片贴图、不再升到 2k（手绘图和 2k 升级都不受影响）：手机和省流量模式用 */
  lowRes?: boolean;
}

export interface EarthHandle {
  /** 地球在画面中的偏移，单位为画布宽/高的比例，正值向右、向下 */
  setFocus(x: number, y: number, instant?: boolean): void;
  /** 转回所在城市正对镜头的朝向，fast 时一秒内到位，否则慢慢转回去 */
  recenter(fast?: boolean): void;
  dispose(): void;
}

export function mountEarth(canvas: HTMLCanvasElement, opts: EarthOptions): EarthHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    // 2 倍屏上锯齿本来就看不出，关掉多重采样，手机上每帧省一大块显存带宽
    renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const group = new THREE.Group();
  scene.add(group);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 兜底的手绘海图：现画，拿到就是最终精度。照片贴图还没到之前，屏幕上就是它
  const chart = new THREE.CanvasTexture(drawChart(opts.lowRes ? 2048 : 4096));
  chart.colorSpace = THREE.NoColorSpace; // 颜色原样取用，负片才够黑
  chart.anisotropy = Math.min(8, maxAniso);
  chart.wrapS = THREE.RepeatWrapping;

  const tex = (loader: THREE.TextureLoader, file: string, srgb = true) => {
    const t = loader.load(TEX + file);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };

  // 照片贴图在后台拿。到齐了就记下开始淡入的时刻；一张没下来就一直用手绘图。
  // 开了省流量模式就干脆不下载：手绘这张本身也够看
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const wantPhoto = !net?.saveData;
  let blendAt = 0;
  let photoFailed = false;
  const photoLoad = new THREE.LoadingManager();
  photoLoad.onError = () => (photoFailed = true);
  photoLoad.onLoad = () => {
    if (photoFailed) return;
    blendAt = performance.now();
    // 1k 已经换上了，宽屏再考虑升到 2k
    if (!opts.lowRes) upgrade();
  };
  const photoLoader = new THREE.TextureLoader(photoLoad);
  const [lowDay, lowNight, lowSpec, lowCloud] = TEXTURES.low;
  const dayMap = wantPhoto ? tex(photoLoader, lowDay) : null;
  const nightMap = wantPhoto ? tex(photoLoader, lowNight) : null;
  const specMap = wantPhoto ? tex(photoLoader, lowSpec, false) : null;
  const cloudMap = wantPhoto ? tex(photoLoader, lowCloud, false) : null;

  const sunDir = new THREE.Vector3();
  const uniforms = {
    chart: { value: chart },
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    specMap: { value: specMap },
    cloudMap: { value: cloudMap },
    sunDir: { value: sunDir },
    cloudShift: { value: 0 },
    photoMix: { value: 0 },
  };

  const sphere = new THREE.SphereGeometry(1, 128, 64);
  const earth = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ uniforms, vertexShader: worldVertex, fragmentShader: earthFragment }));

  // 云单独一层，透明度跟着 photoMix 一起淡入，手绘阶段它是看不见的
  const cloudUniforms = { cloudMap: uniforms.cloudMap, sunDir: uniforms.sunDir, cloudShift: uniforms.cloudShift, photoMix: uniforms.photoMix };
  const clouds = new THREE.Mesh(
    sphere,
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: worldVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
    }),
  );
  clouds.scale.setScalar(1.006);

  const light = opts.backdrop === 'light';
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        sunDir: uniforms.sunDir,
        lightBg: { value: light ? 1 : 0 },
        ink: { value: new THREE.Color().setHex(0x1a1a1a, THREE.LinearSRGBColorSpace) },
        paper: { value: new THREE.Color().setHex(0xfafaf8, THREE.LinearSRGBColorSpace) },
        photoMix: uniforms.photoMix,
      },
      vertexShader: worldVertex,
      fragmentShader: atmoFragment,
      side: THREE.BackSide,
      blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  atmosphere.scale.setScalar(1.12);

  // 所在城市的橙色光点
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.011, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc46b }),
  );
  lonLatToVec(opts.home.lon, opts.home.lat, marker.position).multiplyScalar(1.004);

  group.add(earth, clouds, marker);
  scene.add(atmosphere);
  const stars = makeStars(1400, light);
  scene.add(stars);

  // 初始朝向：所在城市正对镜头，略微抬高视角让北半球多露一些
  const homeVec = lonLatToVec(opts.home.lon, opts.home.lat);
  const homeYaw = Math.atan2(-homeVec.x, homeVec.z);
  const homePitch = Math.atan2(homeVec.y, Math.hypot(homeVec.x, homeVec.z)) * 0.75;
  let yaw = homeYaw;
  let pitch = homePitch;
  let vYaw = 0;
  let vPitch = 0;
  const autoSpin = opts.reducedMotion ? 0 : 0.035; // rad/s
  // 回正时的收敛速度，0 表示不在回正
  let homing = 0;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    vYaw = vPitch = 0;
    homing = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1) / 1000;
    const k = 3.2 / canvas.clientHeight;
    const dYaw = (e.clientX - lastX) * k;
    const dPitch = (e.clientY - lastY) * k;
    yaw += dYaw;
    pitch = THREE.MathUtils.clamp(pitch + dPitch, -1.1, 1.1);
    vYaw = dYaw / dt;
    vPitch = dPitch / dt;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    canvas.classList.remove('is-grabbing');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    // 停顿后松手不再甩动
    if (performance.now() - lastT > 80) vYaw = vPitch = 0;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  let width = 0;
  let height = 0;
  const focus = new THREE.Vector2();
  const focusTarget = new THREE.Vector2();
  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 横屏时地球约占 76% 高度，竖屏时按宽度收住
    const tanHalf = Math.tan((camera.fov / 2) * DEG);
    const size = opts.size ?? 0.76;
    camera.position.set(0, 0, Math.max(2 / size / (2 * tanHalf), 2 / (size * 1.13) / (2 * tanHalf * camera.aspect)));
    camera.lookAt(0, 0, 0);
    applyFocus();
  };
  const applyFocus = () => {
    camera.setViewOffset(width, height, -focus.x * width, -focus.y * height, width, height);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const sunLocal = new THREE.Vector3();
  const updateSun = () => {
    const s = subsolarPoint();
    lonLatToVec(s.lon, s.lat, sunLocal);
  };
  updateSun();
  const sunTimer = window.setInterval(updateSun, 60_000);

  let dead = false;
  let shown = false;
  let visible = true;
  let raf = 0;
  let prev = performance.now();
  const frame = (now: number) => {
    if (dead) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    if (!dragging && homing) {
      // 走最短的那一圈转回去，到位后恢复自转
      const dYaw = Math.atan2(Math.sin(homeYaw - yaw), Math.cos(homeYaw - yaw));
      const dPitch = homePitch - pitch;
      const k = 1 - Math.exp(-dt * homing);
      yaw += dYaw * k;
      pitch += dPitch * k;
      if (Math.abs(dYaw) + Math.abs(dPitch) < 0.002) homing = 0;
    } else if (!dragging) {
      yaw += (vYaw + autoSpin) * dt;
      pitch = THREE.MathUtils.clamp(pitch + vPitch * dt, -1.1, 1.1);
      const decay = Math.exp(-dt * 2.6);
      vYaw *= decay;
      vPitch *= decay;
    }
    if (focus.distanceToSquared(focusTarget) > 1e-8) {
      focus.lerp(focusTarget, 1 - Math.exp(-dt * (opts.reducedMotion ? 60 : 4.5)));
      applyFocus();
    }
    // 照片到齐后 0.9 秒内把手绘图换成照片，用平滑的曲线，两头都不突兀
    if (blendAt) {
      const t = Math.min(1, (now - blendAt) / 900);
      uniforms.photoMix.value = t * t * (3 - 2 * t);
    }
    group.rotation.set(pitch, yaw, 0);
    stars.rotation.set(pitch * 0.08, yaw * 0.08, 0);
    sunDir.copy(sunLocal).applyQuaternion(group.quaternion);
    if (!opts.reducedMotion) uniforms.cloudShift.value = (now / 1000) * 0.0009;
    renderer.render(scene, camera);
    // 第一帧真的画出来了再让画布淡进来，页面上那张占位图正好交班
    if (!shown) {
      shown = true;
      opts.onReady?.();
    }
  };
  const start = () => {
    if (dead || raf || !visible || document.hidden) return;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? start() : stop();
  });
  io.observe(canvas);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);
  start();

  /** 1k 照片已经上身，再慢慢换成 2k：等浏览器空闲、四张都到齐才一起换，换完把旧的显存放掉 */
  function upgrade() {
    if (dead || net?.saveData || (net?.effectiveType && net.effectiveType !== '4g')) return;
    const swap = () => {
      if (dead) return;
      let hiFailed = false;
      const manager = new THREE.LoadingManager();
      manager.onError = () => (hiFailed = true);
      const loader = new THREE.TextureLoader(manager);
      const [day, night, spec, cloud] = TEXTURES.high;
      const hi = {
        dayMap: tex(loader, day),
        nightMap: tex(loader, night),
        specMap: tex(loader, spec, false),
        cloudMap: tex(loader, cloud, false),
      };
      manager.onLoad = () => {
        // 有一张没下来就维持 1k，不拿半套贴图去换
        if (dead || hiFailed) return;
        const old = [uniforms.dayMap.value, uniforms.nightMap.value, uniforms.specMap.value, uniforms.cloudMap.value];
        uniforms.dayMap.value = hi.dayMap;
        uniforms.nightMap.value = hi.nightMap;
        uniforms.specMap.value = hi.specMap;
        uniforms.cloudMap.value = hi.cloudMap;
        for (const t of old) t?.dispose();
      };
    };
    // 后台标签页里空闲回调不跑，用户切回来看的时候再换
    if (window.requestIdleCallback) window.requestIdleCallback(swap, { timeout: 4000 });
    else window.setTimeout(swap, 1500);
  }

  return {
    setFocus(x, y, instant = false) {
      focusTarget.set(x, y);
      if (instant) {
        focus.copy(focusTarget);
        applyFocus();
      }
    },
    recenter(fast = false) {
      vYaw = vPitch = 0;
      homing = opts.reducedMotion ? 60 : fast ? 6 : 1.4;
    },
    dispose() {
      dead = true;
      stop();
      ro.disconnect();
      io.disconnect();
      clearInterval(sunTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      chart.dispose();
      for (const t of [uniforms.dayMap.value, uniforms.nightMap.value, uniforms.specMap.value, uniforms.cloudMap.value]) t?.dispose();
      renderer.dispose();
    },
  };
}

function makeStars(count: number, ink = false) {
  const pos = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(60).toArray(pos, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.3, sizeAttenuation: false, color: ink ? 0x3a3128 : 0xdfe8ff, transparent: true, opacity: ink ? 0.3 : 0.75, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}
