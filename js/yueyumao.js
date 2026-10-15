const YUEYU_CATALOG = (() => {
  const origin = 'https://www.yueyumao.com';
  const views = new Map();
  const audio = new Audio();
  audio.controls = true;
  audio.preload = 'none';
  let owner = null, generation = 0, dependencies;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function safeURL(value, kind) {
    try {
      const url = new URL(value, origin);
      if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null;
      if (kind === 'post' && /^\/post\/[1-9]\d{0,7}\.html$/.test(url.pathname)) return url.href;
      if (kind === 'audio' && /^\/(?:files|wav|voice\/liju)\/[^/]+\.mp3$/i.test(url.pathname)) return url.href;
    } catch (_) {}
    return null;
  }

  function fullText(link) {
    const title = link?.getAttribute('title') || '';
    return /[“"]([\s\S]*?)[”"]/.exec(title)?.[1] || link?.textContent.trim() || '';
  }

  function parseList(html, type, query) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const entries = [], seen = new Set();
    for (const node of doc.querySelectorAll('.card-body')) {
      const labels = [...node.querySelectorAll('.zhong')];
      const chinese = labels.find(el => el.textContent.includes('中文'))?.nextElementSibling;
      const cantonese = labels.find(el => el.textContent.includes('粤语'))?.nextElementSibling;
      const source = safeURL(chinese?.getAttribute('href'), 'post');
      if (!source || seen.has(source)) continue;
      seen.add(source);
      entries.push({ id: /\/(\d+)\.html$/.exec(source)[1], chinese: fullText(chinese), cantonese: fullText(cantonese),
        source, audio: safeURL(node.querySelector('audio[src], audio source[src]')?.getAttribute('src'), 'audio') });
    }
    let pages = 1;
    for (const a of doc.querySelectorAll('a[href]')) {
      try {
        const url = new URL(a.getAttribute('href'), origin);
        if (url.origin !== origin) continue;
        if (type === 'search' && url.pathname === '/search.php' && url.searchParams.get('q') === query) {
          const n = Number(url.searchParams.get('page') || 1);
          if (Number.isInteger(n) && n > 0 && n <= 9999) pages = Math.max(pages, n);
        } else if (type !== 'search') {
          const match = new RegExp('^/category-' + (type === 'daily' ? 2 : 3) + '(?:_(\\d+))?\\.html$').exec(url.pathname);
          if (match) pages = Math.max(pages, Math.min(9999, Number(match[1] || 1)));
        }
      } catch (_) {}
    }
    return { entries, pages };
  }

  function parseDetail(html, source) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...doc.querySelectorAll('.yym-text li')];
    const text = label => rows.find(row => row.querySelector('.zhong')?.textContent.trim() === label)?.querySelector('strong')?.textContent.trim() || '';
    const chinese = text('中文'), cantonese = text('粤语');
    if (!chinese || !cantonese) throw new Error('词条格式已变化，请通过来源链接查看');
    return { chinese, cantonese, source, audio: safeURL(doc.querySelector('audio[id^="fayin_sample"][src], audio source[src]')?.getAttribute('src'), 'audio') };
  }

  function stop() {
    generation++;
    audio.pause();
    if (owner) {
      owner.root.querySelectorAll('[data-catalog-play]').forEach(button => { button.classList.remove('playing'); button.setAttribute('aria-pressed', 'false'); });
      const label = owner.root.querySelector('[data-now-playing]');
      if (label) label.textContent = '';
    }
  }

  function play(view, item, button) {
    dependencies.stopOthers();
    stop();
    owner = view;
    const token = generation;
    const label = view.root.querySelector('[data-now-playing]');
    label.textContent = item.cantonese;
    audio.src = location.protocol === 'file:' ? item.audio :
      '/api/yueyumao-audio?' + new URLSearchParams({ path: new URL(item.audio).pathname });
    audio.playbackRate = Number(view.root.querySelector('[data-catalog-rate]').value);
    audio.preservesPitch = true;
    view.root.querySelector('[data-catalog-player]').append(audio);
    button?.classList.add('playing');
    button?.setAttribute('aria-pressed', 'true');
    const failed = () => { if (token === generation) { stop(); label.textContent = '录音播放失败，请检查网络，或在外部浏览器重试。'; } };
    audio.onerror = failed;
    audio.onended = () => { if (token === generation) stop(); };
    audio.play().catch(failed);
  }

  function render(view) {
    const { root, entries, page, pages, query, detail } = view;
    const body = root.querySelector('[data-catalog-body]');
    const playButton = (item, index) => `<button class="btn small catalog-play" data-catalog-play="${index}" aria-label="播放${esc(item.cantonese)}" title="播放录音" aria-pressed="false" ${item.audio ? '' : 'disabled'}>&#9654;</button>`;
    if (detail) {
      body.innerHTML = `<button class="btn small" data-catalog-back>返回列表</button><article class="catalog-detail"><h2>${esc(detail.cantonese)}</h2><p>普通话：${esc(detail.chinese)}</p><div class="catalog-actions">${playButton(detail, 'detail')}<a href="${esc(detail.source)}" target="_blank" rel="noopener noreferrer">粤语猫原文</a></div></article>`;
      return;
    }
    body.innerHTML = `<div class="catalog-summary">${query ? '全站搜索：' + esc(query) : view.type === 'daily' ? '日常粤语' : '粤语词组'} · 第 ${page} / ${pages} 页 · 本页 ${entries.length} 条</div>
      <div class="catalog-list">${entries.length ? entries.map((item, i) => `<article class="catalog-row"><div class="catalog-text"><button class="catalog-title" data-catalog-detail="${i}">${esc(item.cantonese)}</button><p>${esc(item.chinese)}</p></div><div class="catalog-actions">${playButton(item, i)}<button class="btn small" data-catalog-detail="${i}">详情</button></div></article>`).join('') : '<p class="catalog-empty">暂无结果，请换一个关键词。</p>'}</div>
      <form class="catalog-pagination"><button class="btn small" type="button" data-catalog-page="${page - 1}" title="上一页" aria-label="上一页" ${page <= 1 ? 'disabled' : ''}>&larr;</button><label>第 <input name="page" aria-label="跳转页码" type="number" min="1" max="${pages}" value="${page}" required> / ${pages} 页</label><button class="btn small" type="submit">跳转</button><button class="btn small" type="button" data-catalog-page="${page + 1}" title="下一页" aria-label="下一页" ${page >= pages ? 'disabled' : ''}>&rarr;</button></form>`;
  }

  async function request(params, signal) {
    if (location.protocol === 'file:') throw new Error('在线栏目需要服务器模式，请运行 node server.js 后访问网站。');
    const response = await fetch('/api/yueyumao?' + new URLSearchParams(params), { signal });
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('在线栏目接口不可用，请更新并重启项目服务器。'); }
    if (!response.ok) throw new Error(result.error || '在线栏目加载失败');
    return result;
  }

  async function load(view, page = view.page, id = null) {
    stop();
    view.controller?.abort();
    const controller = new AbortController();
    view.controller = controller;
    view.retry = () => load(view, page, id);
    const body = view.root.querySelector('[data-catalog-body]');
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = '<p class="catalog-empty" role="status">加载中…</p>';
    try {
      const type = id ? 'detail' : view.query ? 'search' : view.type;
      const result = await request(id ? { type, id } : { type, page, q: view.query }, controller.signal);
      if (controller.signal.aborted) return;
      if (id) view.detail = parseDetail(result.html, safeURL(result.source, 'post'));
      else {
        const parsed = parseList(result.html, type, view.query);
        if (!parsed.entries.length && !view.query) throw new Error('来源栏目格式已变化，请稍后重试或查看来源网站。');
        Object.assign(view, parsed, { page, detail: null, loaded: true });
      }
      render(view);
    } catch (error) {
      if (controller.signal.aborted) return;
      body.innerHTML = `<div class="catalog-empty" role="alert"><p>${esc(error.message)}</p><button class="btn small" data-catalog-retry>重试</button> <a href="${origin}/category-${view.type === 'daily' ? 2 : 3}.html" target="_blank" rel="noopener noreferrer">访问来源栏目</a></div>`;
    } finally { if (!controller.signal.aborted) body.setAttribute('aria-busy', 'false'); }
  }

  function mount(root, type, deps) {
    dependencies = deps;
    const view = { root, type, page: 1, pages: 1, query: '', entries: [], detail: null, loaded: false };
    views.set(type, view);
    root.innerHTML = `<form class="catalog-search"><input name="query" type="search" aria-label="粤语猫全站搜索" placeholder="搜索普通话或粤语（全站）" maxlength="80"><button class="btn small primary" type="submit">搜索</button><button class="btn small" type="button" data-catalog-reset>返回栏目</button></form>
      <div class="catalog-player"><label>录音速度 <select data-catalog-rate aria-label="录音播放速度"><option value="1">原速</option><option value="0.8">0.8 倍</option><option value="0.6">0.6 倍</option></select></label><button class="btn small" data-catalog-stop title="停止播放" aria-label="停止播放">&#9632;</button><span data-now-playing role="status"></span><div data-catalog-player></div></div>
      <div data-catalog-body></div><p class="catalog-source">内容与录音来源：<a href="${origin}/category-${type === 'daily' ? 2 : 3}.html" target="_blank" rel="noopener noreferrer">粤语猫</a></p>`;
    root.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.target;
      if (form.matches('.catalog-search')) { view.query = form.elements.query.value.trim(); load(view, 1); }
      else if (form.matches('.catalog-pagination') && form.reportValidity()) load(view, Number(form.elements.page.value));
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-catalog-play')) {
        const item = button.dataset.catalogPlay === 'detail' ? view.detail : view.entries[Number(button.dataset.catalogPlay)];
        if (item?.audio) play(view, item, button);
      } else if (button.hasAttribute('data-catalog-stop')) stop();
      else if (button.hasAttribute('data-catalog-detail')) load(view, view.page, view.entries[Number(button.dataset.catalogDetail)].id);
      else if (button.hasAttribute('data-catalog-page')) load(view, Number(button.dataset.catalogPage));
      else if (button.hasAttribute('data-catalog-retry')) view.retry();
      else if (button.hasAttribute('data-catalog-back')) { stop(); view.detail = null; render(view); }
      else if (button.hasAttribute('data-catalog-reset')) { view.query = ''; root.querySelector('input[name="query"]').value = ''; load(view, 1); }
    });
    root.querySelector('[data-catalog-rate]').onchange = event => { if (owner === view) audio.playbackRate = Number(event.target.value); };
  }

  // Native audio controls also stop competing sources when playback is resumed.
  audio.addEventListener('play', () => dependencies?.stopOthers());
  function activate(type) {
    const view = views.get(type);
    if (view && !view.loaded && !view.controller) load(view);
  }
  return { mount, activate, stop, parseList, parseDetail, safeURL };
})();
