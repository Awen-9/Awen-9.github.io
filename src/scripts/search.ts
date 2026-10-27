// 全站搜索：⌘K / Ctrl K 在任何页面打开，子页面上也可以按 /。
// 索引第一次打开时才去拉，标题命中排最前，其次是标签和分类、摘要、正文；多个词用空格隔开，要全部命中
export interface Entry {
  url: string;
  title: string;
  description: string;
  date: string;
  category: string;
  tags: string[];
  body: string;
}

let index: Promise<Entry[]> | undefined;
export const loadIndex = () =>
  (index ??= fetch('/search.json')
    .then((r) => r.json() as Promise<Entry[]>)
    .catch(() => {
      index = undefined;
      return [];
    }));

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
let dialog: HTMLDialogElement | null = null;

export function openSearch() {
  dialog ??= setup();
  if (!dialog) return;
  const input = dialog.querySelector('input')!;
  if (!dialog.open) dialog.showModal();
  input.select();
  input.dispatchEvent(new Event('input'));
}

function score(p: Entry, terms: string[]) {
  let total = 0;
  const title = p.title.toLowerCase();
  const meta = [p.category, ...p.tags].join(' ').toLowerCase();
  const desc = p.description.toLowerCase();
  for (const t of terms) {
    const s = title.includes(t) ? 8 : meta.includes(t) ? 4 : desc.includes(t) ? 2 : p.body.includes(t) ? 1 : 0;
    if (!s) return 0;
    total += s;
  }
  return total;
}

// 正文命中时截出关键词前后一小段，没有命中正文就用摘要
function snippet(p: Entry, terms: string[]) {
  const t = terms.find((x) => p.body.includes(x));
  if (!t || terms.some((x) => p.title.toLowerCase().includes(x))) return p.description;
  const i = p.body.indexOf(t);
  const start = Math.max(0, i - 24);
  return (start ? '…' : '') + p.body.slice(start, i + t.length + 48) + '…';
}

// 用 <mark> 标出关键词，全程只拼文本节点
function highlight(el: HTMLElement, text: string, terms: string[]) {
  el.textContent = '';
  const lower = text.toLowerCase();
  let at = 0;
  while (at < text.length) {
    let next = -1;
    let len = 0;
    for (const t of terms) {
      const i = lower.indexOf(t, at);
      if (i >= 0 && (next < 0 || i < next)) [next, len] = [i, t.length];
    }
    if (next < 0) break;
    el.append(text.slice(at, next));
    const m = document.createElement('mark');
    m.textContent = text.slice(next, next + len);
    el.append(m);
    at = next + len;
  }
  el.append(text.slice(at));
}

function setup() {
  const box = document.getElementById('c-find') as HTMLDialogElement | null;
  if (!box) return null;
  const input = box.querySelector('input')!;
  const list = box.querySelector('ol')!;
  const status = box.querySelector('output')!;
  let sel = 0;

  const select = (i: number) => {
    const items = [...list.querySelectorAll('a')];
    if (!items.length) return;
    sel = (i + items.length) % items.length;
    items.forEach((a, j) => (j === sel ? a.setAttribute('aria-selected', 'true') : a.removeAttribute('aria-selected')));
    items[sel].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', items[sel].id);
  };

  const render = async () => {
    const raw = input.value.trim();
    const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);
    const all = await loadIndex();
    if (raw !== input.value.trim()) return;
    const hits = terms.length
      ? all
          .map((p) => ({ p, s: score(p, terms) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.p)
      : all.slice(0, 6);
    list.textContent = '';
    hits.slice(0, 20).forEach((p, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = p.url;
      a.id = `c-find-${i}`;
      a.setAttribute('role', 'option');
      const t = document.createElement('strong');
      highlight(t, p.title, terms);
      const m = document.createElement('small');
      m.textContent = `${p.date} · ${p.category}${p.tags.length ? ' · #' + p.tags.join(' #') : ''}`;
      const d = document.createElement('span');
      highlight(d, snippet(p, terms), terms);
      a.append(t, m, d);
      a.addEventListener('pointermove', () => i !== sel && select(i));
      li.append(a);
      list.append(li);
    });
    status.textContent = terms.length ? (hits.length ? `${hits.length} 篇` : '没有找到，换个词试试') : '最近的文章';
    select(0);
  };

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(sel + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      list.querySelector<HTMLAnchorElement>('a[aria-selected]')?.click();
    }
  });
  // Esc 直接关搜索框（search 输入框默认会先清空文字），也不顺带关掉首页的抽屉
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    box.close();
  });
  box.addEventListener('click', (e) => e.target === box && box.close());
  return box;
}

addEventListener('keydown', (e) => {
  const typing = (e.target as Element).closest('input, textarea, [contenteditable]');
  if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) {
    e.preventDefault();
    return dialog?.open ? dialog.close() : openSearch();
  }
  // 首页的 / 由首页自己分配：抽屉打开时过滤抽屉，否则才打开这里
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !document.body.classList.contains('c-home')) {
    e.preventDefault();
    openSearch();
  }
});
document.addEventListener('click', (e) => {
  if ((e.target as Element).closest('[data-search]')) openSearch();
});
// 快捷键提示按系统改写，Windows 上显示 Ctrl K
if (!isMac) for (const k of document.querySelectorAll('[data-search-key]')) k.textContent = 'Ctrl K';
