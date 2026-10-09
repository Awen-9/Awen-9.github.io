// awen 主题交互脚本
document.addEventListener('DOMContentLoaded', function () {
  initThemeToggle();
  initCodeBlocks();
  initHeadingAnchors();
  initToc();
  initReadProgress();
  initBackToTop();
  initUptime();
  initMusic();
});

// ---------- 明暗模式切换 ----------
function initThemeToggle() {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function current() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function update() {
    btn.textContent = current() === 'dark' ? '☀️' : '🌙';
  }

  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
    localStorage.setItem('theme', next);
    update();
  });

  update();
}

// ---------- 代码块：语言标签 + 一键复制 ----------
var LANG_MAP = {
  plaintext: '文本', text: '文本', bash: 'Bash', sh: 'Shell', shell: 'Shell',
  zsh: 'Shell', yaml: 'YAML', yml: 'YAML', json: 'JSON', jsonc: 'JSON',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  java: 'Java', xml: 'XML', html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
  sql: 'SQL', python: 'Python', py: 'Python', go: 'Go', rust: 'Rust',
  ini: 'INI', toml: 'TOML', properties: 'Properties', diff: 'Diff',
  markdown: 'Markdown', md: 'Markdown', nginx: 'Nginx', dockerfile: 'Dockerfile',
  ruby: 'Ruby', php: 'PHP', c: 'C', cpp: 'C++', csharp: 'C#',
  kotlin: 'Kotlin', scala: 'Scala', lua: 'Lua', swift: 'Swift'
};

function initCodeBlocks() {
  var candidates = document.querySelectorAll('.post-content .highlight, .post-content pre');
  var blocks = [];

  // 修正：highlight 内部的 pre 不再单独处理，否则会生成第二个复制按钮
  candidates.forEach(function (el) {
    if (el.tagName === 'PRE' && el.closest('.highlight')) return;
    blocks.push(el);
  });

  blocks.forEach(function (block) {
    if (block.classList.contains('code-block')) return;
    block.classList.add('code-block');

    // 语言标签
    var lang = null;
    Array.prototype.forEach.call(block.classList, function (c) {
      if (c === 'highlight' || c === 'code-block' || lang) return;
      lang = c;
    });
    if (lang) {
      var label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = LANG_MAP[lang] || lang;
      block.appendChild(label);
    }

    // 复制按钮
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制代码');

    btn.addEventListener('click', function () {
      var src = block.querySelector('td.code, code, pre');
      var content = src ? src.innerText : block.innerText;
      navigator.clipboard.writeText(content).then(function () {
        btn.textContent = '已复制';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = '复制';
          btn.classList.remove('copied');
        }, 1600);
      });
    });

    block.appendChild(btn);
  });
}

// ---------- 标题锚点（悬浮显示 §） ----------
function initHeadingAnchors() {
  var headings = document.querySelectorAll('.post-content h2, .post-content h3, .post-content h4');

  headings.forEach(function (h) {
    if (!h.id) return;
    var link = document.createElement('a');
    link.className = 'heading-anchor';
    link.href = '#' + h.id;
    link.textContent = '§';
    link.setAttribute('aria-label', '链接到此标题');
    h.appendChild(link);
  });
}

// ---------- 文章目录（标题数 ≥ 3 时才生成） ----------
function initToc() {
  var box = document.getElementById('post-toc');
  var body = document.getElementById('toc-body');
  if (!box || !body) return;

  var content = document.querySelector('.post-content');
  if (!content) return;

  var heads = content.querySelectorAll('h2, h3');
  if (heads.length < 3) return;

  var root = document.createElement('ol');
  root.className = 'toc-list';
  var links = [];

  heads.forEach(function (h) {
    if (!h.id) return;
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent.replace(/§/g, '').trim();

    var li = document.createElement('li');
    li.appendChild(a);

    if (h.tagName === 'H2') {
      root.appendChild(li);
    } else {
      var parentLi = root.lastElementChild;
      if (parentLi) {
        var sub = parentLi.querySelector('.toc-sub');
        if (!sub) {
          sub = document.createElement('ol');
          sub.className = 'toc-sub';
          parentLi.appendChild(sub);
        }
        sub.appendChild(li);
      } else {
        root.appendChild(li);
      }
    }
    links.push({ el: a, target: h });
  });

  if (!root.children.length) return;
  body.appendChild(root);
  box.hidden = false;

  function spy() {
    var idx = -1;
    for (var i = 0; i < links.length; i++) {
      if (links[i].target.getBoundingClientRect().top <= 130) idx = i;
    }
    links.forEach(function (l, i) {
      l.el.classList.toggle('active', i === idx);
    });
  }

  window.addEventListener('scroll', spy, { passive: true });
  spy();
}

// ---------- 阅读进度条 ----------
function initReadProgress() {
  var bar = document.getElementById('read-progress-bar');
  if (!bar) return;

  function update() {
    var doc = document.documentElement;
    var total = doc.scrollHeight - window.innerHeight;
    var ratio = total > 0 ? window.scrollY / total : 1;
    if (ratio > 1) ratio = 1;
    if (ratio < 0) ratio = 0;
    bar.style.width = ratio * 100 + '%';
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// ---------- 返回顶部 ----------
function initBackToTop() {
  var btn = document.getElementById('back-to-top');
  if (!btn) return;

  function update() {
    btn.hidden = window.scrollY < 400;
  }

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------- 站点运行时长 ----------
function initUptime() {
  var el = document.getElementById('site-uptime');
  if (!el) return;

  var since = el.getAttribute('data-since');
  if (!since) return;

  var start = new Date(since.replace(/-/g, '/')).getTime();
  if (isNaN(start)) return;

  var days = Math.floor((Date.now() - start) / 86400000) + 1;
  el.textContent = (days > 0 ? days : 1) + ' 天';
}

// ---------- 音乐播放器 ----------
// 没引第三方 UI 库：只从 Meting 接口取曲目数据（名称/歌手/音频/封面/歌词），
// 界面是自己写的——封面唱片 + 胶囊条 + 毛玻璃面板。
var MUSIC_STATE_KEY = 'awen-music-state';
var MUSIC_VOLUME_KEY = 'awen-music-volume';

var MP_ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L19 12z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 5h2.7v14H8.4zM12.9 5h2.7v14h-2.7z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.5v13"/><path d="M18.5 6.3v11.4L9.7 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5.5v13"/><path d="M5.5 6.3v11.4L14.3 12z"/></svg>',
  loop: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 4.5L19 7l-2.5 2.5"/><path d="M19 7H8.5A4 4 0 004.5 11v1"/><path d="M7.5 19.5L5 17l2.5-2.5"/><path d="M5 17h10.5a4 4 0 004-4v-1"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3L11 6v12l-4-3.5H4z"/><path d="M15 9.6a3.4 3.4 0 010 4.8"/><path d="M17.6 7a7 7 0 010 10"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3L11 6v12l-4-3.5H4z"/><path d="M15.5 10l4 4M19.5 10l-4 4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14.5l6-6 6 6"/></svg>'
};

function initMusic() {
  var root = document.querySelector('.music-root');
  if (!root || !window.fetch || !window.Audio) return;

  var cfg = {
    api: root.getAttribute('data-api') || '',
    server: root.getAttribute('data-server') || 'netease',
    type: root.getAttribute('data-type') || 'song',
    id: root.getAttribute('data-id') || '',
    volume: parseFloat(root.getAttribute('data-volume')),
    loop: root.getAttribute('data-loop') || 'all',
    order: root.getAttribute('data-order') || 'list',
    lrc: root.getAttribute('data-lrc') === '1',
    page: root.getAttribute('data-mode') === 'page'
  };
  if (!cfg.id) return;

  var url = cfg.api.indexOf(':id') >= 0
    ? cfg.api.replace(':server', cfg.server).replace(':type', cfg.type).replace(':id', cfg.id).replace(':r', String(Date.now()))
    : cfg.api.replace(/\/+$/, '') + '?server=' + cfg.server + '&type=' + cfg.type + '&id=' + cfg.id;

  fetch(url).then(function (res) {
    return res.json();
  }).then(function (data) {
    var raw = Array.isArray(data) ? data : [data];
    var tracks = [];
    raw.forEach(function (t) {
      if (!t || !t.url) return;
      tracks.push({
        name: t.name || t.title || '未命名曲目',
        artist: t.artist || t.author || '',
        url: t.url,
        cover: t.cover || t.pic || '',
        lrc: t.lrc || t.lyric || ''
      });
    });
    if (!tracks.length) return;
    mountMusic(root, tracks, cfg);
  }).catch(function () {
    // 接口不通就什么都不显示，不给访客看一个坏掉的播放器
  });
}

function mountMusic(root, tracks, cfg) {
  if (root.getAttribute('data-mounted')) return; // 防止被重复初始化挂出两套播放器
  root.setAttribute('data-mounted', '1');

  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function trackKey(t) { return t.name + '|' + t.artist; }

  var audio = new Audio();
  audio.preload = 'metadata';

  // 恢复上一页的进度（静态站翻页＝整页刷新，音乐不能白断）
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(MUSIC_STATE_KEY) || 'null'); } catch (e) {}
  var found = -1;
  if (saved && saved.key) {
    for (var i = 0; i < tracks.length; i++) {
      if (trackKey(tracks[i]) === saved.key) { found = i; break; }
    }
  }
  var startTime = found >= 0 ? (saved.time || 0) : 0;
  var resumePlay = found >= 0 && !!saved.playing;

  var state = {
    index: found >= 0 ? found : 0,
    loop: cfg.loop,
    lrcLines: [],
    lrcNodes: null,
    lrcIndex: -2
  };

  // 音量：优先用上次调过的
  var savedVolume = parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY) || '');
  if (isNaN(savedVolume)) savedVolume = isNaN(cfg.volume) ? 0.6 : cfg.volume;

  // ---------- 结构 ----------
  var pill = h('div', 'mp-pill');
  var expandBtn = h('button', 'mp-expand');
  expandBtn.type = 'button';
  expandBtn.setAttribute('aria-label', '展开播放器');
  expandBtn.innerHTML =
    '<span class="mp-cover"><img class="mp-cover-img" alt="" loading="lazy"></span>' +
    '<span class="mp-text"><span class="mp-title">—</span><span class="mp-artist"></span></span>' +
    '<span class="mp-chevron">' + MP_ICON.chevron + '</span>';

  var toggleBtn = h('button', 'mp-toggle');
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', '播放或暂停');
  toggleBtn.innerHTML = MP_ICON.play;

  pill.appendChild(expandBtn);
  pill.appendChild(toggleBtn);

  var panel = h('div', 'mp-panel');
  panel.innerHTML =
    '<div class="mp-head">' +
      '<span class="mp-cover mp-cover-lg"><img class="mp-cover-img" alt="" loading="lazy"></span>' +
      '<span class="mp-meta"><span class="mp-title">—</span><span class="mp-artist"></span></span>' +
    '</div>' +
    '<div class="mp-bar"><span class="mp-played"><span class="mp-thumb"></span></span></div>' +
    '<div class="mp-time"><span class="mp-cur">00:00</span><span class="mp-total">00:00</span></div>' +
    '<div class="mp-controls">' +
      '<button class="mp-btn mp-prev" type="button" aria-label="上一首">' + MP_ICON.prev + '</button>' +
      '<button class="mp-btn mp-play mp-btn-main" type="button" aria-label="播放或暂停">' + MP_ICON.play + '</button>' +
      '<button class="mp-btn mp-next" type="button" aria-label="下一首">' + MP_ICON.next + '</button>' +
      '<button class="mp-btn mp-loop" type="button" aria-label="循环模式">' + MP_ICON.loop + '</button>' +
      '<button class="mp-btn mp-mute" type="button" aria-label="静音">' + MP_ICON.volume + '</button>' +
      '<span class="mp-vol"><span class="mp-vol-fill"></span></span>' +
    '</div>' +
    '<div class="mp-lrc"><div class="mp-lrc-inner"></div></div>';

  root.appendChild(pill);
  root.appendChild(panel);
  root.hidden = false;

  var covers = root.querySelectorAll('.mp-cover-img');
  var titles = root.querySelectorAll('.mp-title');
  var artists = root.querySelectorAll('.mp-artist');
  var played = root.querySelector('.mp-played');
  var thumb = root.querySelector('.mp-thumb');
  var bar = root.querySelector('.mp-bar');
  var curEl = root.querySelector('.mp-cur');
  var totalEl = root.querySelector('.mp-total');
  var mainBtn = root.querySelector('.mp-btn-main');
  var loopBtn = root.querySelector('.mp-loop');
  var muteBtn = root.querySelector('.mp-mute');
  var volBox = root.querySelector('.mp-vol');
  var volFill = root.querySelector('.mp-vol-fill');
  var lrcBox = root.querySelector('.mp-lrc');
  var lrcInner = root.querySelector('.mp-lrc-inner');

  // ---------- 小工具 ----------
  function current() { return tracks[state.index]; }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setIcon(playing) {
    var html = playing ? MP_ICON.pause : MP_ICON.play;
    toggleBtn.innerHTML = html;
    mainBtn.innerHTML = html;
  }

  function setProgress(ratio) {
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    played.style.width = (ratio * 100) + '%';
  }

  function whenReady(fn) {
    var done = false;
    function once() {
      if (done) return;
      done = true;
      fn();
    }
    if (audio.readyState >= 1) return once();
    audio.addEventListener('loadedmetadata', once, { once: true });
    setTimeout(once, 3000);
  }

  // ---------- 载入曲目 ----------
  function load(index, autoplay) {
    var n = tracks.length;
    state.index = ((index % n) + n) % n;
    var t = current();

    state.lrcLines = [];
    state.lrcNodes = null;
    state.lrcIndex = -2;
    if (lrcInner) lrcInner.innerHTML = '';
    if (lrcInner) lrcInner.style.transform = '';

    titles.forEach(function (el) { el.textContent = t.name; });
    artists.forEach(function (el) { el.textContent = t.artist; });
    covers.forEach(function (img) {
      if (t.cover) {
        img.src = t.cover;
        img.removeAttribute('hidden');
      } else {
        img.removeAttribute('src');
        img.setAttribute('hidden', '');
      }
    });
    root.classList.toggle('mp-no-cover', !t.cover);

    audio.src = t.url;
    totalEl.textContent = '00:00';
    curEl.textContent = '00:00';
    setProgress(0);
    setIcon(false);
    root.classList.remove('is-playing');

    loadLrc(t);
    if (autoplay) play();
  }

  function play() {
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function () {
        // 浏览器拦截自动播放：把界面复位，等用户自己点
        setIcon(false);
        root.classList.remove('is-playing');
      });
    }
  }

  function toggle() {
    if (audio.paused) play();
    else audio.pause();
  }

  function step(delta, forcePlay) {
    if (tracks.length <= 1) {
      audio.currentTime = 0;
      if (forcePlay) play();
      return;
    }
    var next = state.index + delta;
    if (cfg.order === 'random' && delta > 0) next = Math.floor(Math.random() * tracks.length);
    load(next, forcePlay === undefined ? !audio.paused : forcePlay);
  }

  // ---------- 循环模式 ----------
  function applyLoop() {
    audio.loop = state.loop === 'one' || (tracks.length === 1 && state.loop !== 'none');
    loopBtn.setAttribute('data-mode', state.loop);
    loopBtn.classList.toggle('is-on', state.loop !== 'none');
  }

  loopBtn.addEventListener('click', function () {
    state.loop = state.loop === 'all' ? 'one' : (state.loop === 'one' ? 'none' : 'all');
    applyLoop();
    saveState(true);
  });

  // ---------- 音量 ----------
  function syncVolume() {
    var v = audio.muted ? 0 : audio.volume;
    volFill.style.width = (v * 100) + '%';
    muteBtn.innerHTML = v <= 0 ? MP_ICON.mute : MP_ICON.volume;
  }

  function setVolume(v) {
    v = Math.min(Math.max(v, 0), 1);
    audio.muted = false;
    audio.volume = v;
    syncVolume();
    try { localStorage.setItem(MUSIC_VOLUME_KEY, String(v)); } catch (e) {}
  }

  muteBtn.addEventListener('click', function () {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      if (audio.volume === 0) audio.volume = 0.6;
    } else {
      audio.muted = true;
    }
    syncVolume();
  });

  function ratioAt(box, clientX) {
    var r = box.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
  }

  // 进度条：按下即定位，拖动实时预览，松手才真正跳转
  var dragging = false;
  var dragRatio = 0;

  function preview(ratio) {
    dragRatio = ratio;
    setProgress(ratio);
    curEl.textContent = fmt((isFinite(audio.duration) ? audio.duration : 0) * ratio);
  }

  bar.addEventListener('pointerdown', function (e) {
    dragging = true;
    preview(ratioAt(bar, e.clientX));
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  bar.addEventListener('pointermove', function (e) {
    if (dragging) preview(ratioAt(bar, e.clientX));
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = dragRatio * audio.duration;
    }
    renderProgress();
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  var volDragging = false;
  volBox.addEventListener('pointerdown', function (e) {
    volDragging = true;
    setVolume(ratioAt(volBox, e.clientX));
    try { volBox.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  volBox.addEventListener('pointermove', function (e) {
    if (volDragging) setVolume(ratioAt(volBox, e.clientX));
  });
  volBox.addEventListener('pointerup', function () { volDragging = false; });
  volBox.addEventListener('pointercancel', function () { volDragging = false; });

  // ---------- 歌词 ----------
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function parseLrc(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (line) {
      var content = line.replace(/\[[^\]]*\]/g, '').trim();
      if (!content) return;
      var re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
      var m;
      while ((m = re.exec(line))) {
        var frac = m[3] || '';
        if (frac.length === 1) frac += '00';
        else if (frac.length === 2) frac += '0';
        out.push({
          t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (parseInt(frac, 10) || 0) / 1000,
          text: content
        });
      }
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function loadLrc(track) {
    if (!cfg.lrc || !lrcInner || !track.lrc) return;
    var key = trackKey(track);
    fetch(track.lrc).then(function (res) {
      return res.text();
    }).then(function (text) {
      if (trackKey(current()) !== key) return; // 已经切歌了，丢掉这份歌词
      var lines = parseLrc(text);
      if (!lines.length) return;
      state.lrcLines = lines;
      var html = '';
      for (var i = 0; i < lines.length; i++) html += '<p>' + esc(lines[i].text) + '</p>';
      lrcInner.innerHTML = html;
      state.lrcNodes = lrcInner.children;
      state.lrcIndex = -2;
      syncLrc(audio.currentTime);
    }).catch(function () {});
  }

  function syncLrc(t) {
    var nodes = state.lrcNodes;
    if (!nodes || !nodes.length) return;
    var idx = -1;
    for (var i = 0; i < state.lrcLines.length; i++) {
      if (state.lrcLines[i].t <= t + 0.3) idx = i;
      else break;
    }
    if (idx === state.lrcIndex) return;
    state.lrcIndex = idx;
    for (var k = 0; k < nodes.length; k++) nodes[k].classList.toggle('active', k === idx);
    var node = nodes[idx];
    if (node && node.offsetTop >= 0) {
      var offset = lrcBox.clientHeight / 2 - node.offsetTop - node.offsetHeight / 2;
      lrcInner.style.transform = 'translateY(' + offset + 'px)';
    }
  }

  // ---------- 跨页续播 ----------
  var lastSave = 0;
  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 1000) return;
    lastSave = now;
    try {
      sessionStorage.setItem(MUSIC_STATE_KEY, JSON.stringify({
        key: trackKey(current()),
        time: audio.currentTime || 0,
        playing: !audio.paused
      }));
    } catch (e) {}
  }
  window.addEventListener('pagehide', function () { saveState(true); });

  // ---------- 统一刷新进度（改动 currentTime 后要手动同步界面） ----------
  function renderProgress() {
    var d = audio.duration;
    if (!dragging && isFinite(d) && d > 0) {
      setProgress(audio.currentTime / d);
      curEl.textContent = fmt(audio.currentTime);
    }
    if (isFinite(d) && d > 0) totalEl.textContent = fmt(d);
    syncLrc(audio.currentTime);
  }

  // ---------- 事件 ----------
  audio.addEventListener('play', function () {
    root.classList.add('is-playing');
    setIcon(true);
    saveState(true);
  });
  audio.addEventListener('pause', function () {
    root.classList.remove('is-playing');
    setIcon(false);
    saveState(true);
  });
  audio.addEventListener('loadedmetadata', function () {
    totalEl.textContent = fmt(audio.duration);
  });
  audio.addEventListener('seeked', renderProgress);
  audio.addEventListener('timeupdate', function () {
    renderProgress();
    saveState(false);
  });
  audio.addEventListener('ended', function () {
    if (audio.loop) return;
    if (tracks.length === 1 || (state.loop === 'none' && state.index === tracks.length - 1)) {
      setIcon(false);
      root.classList.remove('is-playing');
      setProgress(0);
      curEl.textContent = '00:00';
      return;
    }
    step(1, true);
  });
  audio.addEventListener('error', function () {
    setIcon(false);
    root.classList.remove('is-playing');
  });

  expandBtn.addEventListener('click', function () {
    root.classList.toggle('open');
  });
  toggleBtn.addEventListener('click', toggle);
  mainBtn.addEventListener('click', toggle);
  root.querySelector('.mp-prev').addEventListener('click', function () { step(-1); });
  root.querySelector('.mp-next').addEventListener('click', function () { step(1); });

  document.addEventListener('click', function (e) {
    if (root.classList.contains('open') && !root.contains(e.target)) root.classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') root.classList.remove('open');
  });

  // ---------- 启动 ----------
  applyLoop();
  setVolume(savedVolume);
  load(state.index, false);
  if (startTime > 3 || resumePlay) {
    whenReady(function () {
      if (startTime > 3 && isFinite(audio.duration) && startTime < audio.duration - 5) {
        audio.currentTime = startTime;
        renderProgress(); // 浏览器不一定会补发 timeupdate，这里手动同步界面
      }
      if (resumePlay) play();
    });
  }
}
