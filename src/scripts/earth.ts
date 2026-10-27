import * as THREE from 'three';
import { subsolarPoint } from './sun';

const DEG = Math.PI / 180;
const TEX = '/textures/';
/** 贴图，依次是白天、夜灯、海面高光、云。手机和省流量模式用 low，首页给手机提前预加载 low 这一组。
 * 云图是灰度 JPG，亮度里已经乘好了透明度，比原来带透明通道的 PNG 小一半多 */
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

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float cloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, sunDir);
    float dayMix = smoothstep(-0.1, 0.16, ndl);

    float cloud = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;

    vec3 day = texture2D(dayMap, vUv).rgb * (1.0 - cloud * 0.3);
    vec3 dayCol = day * (0.06 + 1.15 * max(ndl, 0.0));
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 nightCol = night * vec3(1.0, 0.72, 0.42) * 1.8 * (1.0 - cloud * 0.7);
    vec3 col = mix(nightCol, dayCol, dayMix);

    float ocean = texture2D(specMap, vUv).r;
    vec3 h = normalize(sunDir + v);
    col += vec3(1.0, 0.93, 0.8) * pow(max(dot(n, h), 0.0), 70.0) * ocean * 0.55 * dayMix;

    float twilight = smoothstep(-0.18, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.22, ndl));
    col += vec3(0.95, 0.38, 0.12) * twilight * 0.1;

    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col += vec3(0.32, 0.62, 1.0) * fres * 0.85 * smoothstep(-0.35, 0.5, ndl);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const cloudFragment = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float cloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float cloud = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
    float ndl = dot(normalize(vNormalW), sunDir);
    float lit = smoothstep(-0.2, 0.25, ndl);
    gl_FragColor = vec4(vec3(0.05 + 0.95 * max(ndl, 0.0)), cloud * (0.04 + 0.86 * lit));
    #include <colorspace_fragment>
  }
`;

// 背面渲染的外层球：只在地球轮廓外侧留下一圈大气光，默认蓝色
const atmoFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 glow;
  uniform float lightBg;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float i = pow(smoothstep(0.0, 0.34, -dot(n, v)), 1.6);
    float lit = smoothstep(-0.45, 0.6, dot(n, sunDir));
    float a = i * (0.12 + 0.88 * lit);
    gl_FragColor = lightBg > 0.5 ? vec4(glow, a) : vec4(glow * a, 1.0);
  }
`;

export interface EarthOptions {
  home: { lon: number; lat: number };
  reducedMotion: boolean;
  onReady?: () => void;
  /** 画布后面是浅色页面时，大气改用透明度混合（叠加混合会在浅底上留下黑圈），星点改成墨色 */
  backdrop?: 'dark' | 'light';
  /** 地球直径占画布高度的比例，默认 0.76 */
  size?: number;
  /** 大气光的颜色，默认蓝色 */
  glow?: number;
  /** 改用 1k 贴图，手机和省流量模式下首屏少下载一半多 */
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

  const manager = new THREE.LoadingManager(() => opts.onReady?.());
  const loader = new THREE.TextureLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (file: string, srgb = true) => {
    const t = loader.load(TEX + file);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const [day, night, spec, cloud] = TEXTURES[opts.lowRes ? 'low' : 'high'];
  const dayMap = tex(day);
  const nightMap = tex(night);
  const specMap = tex(spec, false);
  const cloudMap = tex(cloud, false);

  const sunDir = new THREE.Vector3();
  const uniforms = {
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    specMap: { value: specMap },
    cloudMap: { value: cloudMap },
    sunDir: { value: sunDir },
    cloudShift: { value: 0 },
  };

  const sphere = new THREE.SphereGeometry(1, 128, 64);
  const earth = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ uniforms, vertexShader: worldVertex, fragmentShader: earthFragment }));

  const cloudUniforms = { cloudMap: { value: cloudMap }, sunDir: uniforms.sunDir, cloudShift: uniforms.cloudShift };
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
      uniforms: { sunDir: uniforms.sunDir, lightBg: { value: light ? 1 : 0 }, glow: { value: new THREE.Color().setHex(opts.glow ?? 0x59a6ff, THREE.LinearSRGBColorSpace) } },
      vertexShader: worldVertex,
      fragmentShader: atmoFragment,
      side: THREE.BackSide,
      blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  atmosphere.scale.setScalar(1.12);

  // 所在城市的小光点
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.009, 12, 8),
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

  let visible = true;
  let raf = 0;
  let prev = performance.now();
  const frame = (now: number) => {
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
    group.rotation.set(pitch, yaw, 0);
    stars.rotation.set(pitch * 0.08, yaw * 0.08, 0);
    sunDir.copy(sunLocal).applyQuaternion(group.quaternion);
    if (!opts.reducedMotion) uniforms.cloudShift.value = (now / 1000) * 0.0009;
    renderer.render(scene, camera);
  };
  const start = () => {
    if (raf || !visible || document.hidden) return;
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
      stop();
      ro.disconnect();
      io.disconnect();
      clearInterval(sunTimer);
      document.removeEventListener('visibilitychange', onVisibility);
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
