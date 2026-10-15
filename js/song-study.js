/* Local files remain on this device. Only timing and reading choices are persisted. */
const SONG_STUDY = (() => {
  let host, deps, items = [], selected = null, audio = null, rows = [], source = '', token = 0;
  let frame = null, timer = null, segment = null, urls = [], loading = 0;
  const $ = s => host.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const read = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { return {}; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { deps.toast('浏览器无法保存学习进度'); } };
  const key = () => 'ygt_song_' + (selected?.id || 'text') + '_' + source;
  const time = n => Number.isFinite(n) ? Math.floor(n / 60) + ':' + (n % 60).toFixed(2).padStart(5, '0') : '未标记';
  function stop() {
    token++;
    cancelAnimationFrame(frame); clearTimeout(timer); frame = timer = null; segment = null;
    if (audio) audio.pause();
  }
  function silence() { deps.stop(); }
  function readings(ch, li, ci) {
    const saved = read(key()).readings?.[li + ':' + ci];
    return saved || deps.lookup(ch) || '';
  }
  function renderRows() {
    const saved = read(key());
    $('#songRows').innerHTML = rows.map((r, li) => `<div class="study-line${saved.done?.[li] ? ' learned' : ''}" data-line="${li}">
      <div class="study-chars">${[...r.text].map((ch, ci) => /\p{Script=Han}/u.test(ch)
        ? `<button class="pchar" data-character="${li}:${ci}" aria-label="学习 ${esc(ch)}">${esc(ch)}<rt>${esc(readings(ch, li, ci) || '?')}</rt></button>` : `<span>${esc(ch)}</span>`).join('')}</div>
      <div class="study-actions"><span>${li + 1}. ${time(r.start)} — ${time(r.end)}</span>
        <button class="btn small" data-line-action="read:${li}">朗读</button>
        <button class="btn small" data-line-action="clip:${li}" ${!audio || !LYRICS.range(r, audio.duration) ? 'disabled' : ''}>原唱单句</button>
        <label><input type="checkbox" data-done="${li}" ${saved.done?.[li] ? 'checked' : ''}>已学会</label>
        ${audio ? `<button class="btn small" data-line-action="start:${li}">设起点</button><button class="btn small" data-line-action="end:${li}">设终点</button>` : ''}
      </div></div>`).join('');
  }
  function analyze(stopPlayback = true) {
    if (stopPlayback) silence(); source = $('#songText').value;
    rows = LYRICS.parse(source);
    const saved = read(key());
    rows.forEach((r, i) => { if (saved.timing?.[i]) Object.assign(r, saved.timing[i]); });
    $('#songDetail').innerHTML = '';
    renderRows();
    $('#songStatus').textContent = rows.length ? `${rows.length} 句 · 多音字注音待按语境核对` : '暂无歌词';
  }
  function renderLibrary() {
    $('#songLibrary').innerHTML = items.length ? items.map((s, i) => `<button class="btn${s.id === selected?.id ? ' primary' : ''}" data-song-index="${i}" aria-pressed="${s.id === selected?.id}">${esc(s.name)}${s.lyrics || s.text ? ' · 歌词' : ''}</button>`).join('') : '<span>media/songs 暂无歌曲</span>';
  }
  async function choose(index) {
    silence(); const version = ++loading;
    selected = items[index];
    write('ygt_song_selected', selected.id); renderLibrary();
    if (audio) audio.remove();
    audio = new Audio(selected.url); audio.controls = true; audio.preload = 'metadata';
    audio.playbackRate = +$('#songRate').value;
    audio.addEventListener('play', () => deps.stopOthers());
    audio.addEventListener('loadedmetadata', renderRows);
    audio.addEventListener('error', () => deps.toast('音频格式不支持或文件加载失败'));
    audio.addEventListener('timeupdate', () => {
      if (segment !== null && audio.currentTime >= (LYRICS.range(rows[segment], audio.duration)?.end ?? Infinity)) audio.pause();
    });
    audio.addEventListener('pause', () => {
      const end = segment !== null ? LYRICS.range(rows[segment], audio.duration)?.end : null;
      if (end != null && audio.currentTime < end && !audio.ended) stop();
    });
    $('#songAudio').replaceChildren(audio);
    $('#songTitle').textContent = selected.name;
    $('#songText').value = ''; source = ''; rows = []; renderRows();
    $('#songDetail').innerHTML = '';
    try {
      let text = selected.text;
      if (text == null && selected.lyrics) {
        const r = await fetch(selected.lyrics); if (!r.ok) throw Error('歌词读取失败');
        text = LYRICS.decode(await r.arrayBuffer());
      }
      if (version !== loading) return;
      if (text == null) {
        const ly = await deps.embedded(selected.file || selected.url);
        if (version !== loading) return;
        text = ly || '';
      }
      $('#songText').value = text; analyze(false);
    } catch (_) { if (version === loading) deps.toast('未能读取歌词，可以另选 TXT / LRC 文件'); }
  }
  async function importFiles(files) {
    const list = [...files];
    const lyricFiles = list.filter(f => /\.(lrc|txt)$/i.test(f.name));
    const sounds = list.filter(f => /\.(mp3|m4a|wav|ogg)$/i.test(f.name));
    const base = f => (f.webkitRelativePath || f.name).replace(/\.[^.]+$/, '');
    for (const f of sounds) {
      const match = lyricFiles.filter(l => base(l) === base(f)).sort((a, b) => Number(/\.lrc$/i.test(b.name)) - Number(/\.lrc$/i.test(a.name)))[0];
      const url = URL.createObjectURL(f); urls.push(url);
      items.push({ name: f.name.replace(/\.[^.]+$/, ''), id: base(f) + ':' + f.size, url, file:f, text: match ? LYRICS.decode(await match.arrayBuffer()) : null });
    }
    renderLibrary();
    if (sounds.length) await choose(items.length - sounds.length);
    else if (lyricFiles.length) { loading++; $('#songText').value = LYRICS.decode(await lyricFiles[0].arrayBuffer()); analyze(); }
  }
  function playLine(index) {
    const bounds = audio && LYRICS.range(rows[index], audio.duration);
    if (!bounds) { deps.toast('这一句还没有有效的起止时间'); return; }
    silence(); const run = token;
    segment = index; audio.currentTime = bounds.start;
    const tick = () => {
      if (token !== run) return;
      if (audio.currentTime >= bounds.end || audio.ended) {
        audio.pause();
        if ($('#songRepeat').checked) {
          timer = setTimeout(() => { if (token === run) playLine(index); }, 1800);
        } else segment = null;
        return;
      }
      timer = setTimeout(tick, Math.max(10, Math.min(40, (bounds.end - audio.currentTime) * 1000 / audio.playbackRate)));
    };
    audio.play().then(() => { if (token === run) tick(); }).catch(() => deps.toast('单句播放失败'));
  }
  function character(li, ci) {
    silence(); const ch = [...rows[li].text][ci], j = readings(ch, li, ci);
    const m = j.match(/^(gw|kw|ng|[bpmfdtnlgkhzcsjw])?([a-z]+)([1-6])$/);
    $('#songDetail').innerHTML = `<strong>${esc(ch)} · ${esc(j || '未收录')}</strong>
      <span>${m ? `声母 ${m[1] || '零声母'} / 韵母 ${m[2]} / 第 ${m[3]} 声` : ''}</span>
      <label>本句读音 <input id="songReading" value="${esc(j)}" maxlength="10" aria-label="本句粤拼"></label>
      <button class="btn small" id="songSaveReading">保存并试听</button>`;
    const speak = syllable => {
      silence();
      if (PRONUNCIATION.has(syllable)) PRONUNCIATION.play([syllable], { rate:+$('#songRate').value, onError:deps.toast });
      else deps.toast('这个粤拼暂无当前音色录音；可改选原录音，或使用整句朗读');
    };
    $('#songSaveReading').onclick = () => {
      const value = $('#songReading').value.trim().toLowerCase();
      if (!/^[a-z]+[1-6]$/.test(value)) { deps.toast('请输入完整粤拼，例如 nei5'); return; }
      const saved = read(key()); (saved.readings ||= {})[li + ':' + ci] = value;
      write(key(), saved); renderRows(); speak(value);
    };
    speak(j);
  }
  function mount(container, hooks) {
    host = container; deps = hooks;
    host.innerHTML = `<div class="page-head"><h1>歌曲跟读</h1></div>
      <div class="study-import"><label class="btn">加载歌曲与歌词<input id="songFiles" type="file" multiple accept=".mp3,.m4a,.wav,.ogg,.txt,.lrc" hidden></label>
      <label class="btn">加载文件夹<input id="songFolder" type="file" webkitdirectory multiple hidden></label>
      <button class="btn" id="songRefresh">刷新本地曲库</button></div>
      <div id="songLibrary" class="study-library"></div>
      <h2 id="songTitle">歌词学习</h2><div id="songAudio"></div>
      <div class="study-import"><label>速度 <select id="songRate"><option value="0.6">0.6</option><option value="0.75">0.75</option><option value="0.85">0.85</option><option value="1" selected>1</option></select></label>
      <label><input type="checkbox" id="songRepeat">单句循环</label><button class="btn" id="songStop">停止</button></div>
      <textarea id="songText" rows="5" aria-label="歌词" placeholder="歌词（TXT / LRC）"></textarea>
      <button class="btn primary" id="songAnalyze">解析歌词</button><span id="songStatus" role="status"></span>
      <div id="songDetail" class="study-detail" aria-live="polite"></div><div id="songRows"></div>`;
    $('#songFiles').onchange = e => importFiles(e.target.files).catch(() => deps.toast('文件读取失败'));
    $('#songFolder').onchange = e => importFiles(e.target.files).catch(() => deps.toast('文件夹读取失败'));
    $('#songAnalyze').onclick = analyze;
    $('#songStop').onclick = silence;
    $('#songRate').onchange = e => { if (audio) audio.playbackRate = +e.target.value; };
    host.addEventListener('click', e => {
      const song = e.target.closest('[data-song-index]');
      if (song) { choose(+song.dataset.songIndex); return; }
      const ch = e.target.closest('[data-character]');
      if (ch) { character(...ch.dataset.character.split(':').map(Number)); return; }
      const b = e.target.closest('[data-line-action]'); if (!b) return;
      const [act, idx] = b.dataset.lineAction.split(':'), i = +idx;
      if (act === 'clip') playLine(i);
      else if (act === 'read') { silence(); if (!TTS.speak(rows[i].text, { rate:+$('#songRate').value })) deps.toast('系统未安装粤语朗读语音'); }
      else if (audio) {
        rows[i][act] = audio.currentTime;
        const saved = read(key()); (saved.timing ||= {})[i] = { start:rows[i].start, end:rows[i].end };
        write(key(), saved); renderRows();
      }
    });
    host.addEventListener('change', e => {
      if (e.target.matches('[data-done]')) {
        const saved = read(key()); (saved.done ||= {})[e.target.dataset.done] = e.target.checked;
        write(key(), saved); renderRows();
      }
    });
    async function scan() {
      let discovered;
      try {
        const r = await fetch('/api/songs'); if (!r.ok) throw Error();
        const data = await r.json();
        discovered = data.songs;
      } catch (_) {
        discovered = typeof LOCAL_SONGS === 'undefined' ? [] : LOCAL_SONGS;
      }
      items = [...items.filter(s => s.file), ...discovered]; renderLibrary();
      if (!selected && items.length) {
        const remembered = read('ygt_song_selected');
        const index = items.findIndex(s => s.id === remembered);
        await choose(index < 0 ? 0 : index);
      } else if (!items.length) $('#songStatus').textContent = 'media/songs 暂无音频，可加载本地文件';
    }
    $('#songRefresh').onclick = scan; scan(); renderLibrary();
    window.addEventListener('beforeunload', () => urls.forEach(u => URL.revokeObjectURL(u)), { once:true });
  }
  return { mount, stop };
})();
