// 阅读页的行为层：返回首页、小节链接、目录高亮、进度条、代码块按钮

/** 从站内首页点进来的，回到首页就是后退一步，抽屉、滚动位置都原样还在；直接打开的才跳到文章抽屉 */
function backLink() {
  const back = document.querySelector<HTMLAnchorElement>('.lp-back')!;
  back.addEventListener('click', (e) => {
    const ref = document.referrer && new URL(document.referrer);
    if (ref && ref.origin === location.origin && ref.pathname === '/' && history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });
}

/** 每个小节标题前挂一个 # 链接，点了复制这一节的地址 */
function anchors() {
  for (const h of document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')) {
    const a = document.createElement('a');
    a.className = 'c-anchor';
    a.href = `#${h.id}`;
    a.textContent = '#';
    a.setAttribute('aria-label', `复制“${h.textContent}”这一节的链接`);
    a.addEventListener('click', () => navigator.clipboard?.writeText(a.href).catch(() => {}));
    h.append(a);
  }
}

/** 目录：读到哪一节就把哪一项点亮。宽屏默认展开在模板里首帧前就定了 */
function toc() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.c-toc a')];
  if (!links.length) return;
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  const light = () => {
    let i = -1;
    heads.forEach((h, j) => h && h.getBoundingClientRect().top < 140 && (i = j));
    links.forEach((a, j) => (j === i ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  };
  addEventListener('scroll', light, { passive: true });
  light();
}

/** 顶部进度条，按文章卡片读过的比例 */
function progress(article: HTMLElement) {
  const bar = document.body.appendChild(document.createElement('div'));
  bar.className = 'c-progress';
  const update = () => {
    const { top, height } = article.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -top / (height - innerHeight)));
    bar.style.setProperty('--p', String(p));
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

const button = (bar: HTMLElement, text: string) => {
  const b = bar.appendChild(document.createElement('button'));
  b.type = 'button';
  b.className = 'c-copy';
  b.textContent = text;
  return b;
};

/** 代码块右上角的 wrap 和 copy。长代码两种看法：默认一行不折、横向滚动，切到 wrap 后按页面宽度换行。选择记在本地，所有代码块一起切 */
function codeBlocks() {
  const root = document.documentElement;
  const wraps: HTMLButtonElement[] = [];
  const setWrap = (on: boolean) => {
    root.classList.toggle('c-wrap', on);
    for (const b of wraps) b.setAttribute('aria-pressed', String(on));
  };
  // wrap 按钮只给不换行时放不下的代码块，量的时候先临时取消换行
  const markLong = () => {
    const on = root.classList.contains('c-wrap');
    root.classList.remove('c-wrap');
    for (const b of wraps) {
      const pre = b.closest('.c-code')!.querySelector('pre')!;
      b.hidden = pre.scrollWidth <= pre.clientWidth;
    }
    root.classList.toggle('c-wrap', on);
  };

  // 按钮挂在代码块外面包的一层上，代码横向滚动时它不跟着走
  for (const pre of document.querySelectorAll('.prose pre')) {
    const box = document.createElement('div');
    box.className = 'c-code';
    pre.before(box);
    box.append(pre);
    const bar = box.appendChild(document.createElement('div'));
    bar.className = 'c-code-bar';

    const wrap = button(bar, 'wrap');
    wrap.title = '长行换行显示 / 横向滚动';
    wrap.addEventListener('click', () => {
      const on = !root.classList.contains('c-wrap');
      localStorage.setItem('c:wrap', on ? '1' : '');
      setWrap(on);
      wrap.scrollIntoView({ block: 'nearest' });
    });
    wraps.push(wrap);

    const copy = button(bar, 'copy');
    copy.addEventListener('click', async () => {
      // 非 https 打开（比如手机连局域网预览）时没有 clipboard，用户拒绝授权时会抛错，都要给个反馈，不能毫无动静
      const ok = await navigator.clipboard
        ?.writeText(pre.querySelector('code')?.textContent ?? '')
        .then(() => true, () => false);
      copy.textContent = ok ? 'copied' : 'failed';
      copy.classList.toggle('is-done', !!ok);
      setTimeout(() => {
        copy.textContent = 'copy';
        copy.classList.remove('is-done');
      }, 1500);
    });
  }
  setWrap(!!localStorage.getItem('c:wrap'));
  markLong();
  addEventListener('resize', markLong);
}

export function initPost() {
  // 记下读到哪篇，回首页时在抽屉里标出来。悬停时浏览器可能已在后台预渲染这一页，
  // 预渲染期间写的 sessionStorage 打开后会被丢掉，所以等真正打开了再记
  const remember = () => sessionStorage.setItem('c:last', location.pathname);
  if ((document as Document & { prerendering?: boolean }).prerendering) {
    document.addEventListener('prerenderingchange', remember, { once: true });
  } else remember();
  const article = document.querySelector<HTMLElement>('article')!;
  backLink();
  anchors();
  toc();
  progress(article);
  codeBlocks();
}
