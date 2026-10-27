// 首页的行为层：地球、时钟、面板路由
import { mountEarth, subsolarPoint, type EarthHandle, type EarthOptions } from './earth';
import { HOME } from '../config';

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const PANELS = ['posts', 'categories', 'about'];

/** 页面是浅色的，地球用浅底模式，光点在 HOME 配置的城市 */
export function earth(canvas: HTMLCanvasElement, opts: Partial<EarthOptions> = {}): EarthHandle | null {
  const handle = mountEarth(canvas, {
    home: { lon: HOME.lon, lat: HOME.lat },
    reducedMotion,
    backdrop: 'light',
    onReady: () => canvas.classList.add('ready'),
    ...opts,
  });
  if (!handle) document.documentElement.classList.add('no-webgl');
  return handle;
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('zh-CN', { timeZone: HOME.timeZone, ...o });
const dateFmt = fmt({ month: 'long', day: 'numeric', weekday: 'long' });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function sunLine(date = new Date()) {
  const s = subsolarPoint(date);
  const lon = ((s.lon + 540) % 360) - 180;
  const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
  return `太阳直射 ${deg(s.lat, 'N', 'S')} ${deg(lon, 'E', 'W')}`;
}

type ClockValues = Record<'time' | 'date' | 'sun', string>;

/** 每 10 秒刷新 [data-clock="time|date|sun"]，按 HOME.timeZone 显示 */
export function clock(onTick?: (v: ClockValues) => void) {
  const tick = () => {
    const now = new Date();
    const values: ClockValues = { time: timeFmt.format(now), date: dateFmt.format(now), sun: sunLine(now) };
    for (const el of document.querySelectorAll<HTMLElement>('[data-clock]')) {
      el.textContent = values[el.dataset.clock as keyof ClockValues];
    }
    onTick?.(values);
  };
  tick();
  setInterval(tick, 10_000);
}

/**
 * 面板状态：hash 路由（#posts #categories #about），支持前进后退，Esc 回到首屏。
 * [data-go="id"] 的元素点击即切换，data-go="" 关闭，带 data-toggle 时再次点击会收起。
 * 同步维护 [data-go] 上的 aria-current 与 aria-expanded，html[data-panel]，以及非当前 [data-box] 的 inert。
 */
export function panels(onChange: (id: string, prev: string, init: boolean) => void) {
  let current = '';
  const read = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    return PANELS.includes(id) ? id : '';
  };
  const sync = () => {
    document.documentElement.dataset.panel = current;
    for (const el of document.querySelectorAll<HTMLElement>('[data-box]')) el.inert = el.dataset.box !== current;
    for (const el of document.querySelectorAll<HTMLElement>('[data-go]')) {
      const on = !!current && el.dataset.go === current;
      if (el.dataset.go) on ? el.setAttribute('aria-current', 'true') : el.removeAttribute('aria-current');
      if (el.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', String(on));
    }
  };
  const apply = (force = false) => {
    const next = read();
    if (next === current && !force) return;
    const prev = current;
    current = next;
    sync();
    onChange(next, prev, force);
  };
  const go = (id: string) => {
    if (id === current) return;
    history.pushState(null, '', id ? `#${id}` : location.pathname);
    apply();
  };
  addEventListener('popstate', () => apply());
  addEventListener('hashchange', () => apply());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) go('');
  });
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-go]');
    if (!el) return;
    e.preventDefault();
    const id = el.dataset.go ?? '';
    go(id === current && el.hasAttribute('data-toggle') ? '' : id);
  });
  apply(true);
  return {
    go,
    get current() {
      return current;
    },
  };
}

/** 打开面板后把焦点移进面板，关闭后还给打开它的入口，键盘用户不会迷路 */
export function moveFocus(id: string, prev: string) {
  const el = id
    ? document.querySelector<HTMLElement>(`[data-box="${id}"]`)
    : document.querySelector<HTMLElement>(`[data-go="${prev}"]`);
  el?.focus({ preventScroll: true });
}
