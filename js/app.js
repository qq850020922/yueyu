/* ============================================================
   粤讲粤掂 · 主程序（路由 + 渲染 + 打卡 + 测验）
   对应需求分析.md §4 各模块 F1–F11
   ============================================================ */
(() => {
'use strict';

/* ---------- 小工具 ---------- */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 状态 ---------- */
const NAV = [
  { id: 'home',     icon: '🏠', label: '首页' },
  { id: 'initials', icon: '🔤', label: '声母' },
  { id: 'finals',   icon: '🅰️', label: '韵母' },
  { id: 'blend',    icon: '🔗', label: '拼读教练' },
  { id: 'tones',    icon: '🎵', label: '九声六调' },
  { id: 'poems',    icon: '📖', label: '诗歌跟读' },
  { id: 'songs',    icon: '🎤', label: '歌曲跟唱' },
  { id: 'phrases',  icon: '💬', label: '日常用语' },
  { id: 'plan',     icon: '🗓️', label: '90天计划' },
  { id: 'quiz',     icon: '🎮', label: '闯关测验' },
  { id: 'guide',    icon: '🧭', label: '学习指南' },
];

let checkedDays = new Set();
let stats = { tone: 0, pinyin: 0, law: 0 };
let settings = LS.get('ygt_settings', { rate: 0.8, voice: '' });
let currentMonth = 'm1';

const allDays = PLAN.flatMap(m => m.weeks.flatMap(w => w.days));
const totalDays = allDays.length;
function completedCount() { return checkedDays.size; }
function currentDayObj() { return allDays.find(d => !checkedDays.has(d.d)) || allDays[allDays.length - 1]; }
function streak() {
  let max = 0; for (const d of checkedDays) if (d > max) max = d;
  let s = 0, d = max;
  while (d >= 1 && checkedDays.has(d)) { s++; d--; }
  return s;
}
function gotBadges() { return BADGES.filter(b => completedCount() >= b.days); }
function saveProgress() { if (!requireLogin()) return; saveAccountCache(); renderSideProgress(); buildHome(); buildPlan(); scheduleSync(); }

/* ---------- 发音引擎接线 ---------- */
function refreshVoiceChip(state, name) {
  const chip = $('#voiceChip');
  if (state === 'ok') {
    chip.className = 'voice-chip ok';
    chip.title = '粤语语音已就绪' + (name ? '：' + name : '');
    chip.innerHTML = `<span class="dot"></span>粤语语音 ✓`;
  } else {
    chip.className = 'voice-chip bad';
    chip.title = '未检测到粤语语音——建议用 Edge / Chrome 打开本站（详见学习指南）';
    chip.innerHTML = `<span class="dot"></span>未检测到粤语语音`;
  }
}
function refreshVoiceOptions() {
  const sel = $('#voiceSelect');
  const vs = TTS.cantoVoices;
  sel.innerHTML = '';
  if (!vs.length) { sel.innerHTML = '<option>无粤语语音</option>'; sel.disabled = true; return; }
  sel.disabled = false;
  vs.forEach(v => {
    const o = document.createElement('option');
    let label = v.name.length > 22 ? v.name.slice(0, 22) + '…' : v.name;
    if (/hiumaan|tracy|google 粤|google 粤語/i.test(v.name)) label += '（女声）';
    else if (/wanlung|danny/i.test(v.name)) label += '（男声）';
    o.value = v.voiceURI; o.textContent = label;
    sel.appendChild(o);
  });
  const cur = TTS.voice;
  if (cur) sel.value = cur.voiceURI;
}

/* ---------- 导航 ---------- */
function switchPage(id) {
  if (id === 'plan' && !requireLogin()) return;
  TTS.stopLoop(); pauseAllMedia();
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  const nav = NAV.find(n => n.id === id);
  $('#topbarTitle').textContent = nav ? nav.label : '';
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0 });
}
function goto(id, anchor) {
  switchPage(id);
  if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
}

/* ============================================================
   F1 首页
   ============================================================ */
function buildHome() {
  const done = completedCount(), cur = currentDayObj(), pct = Math.round(done / totalDays * 100);
  const badges = gotBadges();
  const html = `
  <div class="hero">
    <h1>粤讲粤掂</h1>
    <div class="hero-sub">专为普通话母语者打造的粤语自学舱：粤拼 → 九声六调 → 诗歌跟读 → 歌曲跟唱 → 90 天成军。掂（dim6）= 搞定——越讲，越掂！</div>
    <div class="hero-cta">
      <button class="btn primary" data-goto-plan="${cur.d}">${AUTH.ready ? `▶️ 开始今天的学习（第 ${cur.d} 天）` : '登录后开始计划学习'}</button>
      <button class="btn" data-say="三碗半牛腩面" data-rate="0.7">🔊 听口诀：三碗半牛腩面</button>
      <button class="btn" data-goto="guide">🧭 先看学习方法</button>
    </div>
  </div>

  <div class="stat-row">
    <div class="stat"><span class="big">${done}<small style="font-size:13px;color:var(--muted)">/${totalDays}</small></span><div class="lbl">已完成天数<br>学习进度 ${pct}%</div></div>
    <div class="stat"><span class="big">${streak()}</span><div class="lbl">连续打卡（天）<br>别断火哟 🔥</div></div>
    <div class="stat"><span class="big">${badges.length}<small style="font-size:13px;color:var(--muted)">/${BADGES.length}</small></span><div class="lbl">已获徽章<br>${badges.length ? esc(badges.map(b => b.icon + b.name).join(' ')) : '打卡第 1 天领 🐣'}</div></div>
    <div class="stat"><span class="big">${stats.tone}</span><div class="lbl">听音辨调最佳<br>/10 分</div></div>
  </div>

  ${AUTH.ready ? `<div class="card today-card" id="homeToday">
    <div class="day-no">今日任务 · DAY ${cur.d} / ${totalDays}</div>
    <h3>${esc(cur.t)}</h3>
    <ul class="day-list">${cur.learn.map(x => `<li><span class="ic">学</span>${esc(x)}</li>`).join('')}</ul>
    <ul class="day-list practice">${cur.practice.map(x => `<li><span class="ic">练</span>${esc(x)}</li>`).join('')}</ul>
    <div class="day-test">✅ 过关标准：${esc(cur.test)}</div>
    <div class="day-actions">
      <button class="btn primary small" data-goto-page="${cur.page}">去「${esc((NAV.find(n => n.id === cur.page) || {}).label || cur.page)}」学习</button>
      <button class="btn small" data-check-day="${cur.d}">打卡完成第 ${cur.d} 天</button>
    </div>
  </div>` : '<div class="note-box" id="homeToday">登录后查看今日任务、打卡与个人学习进度。<button class="btn small" data-login>登录 / 注册</button></div>'}

  <div class="section-title">🗺️ 三个月路线图 <small>难度逐步上升 · 每天只需 15–30 分钟</small></div>
  <div class="roadmap">
    ${ROADMAP.map(r => `<div class="card"><div class="no">${esc(r.no)}</div><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p></div>`).join('')}
  </div>

  <div class="section-title">⚡ 快速入口</div>
  <div class="quick-links">
    <button class="qlink" data-goto="initials"><span class="ico">🔤</span>声母×19<small>呼读音+例字点读</small></button>
    <button class="qlink" data-goto="finals"><span class="ico">🅰️</span>韵母×55<small>示范字+对立对比</small></button>
    <button class="qlink" data-goto="blend"><span class="ico">🔗</span>拼读教练<small>声母韵母拼成字</small></button>
    <button class="qlink" data-goto="tones"><span class="ico">🎵</span>九声六调<small>三碗半牛腩面</small></button>
    <button class="qlink" data-goto="poems"><span class="ico">📖</span>诗歌跟读<small>唐诗×10 逐字注音</small></button>
    <button class="qlink" data-goto="songs"><span class="ico">🎤</span>歌曲跟唱<small>经典×12 逐句跟唱</small></button>
    <button class="qlink" data-goto="phrases"><span class="ico">💬</span>日常用语<small>8 场景生存粤语</small></button>
    <button class="qlink" data-goto="plan"><span class="ico">🗓️</span>90天计划<small>打卡+徽章</small></button>
    <button class="qlink" data-goto="quiz"><span class="ico">🎮</span>闯关测验<small>三种玩法</small></button>
  </div>

  <div class="note-box" style="margin-top:22px">💡 <b>新手三步走：</b>① 先去「学习指南」花 5 分钟掌握方法论 → ② 跟着「90 天计划」每天打卡 → ③ 卡住就回到「声母/韵母/声调」页点读强化。顶部可调语速（建议 0.7–0.8 慢速起步）。</div>`;
  $('#page-home').innerHTML = html;
}

/* ============================================================
   F3 声母页
   ============================================================ */
function exChips(exs) {
  return `<div class="exs">${exs.map(e =>
    `<button class="ex-chip" data-say="${esc(e.c)}" data-jyutping="${esc(e.j)}"><b>${esc(e.c)}</b><ruby><rt>${esc(e.j)}</rt></ruby></button>`).join('')}</div>`;
}
function huduBtn(v) {
  const syllable = PHONETIC_LESSONS.initials[v.id];
  return `<div class="hudu-line">
    <button class="say phonetic" data-phonetic-initial="${esc(v.id)}" title="声母呼读音 ${esc(syllable)}">呼读 ${esc(syllable)}</button>
  </div>`;
}
function buildInitials() {
  const html = `
  <div class="page-head">
    <h1>🔤 声母 19 个 <span class="tag">口形 · 舌位 · 送气</span> ${vidBtn('粤语 粤拼 声母 发音教学', '看视频学')}</h1>
    <div class="sub">声母是音节开头的辅音。先练声母本身的口形和气流，再连接韵母。重点区分 b/p、d/t、g/k、z/c 的送气，以及 n/l、g/gw、k/kw。</div>
  </div>
  <div class="note-box"><b>声母呼读：</b>用完整音节帮助练习声母，例如 b → baa1。重点听开头的声母，结合口形、舌位和送气说明练习。</div>
  <div class="phonetic-toolbar"><button class="btn small" data-stop-pronunciation title="停止播放" aria-label="停止播放">⏹</button><span id="initialPlaybackStatus" role="status" aria-live="polite"></span></div>
  <div class="grid cols-4" style="margin-top:14px">
    ${INITIALS.map((v, i) => `
    <div class="phon-card" data-initial="${i}" role="button" tabindex="0">
      <div class="sym">${esc(v.id)} <small>${esc(v.ipa)}</small></div>
      ${huduBtn(v)}
      <div class="phonetic-how">${esc(v.how)}</div>
      <div class="cmp">${esc(v.mandarin)}</div>
      ${exChips(v.examples)}
    </div>`).join('')}
  </div>`;
  $('#page-initials').innerHTML = html;
}
function initialModal(v) {
  const h = HUDU[v.id];
  openModal(`
    <div class="modal-head">
      <div class="sym">${esc(v.id)}</div>
      <div><div style="font-weight:700;font-size:16px">粤拼声母 ${esc(v.id)}　<span class="tag">${esc(v.tag)}</span></div>
      <div class="meta">${esc(v.ipa)} · ${esc(v.mandarin)}</div></div>
      <button class="close" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="kv">
        <div class="k">声母发音</div><div class="v">
          <button class="ex-tile phonetic-tile" data-phonetic-initial="${esc(v.id)}"><b>${esc(v.id)}</b><div class="j">${esc(PHONETIC_LESSONS.initials[v.id])}</div><div class="m">声母呼读音</div></button></div>
        <div class="k">发音要领</div><div class="v">${esc(v.how)}</div>
        <div class="k">易错点</div><div class="v">${v.pitfall.startsWith('⚠️') ? `<div class="warn-box" style="margin:0">${esc(v.pitfall)}</div>` : esc(v.pitfall)}</div>
        <div class="k">例字跟读</div><div class="v">
          <div class="ex-row">${v.examples.map(e =>
            `<button class="ex-tile" data-say="${esc(e.c)}" data-jyutping="${esc(e.j)}"><b>${esc(e.c)}</b><div class="j">${esc(e.j)}</div><div class="m">${esc(e.m)}</div></button>`).join('')}</div>
        </div>
      </div>
      <div class="ok-box">🗣️ <b>跟读三遍法：</b>听一遍 → 慢速跟一遍（语速条拉到 0.6）→ 原速跟一遍。</div>
    </div>`);
}

/* ============================================================
   F4 韵母页
   ============================================================ */
function finalSampleNote(f) {
  if (f.onlyCompound) return `短元音 ${f.id}：在示范音节 ${PHONETIC_LESSONS.finals[f.id]} 中体会，留意口形与韵尾。`;
  if (['m','ng'].includes(f.id)) return '鼻音独立成韵；闭合发音部位，让声音从鼻腔出来。';
  const stop = /([ptk])$/.exec(f.id);
  if (stop) return `元音连到 -${stop[1]} 收住；收口后不再释放一个额外音节。`;
  if (/(m|n|ng)$/.test(f.id)) return '元音连到鼻音韵尾，一口气收尾，不拆成两个音。';
  return '留意示范音节中的韵母部分，保持连贯口形。';
}
function finalExample(f) {
  const j = PHONETIC_LESSONS.finals[f.id];
  return f.examples.find(e => e.j === j) || { c: '', j };
}
function finalBreakdown(f) {
  const sample = finalExample(f), d = decompose(sample.j);
  if (f.onlyCompound) return `${sample.c} ${sample.j}：短元音 ${f.id} 包含在 ${d.fin} 中，不能把整个 ${d.fin} 当作 ${f.id}。`;
  return `${sample.c} ${sample.j} = ${d.ini || '零声母'} + ${d.fin} + 第 ${d.tone} 调；重点听 ${f.id}。`;
}
function aloneBtn(f) {
  const sample = finalExample(f);
  return `<div class="hudu-line">
    <button class="say phonetic" data-phonetic-final="${esc(f.id)}" title="${esc(finalBreakdown(f))}">示范字 ${esc(sample.c)} ${esc(sample.j)}</button>
  </div>`;
}
function buildFinals() {
  const html = `
  <div class="page-head">
    <h1>🅰️ 韵母 55 个 <span class="tag">五组分区 · 全部可点读</span> ${vidBtn('粤语 粤拼 韵母 发音教学', '看视频学')}</h1>
    <div class="sub">通过示范字学习韵母，结合口形说明练习元音、复元音、鼻音尾和入声尾。</div>
  </div>
  <div class="note-box"><b>韵母示范：</b>飞 fei1 中的 ei、剑 gim3 中的 im。先听完整字音，再按口形说明练习韵母。a、eo 等短元音在完整韵母中体会。录音来自 <a href="https://jyutping.org/jyutping/" target="_blank" rel="noopener">粤拼方案</a> 的完整音节，保留原声，不截取、不拼接。</div>
  <div class="phonetic-toolbar"><button class="btn small" data-stop-pronunciation title="停止播放" aria-label="停止播放">⏹</button><span id="finalPlaybackStatus" role="status" aria-live="polite"></span></div>
  ${FINAL_GROUPS.map(g => `
    <div class="group-head"><h3>${esc(g.name)}</h3><span class="desc">${esc(g.desc)}</span></div>
    <div class="grid cols-4">
      ${g.finals.map((f, i) => `
      <div class="phon-card" data-final="${g.id}:${i}" role="button" tabindex="0">
        <div class="sym">${esc(f.id)} <small>${esc(f.ipa)}</small></div>
        ${aloneBtn(f)}
        <div class="phonetic-hint">${esc(finalBreakdown(f))}</div>
        <div class="phonetic-how">${esc(f.how)}</div>
        <div class="phonetic-hint">${esc(finalSampleNote(f))}</div>
        <div class="cmp">${esc(f.mandarin)}${f.onlyCompound ? ' <span class="tag">只出现在复合韵母</span>' : ''}</div>
        ${exChips(f.examples)}
      </div>`).join('')}
    </div>`).join('')}

  <div class="group-head"><h3>⚔️ 最小对立对 · 对比听特训</h3><span class="desc">每对只差一点点——粤语听力的生死线。点「对比连播」反复磨耳朵。</span></div>
  <div class="grid cols-3">
    ${CONTRAST_PAIRS.map(p => `
    <div class="card" style="padding:14px 16px">
      <div style="display:flex;gap:10px;align-items:center">
        <button class="ex-tile" data-say="${esc(p.a.c)}"><b>${esc(p.a.c)}</b><div class="j">${esc(p.a.j)}</div></button>
        <span style="color:var(--muted)">vs</span>
        <button class="ex-tile" data-say="${esc(p.b.c)}"><b>${esc(p.b.c)}</b><div class="j">${esc(p.b.j)}</div></button>
      </div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:8px">${esc(p.note)}</div>
      <button class="btn small" style="margin-top:8px" data-seq="${esc(p.a.c)},${esc(p.b.c)},${esc(p.a.c)},${esc(p.b.c)}" data-jyutping-seq="${esc([p.a.j, p.b.j, p.a.j, p.b.j].join(','))}">对比两轮</button>
    </div>`).join('')}
  </div>`;
  $('#page-finals').innerHTML = html;
}
function finalModal(f) {
  openModal(`
    <div class="modal-head">
      <div class="sym">${esc(f.id)}</div>
      <div><div style="font-weight:700;font-size:16px">粤拼韵母 ${esc(f.id)}　<span class="tag">${esc(f.ipa)}</span></div>
      <div class="meta">${esc(f.mandarin)}</div></div>
      <button class="close" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="kv">
        <div class="k">韵母发音</div><div class="v">
          <button class="ex-tile phonetic-tile" data-phonetic-final="${esc(f.id)}"><b>${esc(finalExample(f).c)}</b><div class="j">${esc(finalExample(f).j)}</div><div class="m">示范字录音</div></button>
          <div class="phonetic-hint">${esc(finalBreakdown(f))}</div>
          <span class="phonetic-hint">${esc(finalSampleNote(f))}</span></div>
        <div class="k">发音要领</div><div class="v">${esc(f.how)}</div>
        <div class="k">易错点</div><div class="v">${f.pitfall.startsWith('⚠️') ? `<div class="warn-box" style="margin:0">${esc(f.pitfall)}</div>` : esc(f.pitfall)}</div>
        <div class="k">例字跟读</div><div class="v">
          <div class="ex-row">${f.examples.map(e =>
            `<button class="ex-tile" data-say="${esc(e.c)}" data-jyutping="${esc(e.j)}"><b>${esc(e.c)}</b><div class="j">${esc(e.j)}</div><div class="m">${esc(e.m)}</div></button>`).join('')}</div>
        </div>
      </div>
      <div class="ok-box">🎧 建议把顶部语速拉到 <b>0.6</b> 慢速跟读，找准嘴形后再提速。</div>
    </div>`);
}

/* ============================================================
   F12 拼读教练（v1.1）
   ============================================================ */
const FIN_SET = new Set(FINAL_GROUPS.flatMap(g => g.finals.map(f => f.id)));
const INI_ORDER = ['gw', 'kw', 'ng', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'j', 'w'];
function decompose(j) {
  const m = j.match(/^([a-z]+?)([1-6])$/);
  if (!m) return null;
  const syl = m[1], tone = +m[2];
  if (FIN_SET.has(syl) && (syl === 'm' || syl === 'ng')) return { ini: '', fin: syl, tone };
  for (const i of INI_ORDER) {
    if (syl.startsWith(i)) {
      const fin = syl.slice(i.length);
      if (FIN_SET.has(fin)) return { ini: i, fin, tone };
    }
  }
  if (FIN_SET.has(syl)) return { ini: '', fin: syl, tone };
  return null;
}
function toneMark(t) { return '①②③④⑤⑥'[t - 1] || t; }
function decBadge(d) {
  return `<span class="dec">${d.ini ? esc(d.ini) : 'Ø'} + ${esc(d.fin)} ${toneMark(d.tone)}</span>`;
}
function buildBlend() {
  const inis = [{ id: '', label: 'Ø 零声母' }].concat(INITIALS.map(v => ({ id: v.id, label: v.id })));
  const fins = FINAL_GROUPS.flatMap(g => g.finals.filter(f => !f.onlyCompound).map(f => ({ id: f.id, g: g.id })));
  const wordGroups = [
    { name: '两字词 · 热身', list: BLEND_WORDS.filter(w => w.j.length === 2) },
    { name: '三字词 · 上量', list: BLEND_WORDS.filter(w => w.j.length === 3) },
    { name: '四字以上 · 语句感', list: BLEND_WORDS.filter(w => w.j.length >= 4) },
  ];
  $('#page-blend').innerHTML = `
  <div class="page-head">
    <h1>🔗 拼读教练 <span class="tag">声母+韵母 → 字 → 词</span> ${vidBtn('粤拼 拼读教学 零基础', '看视频学')}</h1>
    <div class="sub">声母、韵母都认识了，再练声母接韵母，最后带上声调读成一个字。</div>
  </div>

  <div class="card">
    <div class="section-title" style="margin-top:0">🪜 拼读三步法 <small>以「你 nei5」为例</small></div>
    <div class="step-tiles">
      <div class="step-tile"><b class="no">① 声母呼读</b>n，舌尖抵住上齿龈，鼻腔出声<br><button class="btn small" data-phonetic-initial="n">🔊 naa4</button></div>
      <div class="step-tile"><b class="no">② 韵母示范</b>ei，听 fei1 中的韵母<br><button class="btn small" data-phonetic-final="ei">🔊 fei1</button></div>
      <div class="step-tile"><b class="no">③ 合口成字</b>n + ei + 第 5 调 → 你 nei5<br><button class="btn small" data-say="你" data-jyutping="nei5">🔊 你 nei5</button></div>
    </div>
    <div style="text-align:center"><button class="btn primary" data-spell-syllable="nei5">▶ 拼读：n → ei → nei5</button> <button class="btn small" data-stop-pronunciation title="停止播放" aria-label="停止播放">⏹</button></div>
    <div id="spellingStatus" class="phonetic-toolbar" role="status" aria-live="polite"></div>
    <div class="note-box">n 发音后，舌尖松开，直接接 ei，按第 5 调读成 nei5。分步练习有停顿，真正拼读时连成一个音节，不夹入额外的 aa。</div>
  </div>

  <div class="card" style="margin-top:14px">
    <div class="section-title" style="margin-top:0">🎛️ 拼读机 <small>声母 × 韵母 × 声调 → 字</small></div>
    <div class="blend-controls">
      <label>声母<select id="blendIni">${inis.map(i => `<option value="${esc(i.id)}">${esc(i.label)}</option>`).join('')}</select></label>
      <label>韵母<select id="blendFin">${fins.map(f => `<option value="${esc(f.id)}">${esc(f.id)}</option>`).join('')}</select></label>
      <label>声调<select id="blendTone">${TONES.map(t => `<option value="${t.n}">${t.n}｜${esc(t.name)}</option>`).join('')}</select></label>
      <button class="btn primary" id="blendGo">拼！</button>
      <button class="btn" id="blendRandom">🎲 随机来一个</button>
    </div>
    <div class="blend-result" id="blendResult"></div>
    <div class="note-box">字库收录 ${CHAR_BANK.length} 个高频字；提示"不常见"只是没收录，不代表这个音节不存在。</div>
  </div>

  ${wordGroups.map(g => `
  <div class="group-head"><h3>🧩 ${esc(g.name)}</h3></div>
  ${g.list.map(w => {
    const idx = BLEND_WORDS.indexOf(w);
    return `
    <div class="bd-row">
      <div class="bd-chars">
        ${[...w.w].map((ch, i) => {
          const d = decompose(w.j[i]);
          return `<button class="bd-char" data-say="${esc(ch)}" data-jyutping="${esc(w.j[i])}"><b>${esc(ch)}</b>${d ? decBadge(d) : `<span class="dec">${esc(w.j[i])}</span>`}</button>`;
        }).join('')}
      </div>
      <div style="flex:1;min-width:130px"><div style="font-size:13px;color:var(--muted)">${esc(w.tip || '')}</div></div>
      <div style="display:flex;gap:8px;flex:0 0 auto">
        <button class="btn small" data-say="${esc(w.w)}" data-jyutping="${esc(w.j.join(','))}" data-rate="0.75">🔊 按字连读</button>
        <button class="btn small primary" data-bdemo="${idx}">▶ 逐字拼读</button>
      </div>
    </div>`;
  }).join('')}`).join('')}

  <div class="card" style="margin-top:18px">
    <div class="section-title" style="margin-top:0">📏 粤拼拼写规则卡 <small>见拼能读、见字能拼的五条军规</small></div>
    <table class="tbl">
      <tr><th>规则</th><th>例子</th></tr>
      <tr><td>长 a 写两个 a（aa），短 a 只一个</td><td>三 saam1 ≠ 心 sam1；街 gaai1 ≠ 鸡 gai1</td></tr>
      <tr><td>z/c/s 一套通吃普通话 z/j、c/q、s/x 两套</td><td>之 zi1、姐 ze2、挤 zai1 声母相同</td></tr>
      <tr><td>j 和 w 就是普通话的 y 和 w</td><td>一 jat1（yī）、弯 waan1（wān）</td></tr>
      <tr><td>gw/kw = g/k + 圆唇，是独立声母</td><td>瓜 gwaa1 ≠ 家 gaa1；广 gwong2 ≠ 讲 gong2</td></tr>
      <tr><td>-p/-t/-k 只摆姿势不发音（入声）</td><td>十 sap6、一 jat1、六 luk6——急刹车</td></tr>
    </table>
  </div>`;

  renderBlendResult();
  $('#blendGo').onclick = () => renderBlendResult();
  $('#blendRandom').onclick = () => {
    const e = CHAR_BANK[Math.floor(Math.random() * CHAR_BANK.length)];
    const d = decompose(e.j);
    if (d) {
      $('#blendIni').value = d.ini;
      $('#blendFin').value = d.fin;
      $('#blendTone').value = d.tone;
    }
    renderBlendResult(e.c);
  };
  ['blendIni', 'blendFin', 'blendTone'].forEach(id => $('#' + id).addEventListener('change', () => renderBlendResult()));
}
function renderBlendResult(autoSay) {
  const ini = $('#blendIni').value, fin = $('#blendFin').value, tone = $('#blendTone').value;
  const syl = ini + fin + tone;
  const hits = CHAR_BANK.filter(e => { const d = decompose(e.j); return d && d.ini === ini && d.fin === fin && d.tone === +tone; });
  const box = $('#blendResult');
  if (!hits.length) {
    box.innerHTML = `<div class="blend-syl">${esc(syl)}</div>
      <div style="color:var(--muted);font-size:13.5px">字库里没有这个组合的常用字——可能是粤语不常见的音节，也可能只是没收录。<br>💡 试试换一个声调（粤语同声同韵不同调就是不同的字！）</div>`;
    return;
  }
  box.innerHTML = `<div class="blend-syl">${esc(syl)} <small>${esc(ini || 'Ø')} + ${esc(fin)} + ${toneMark(+tone)}</small></div>
    <div class="ex-row">${hits.slice(0, 5).map(e =>
      `<button class="ex-tile" data-say="${esc(e.c)}" data-jyutping="${esc(e.j)}"><b>${esc(e.c)}</b><div class="j">${esc(e.j)}</div><div class="m">${esc(e.m)}</div></button>`).join('')}</div>
    <button class="btn small primary" data-spell-syllable="${esc(syl)}">▶ 声母 → 韵母 → ${esc(syl)}</button>`;
  if (autoSay) { TTS.stopLoop(); pauseAllMedia(); playSyllables([syl]); }
}

/* ============================================================
   F5 九声六调页
   ============================================================ */
function toneSVG(contour, color) {
  const c = contour.split(' ')[0]; // 取 55 / 53 中的首个
  const lv = c.split('').map(Number); // e.g. [5,5]
  const y = l => 10 + (5 - l) * 10;
  const pts = `10,${y(lv[0])} 110,${y(lv[1] || lv[0])}`;
  return `<svg class="tone-svg" viewBox="0 0 120 60" width="120" height="52">
    <line x1="10" y1="10" x2="110" y2="10" stroke="#eee8da" stroke-width="1"/>
    <line x1="10" y1="30" x2="110" y2="30" stroke="#eee8da" stroke-width="1"/>
    <line x1="10" y1="50" x2="110" y2="50" stroke="#eee8da" stroke-width="1"/>
    <polyline points="${pts}" stroke="${color}"/>
  </svg>`;
}
function buildTones() {
  const m = MNEMONIC;
  $('#page-tones').innerHTML = `
  <div class="page-head">
    <h1>🎵 九声六调 <span class="tag">粤语的灵魂</span> ${vidBtn('粤语 九声六调 声调教学', '看视频学')}</h1>
    <div class="sub">"六调"= 六种旋律线（1 高平、2 高升、3 中平、4 低降、5 低升、6 低平）；"九声"= 再加三个带 <b>-p/-t/-k 急停</b>的入声（调值分别同 1、3、6）。普通话只有 4 个调，所以 3 声（中平）和 6 声（低平）是你要新建的两条神经。</div>
  </div>

  <div class="section-title">📊 六调全景图 <small>点击任意一行听真人感朗读 + 看调值走势</small></div>
  ${TONES.map(t => `
  <div class="tone-row">
    <div class="t-no"><span class="tone-no" style="background:${t.color}">${t.n}</span>
      <div class="t-name"><b>第${t.n}声 ${esc(t.name)}</b>${esc(t.contour)} · ${esc(t.trend)}</div></div>
    ${toneSVG(t.contour, t.color)}
    <div class="t-desc"><b>普通话锚点：${esc(t.mandarin)}</b><br>${esc(t.desc)}</div>
    <div class="t-play">
      <button class="btn small" data-say="${esc(t.ex.c)}" data-tone-anim>🔊 ${esc(t.ex.c)} ${esc(t.ex.j)}</button>
      <button class="btn small ghost-blue" data-say="${esc(t.series.c)}">同音字：${esc(t.series.c)} ${esc(t.series.j)}</button>
    </div>
  </div>`).join('')}

  <div class="card" style="margin-top:20px">
    <div class="section-title" style="margin-top:0">🍚 记忆口诀 · 一句话记住六个调</div>
    <div class="mnemo">${m.six.c.split('').map((c, i) =>
      `<button class="mnemo-item" data-say="${c}"><b>${c}</b><span class="j">${esc(m.six.j[i])}</span><span class="t">第${i + 1}声</span></button>`).join('')}
    </div>
    <div class="note-box">${esc(m.six.tip)}</div>
    <div style="text-align:center"><button class="btn primary small" data-seq="${m.six.c.split('').join(',')}">🔊 整句连读</button></div>
  </div>

  <div class="card" style="margin-top:14px">
    <div class="section-title" style="margin-top:0">🧘 九声自测口诀 · 分粉训焚愤份 · 忽发佛</div>
    <div class="mnemo">${m.nine.c.replace(/\s|·/g, '').split('').map((c, i) =>
      `<button class="mnemo-item" data-say="${c}"><b>${c}</b><span class="j">${esc(m.nine.j[i])}</span><span class="t">${i < 6 ? '第' + (i + 1) + '声' : ['高入(7)', '中入(8)', '阳入(9)'][i - 6]}</span></button>`).join('')}
    </div>
    <div class="note-box">${esc(m.nine.tip)}</div>
  </div>

  <div class="card" style="margin-top:14px">
    <div class="section-title" style="margin-top:0">⚡ 入声三兄弟（第 7 / 8 / 9 声）</div>
    <div class="grid cols-3">
      ${TONE_STOPS.map(t => `
      <div class="card" style="box-shadow:none;padding:14px 16px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="tone-no" style="background:${t.color}">${t.n}</span><b>第${t.n}声 ${esc(t.name)}</b></div>
        <div style="font-size:12.5px;color:var(--muted)">${esc(t.base)} · ${esc(t.desc)}</div>
        <div class="exs" style="margin-top:8px">
          <button class="ex-chip" data-say="${esc(t.ex.c)}"><b>${esc(t.ex.c)}</b><rt>${esc(t.ex.j)}</rt></button>
          ${t.more.map(x => `<button class="ex-chip" data-say="${esc(x.c)}"><b>${esc(x.c)}</b><rt>${esc(x.j)}</rt></button>`).join('')}
        </div>
      </div>`).join('')}
    </div>
    <div style="text-align:center;margin-top:10px"><button class="btn primary small" data-seq="一,八,六,一,八,六">🔊 高中低连听：一 · 八 · 六</button></div>
  </div>

  <div class="section-title">🔮 普通话 → 粤语声调推算表 <small>不绝对，但 70% 的字适用——记不住粤语声调时的救命稻草</small></div>
  <table class="tbl">
    <tr><th>普通话</th><th>粤语通常读</th><th>例证（点击可听）</th></tr>
    ${TONE_LAW.map(r => `<tr><td>${esc(r.pt)}</td><td class="can">${esc(r.ct)}</td><td>${esc(r.ex)}</td></tr>`).join('')}
  </table>

  <div class="card" style="margin-top:20px">
    <div class="section-title" style="margin-top:0">🎯 听感特训组</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" data-seq="诗,史,试,时,市,事">🔊 诗史试时市事（六调连读）</button>
      <button class="btn" data-seq="分,粉,训,焚,愤,份">🔊 分粉训焚愤份</button>
      <button class="btn" data-seq="忽,发,佛">🔊 忽发佛（三入声）</button>
      <button class="btn" data-goto="quiz">🎮 去测验实战 →</button>
    </div>
  </div>`;
}

/* ============================================================
   ruby 注音工具（F6/F7 共用；入声由 p/t/k 韵尾自动判定，
   oe/eo/yu 难点韵母自动高亮）
   ============================================================ */
function rubyLine(h, j) {
  const chars = [...h];
  const js = j.trim().split(/\s+/);
  if (chars.length !== js.length) return `<span class="poem-chars">${esc(h)}</span>`;
  return `<span class="poem-chars">${chars.map((c, i) => {
    const isStop = /([ptk])[1-6]?$/.test(js[i]);
    const isHard = /(oe|eo|yu)/.test(js[i]);
    return `<button class="pchar${isStop ? ' stop' : ''}${isHard ? ' hard' : ''}" data-say="${c}" title="${esc(js[i])}">${c}<rt>${esc(js[i])}</rt></button>`;
  }).join('')}</span>`;
}
function vidBtn(kw, label) {
  return `<a class="btn small ghost-blue" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(kw)}">📺 ${label || '视频教程'}</a>`;
}
function lineControls(lineText) {
  return `<span style="display:flex;gap:6px;flex:0 0 auto">
    <button class="btn small" data-say="${esc(lineText)}" data-rate="0.75">🔊 原速</button>
    <button class="btn small" data-say="${esc(lineText)}" data-rate="0.55">🐢 慢速</button>
  </span>`;
}

/* ============================================================
   F6 诗歌跟读页
   ============================================================ */
function buildPoems() { renderPoemList(); }

const POEM_STAGES = ['全部', '入门', '初中', '高中'];
let poemFilter = '全部';
function poemStats(p) {
  const chars = [], js = [];
  p.lines.forEach(l => { [...l.h].forEach(c => chars.push(c)); l.j.trim().split(/\s+/).forEach(s => js.push(s)); });
  if (chars.length !== js.length) return { total: chars.length, stops: [] };
  const stops = [];
  chars.forEach((c, i) => { if (/([ptk])[1-6]?$/.test(js[i]) && !stops.includes(c)) stops.push(c); });
  return { total: chars.length, stops };
}
function renderPoemList() {
  const list = POEMS.map((p, i) => ({ p, i })).filter(x => poemFilter === '全部' || x.p.stage === poemFilter);
  $('#page-poems').innerHTML = `
  <div class="page-head">
    <h1>📖 诗歌跟读 <span class="tag">人教版中学教材必背诗词 · 共 ${POEMS.length} 首</span></h1>
    <div class="sub">为什么用粤语读诗词？粤语完整保留了<b>入声</b>和更多古音韵尾——很多诗用粤语读<b>更押韵、更带感</b>。<b>点击诗名进入跟读</b>：逐字注音自动标出入声（红角标）与难点韵母（蓝注音），全部用电脑语音直接朗读，无需任何音频文件。</div>
  </div>
  <div class="plan-tabs">
    ${POEM_STAGES.map(s => `<button class="plan-tab ${s === poemFilter ? 'active' : ''}" data-poem-filter="${s}">${s}${s === '全部' ? `（${POEMS.length}）` : `（${POEMS.filter(p => p.stage === s).length}）`}</button>`).join('')}
  </div>
  <div class="grid cols-3">
    ${list.map(({ p, i }) => {
      const st = poemStats(p);
      return `<div class="poem-item" data-poem="${i}" role="button" tabindex="0">
        <div class="pi-title">${esc(p.title)}</div>
        <div class="pi-author">${esc(p.author)}</div>
        <div class="pi-meta"><span class="tag ${p.stage === '高中' ? 't-blue' : p.stage === '初中' ? 't-green' : 't-red'}">${esc(p.stage || '入门')}</span>
          <span class="tag">${esc(p.level)}</span>${st.stops.length ? `<span class="tag t-red">入声×${st.stops.length}</span>` : ''}</div>
      </div>`;
    }).join('')}
  </div>
  <div class="ok-box">📌 <b>四步跟读法：</b>① 整句听 2 遍 → ② 慢速逐字跟 → ③ 原速连读 → ④ 盲读录音对比。入门 15 分钟/首，长词 30 分钟/首。</div>`;
}
function openPoemDetail(i) {
  const p = POEMS[i];
  const st = poemStats(p);
  $('#page-poems').innerHTML = `
  <div class="page-head">
    <button class="btn small" data-poem-back>← 返回诗词列表</button>
    <h1 style="margin-top:10px">📖 ${esc(p.title)} <span class="tag ${p.stage === '高中' ? 't-blue' : p.stage === '初中' ? 't-green' : 't-red'}">${esc(p.stage || '入门')}</span></h1>
    <div class="sub">${esc(p.author)} · ${esc(p.intro)}</div>
  </div>
  <div class="card poem-card">
    <div class="poem-head">
      <span style="margin-left:auto"><button class="btn small primary" data-say="${esc(p.lines.map(l => l.h).join('，'))}" data-rate="0.7">🔊 整首慢读</button></span>
    </div>
    ${p.lines.map(l => `<div class="poem-line">${rubyLine(l.h, l.j)}${lineControls(l.h)}</div>`).join('')}
    ${st.stops.length ? `<div class="warn-box" style="margin-top:12px">🔴 角标「入」= 入声字（-p/-t/-k 急停）：${esc(st.stops.join('、'))}——短促有力，别拖音。蓝注音 = 难点韵母（oe/eo/yu 系）。</div>` : ''}
    ${(p.notes || []).map(n => `<div class="note-box">💡 ${esc(n)}</div>`).join('')}
    <div class="local-player" data-lpp="${i}"></div>
  </div>
  <div class="ok-box">📌 学完点左上「返回列表」换下一首；建议按 初中 → 高中 顺序刷。</div>`;
  if (MEDIA.poems[i]) renderPoemPlayer(i);
  window.scrollTo({ top: 0 });
}

/* ============================================================
   F14 歌词解析工作台（v1.3）：粘贴歌词 → 逐字粤拼注音教学
   字典由站内全部诗词/歌曲/字库数据自动构建（约 1300+ 常用字）
   ============================================================ */
const JYUT_DICT = (() => {
  const d = new Map();
  const put = (c, j) => { if (c && j && !d.has(c)) d.set(c, j); };
  const fromLines = lines => lines.forEach(l => {
    const cs = [...l.h], js = l.j.trim().split(/\s+/);
    if (cs.length === js.length) cs.forEach((c, i) => put(c, js[i]));
  });
  POEMS.forEach(p => fromLines(p.lines));
  SONGS.forEach(s => fromLines(s.lines));
  CHAR_BANK.forEach(e => put(e.c, e.j));
  QUIZ.tone.forEach(q => put(q.c, q.j));
  return d;
})();
function buildSongs() {
  SONG_STUDY.mount($('#page-songs'), {
    toast,
    storageKey: key => AUTH.ready ? accountKey(key) : null,
    requireLogin,
    embedded: async source => {
      try {
        const buffer = source instanceof File ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer();
        return LYRICS.embedded(buffer);
      } catch (_) { return null; }
    },
    lookup: ch => JYUT_DICT.get(ch) || (typeof CANTO_DICT !== 'undefined' && CANTO_DICT.get(ch)),
    stop: () => { TTS.stopLoop(); pauseAllMedia(); },
    stopOthers: () => { TTS.stopLoop(); pauseAllMedia(true); },
  });
}

/* ============================================================
   F8 日常用语页
   ============================================================ */
function buildPhrases() {
  $('#page-phrases').innerHTML = `
  <div class="page-head">
    <h1>💬 日常用语 <span class="tag">8 大场景 · 生存粤语</span></h1>
    <div class="sub">学完当天就能用的句子。重点看"亮点注解"——粤语的字面和普通话哪里不一样（咗=了、冇=没有、喺=在、畀=给），理解了就不用死记。</div>
  </div>
  ${PHRASE_GROUPS.map(g => `
  <div class="group-head"><h3>${g.icon} ${esc(g.name)}</h3></div>
  <div class="grid cols-3">
    ${g.items.map(it => `
    <div class="phrase-item">
      <div class="body">
        <div class="c">${esc(it.c)} <button class="say" data-say="${esc(it.c)}">读</button></div>
        <div class="j">${esc(it.j)}</div>
        <div class="m">${esc(it.m)}</div>
        ${it.note ? `<div class="note">💡 ${esc(it.note)}</div>` : ''}
      </div>
    </div>`).join('')}
  </div>`).join('')}`;
}

/* ============================================================
   F9 90 天计划页
   ============================================================ */
function progressRing(pct) {
  const r = 34, c = 2 * Math.PI * r;
  return `<div class="ring">
    <svg width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="#eae5d8" stroke-width="9"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--brand)" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" style="transition:stroke-dashoffset .5s"/>
    </svg>
    <div class="val">${pct}%<small>完成度</small></div>
  </div>`;
}
function buildPlan() {
  if (!AUTH.ready) {
    $('#page-plan').innerHTML = '<div class="page-head"><h1>90 天学习计划</h1><p>登录后查看你的学习计划与进度。</p><button class="btn primary" data-login>登录 / 注册</button></div>';
    return;
  }
  const done = completedCount(), pct = Math.round(done / totalDays * 100), cur = currentDayObj();
  const month = PLAN.find(m => m.id === currentMonth) || PLAN[0];
  $('#page-plan').innerHTML = `
  <div class="page-head">
    <h1>🗓️ 90 天学习计划 <span class="tag">打卡永久保存</span></h1>
    <div class="sub">${esc(AUTH.user.name)} 的学习计划 · 拼音关 → 句型关 → 输出关。每天 15–30 分钟，达标后打卡，进度保存到当前账号。</div>
  </div>
  <div class="plan-summary">
    ${progressRing(pct)}
    <div style="flex:1;min-width:220px">
      <div style="font-weight:700;margin-bottom:4px">已打卡 ${done} / ${totalDays} 天 · 连续 ${streak()} 天 🔥</div>
      <div class="badge-row">
        ${BADGES.map(b => `<span class="badge ${done >= b.days ? 'got' : ''}" title="打卡满 ${b.days} 天">${b.icon} ${esc(b.name)}（${b.days}天）</span>`).join('')}
      </div>
    </div>
    <button class="btn small" id="resetProgress" style="align-self:flex-start">🗑️ 重置全部进度</button>
  </div>
  <div class="plan-tabs">
    ${PLAN.map(m => `<button class="plan-tab ${m.id === currentMonth ? 'active' : ''}" data-month="${m.id}">${esc(m.title)}</button>`).join('')}
  </div>
  <div class="note-box">🎯 本月目标：${esc(month.goal)}</div>
  ${month.weeks.map(w => `
    <div class="week-block">
      <div class="week-title">${esc(w.title)}</div>
      ${w.days.map(d => dayCard(d, cur.d)).join('')}
    </div>`).join('')}
  <div class="ok-box" style="margin-top:20px">🏆 坚持的秘密：把打卡时间绑定到固定习惯后（如晚饭后/通勤时），miss 了一天不要紧，第二天接着来——连续徽章断了也能重新点起来。</div>`;
}
function dayCard(d, curD) {
  const done = checkedDays.has(d.d);
  return `
  <div class="day-card ${done ? 'done' : ''} ${d.d === curD ? 'now' : ''}">
    <button class="day-check" data-check-day="${d.d}" title="打卡">${done ? '✓' : ''}</button>
    <div class="day-main">
      <div class="day-top"><span class="day-no">DAY ${d.d}</span><span class="day-title">${esc(d.t)}</span></div>
      <ul class="day-list">${d.learn.map(x => `<li><span class="ic">学</span>${esc(x)}</li>`).join('')}</ul>
      <ul class="day-list practice">${d.practice.map(x => `<li><span class="ic">练</span>${esc(x)}</li>`).join('')}</ul>
      <div class="day-test">✅ ${esc(d.test)}</div>
      <div class="day-actions">
        <button class="btn small" data-goto-page="${d.page}">去学习（${esc((NAV.find(n => n.id === d.page) || {}).label || d.page)}）</button>
        ${d.d !== curD ? '' : `<span class="tag t-red">今天</span>`}
      </div>
    </div>
  </div>`;
}
function renderSideProgress() {
  const done = completedCount(), pct = Math.round(done / totalDays * 100);
  $('#sideProgressBar').style.width = pct + '%';
  $('#sideProgressText').textContent = `${done} / ${totalDays} 天 · ${pct}%`;
}

/* ============================================================
   F10 闯关测验
   ============================================================ */
const quizState = { mode: null, qs: [], i: 0, score: 0, combo: 0, maxCombo: 0, answered: false };
const QSIZE = 10;

function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function buildQuiz() {
  quizState.mode = null;
  $('#page-quiz').innerHTML = `
  <div class="page-head">
    <h1>🎮 闯关测验 <span class="tag">玩着学 · 最佳成绩永久保存</span></h1>
    <div class="sub">三种玩法各 10 题，即时反馈+解析。听音辨调练耳朵，看字选拼练拼写，规律挑战把"普→粤推算法"焊进脑子里。</div>
  </div>
  <div class="quiz-setup">
    <button class="quiz-mode" data-quiz="tone">
      <span style="font-size:26px">👂</span><h3>听音辨调</h3>
      <p>播放一个字，选出它是第几声。六调听感的试金石。</p>
      <div class="best">最佳：${stats.tone} / 10</div>
    </button>
    <button class="quiz-mode" data-quiz="pinyin">
      <span style="font-size:26px">✍️</span><h3>看字选拼</h3>
      <p>看汉字选出正确粤拼。长短 a、-m/-n、入声全在里面。</p>
      <div class="best">最佳：${stats.pinyin} / 10</div>
    </button>
    <button class="quiz-mode" data-quiz="law">
      <span style="font-size:26px">🔮</span><h3>规律挑战</h3>
      <p>普通话→粤语的声调推算规律，答完你就是"预言家"。</p>
      <div class="best">最佳：${stats.law} / 10</div>
    </button>
  </div>
  <div class="note-box">💡 测验里听不清？顶部语速条没法作用于这里的慢放，可先去「九声六调」页用慢速模式磨耳朵再来。</div>`;
}

function startQuiz(mode) {
  quizState.mode = mode;
  quizState.qs = shuffle(QUIZ[mode]).slice(0, QSIZE);
  quizState.i = 0; quizState.score = 0; quizState.combo = 0; quizState.maxCombo = 0;
  renderQuizQ();
}
function toneOptions() {
  return TONES.map(t => `${t.n}｜${t.name}（${t.trend}）`);
}
function renderQuizQ() {
  const { mode, qs, i } = quizState;
  if (i >= qs.length) return renderQuizResult();
  const q = qs[i];
  const opts = mode === 'tone' ? toneOptions() : q.opts;
  let qHtml = '';
  if (mode === 'tone') qHtml = `<div class="quiz-q">听一听，这是第几声？<button class="btn primary play-big" data-say="${esc(q.c)}">🔊 播放「${esc(q.c)}」</button></div>`;
  else if (mode === 'pinyin') qHtml = `<div class="quiz-q">这个字的粤拼是？<span class="big-char">${esc(q.c)}</span></div>`;
  else qHtml = `<div class="quiz-q">${esc(q.q)}</div>`;
  $('#page-quiz').innerHTML = `
  <div class="quiz-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <button class="btn small" data-quiz-back>← 退出</button>
      <div class="combo">${quizState.combo >= 2 ? '🔥 连对 ' + quizState.combo + ' 题' : ''}</div>
    </div>
    <div class="quiz-prog">${qs.map((_, k) => `<i class="${k < i ? 'ok' : k === i ? 'cur' : ''}"></i>`).join('')}</div>
    ${qHtml}
    <div class="quiz-opts" id="quizOpts">
      ${opts.map((o, k) => `<button class="quiz-opt" data-opt="${k}">${esc(o)}</button>`).join('')}
    </div>
    <div id="quizExp"></div>
  </div>`;
  if (mode === 'tone') setTimeout(() => TTS.speak(q.c, { rate: 0.75 }), 250);
}
function answerQuiz(k) {
  if (quizState.answered) return;
  quizState.answered = true;
  const q = quizState.qs[quizState.i];
  const right = k === q.ans;
  const optBtns = $$('#quizOpts .quiz-opt');
  optBtns.forEach((b, idx) => { if (idx === q.ans) b.classList.add('right'); else if (idx === k) b.classList.add('wrong'); b.disabled = true; });
  if (right) { quizState.score++; quizState.combo++; quizState.maxCombo = Math.max(quizState.maxCombo, quizState.combo); }
  else quizState.combo = 0;
  const jyut = q.j ? `（${esc(q.j)}）` : '';
  $('#quizExp').innerHTML = `
    <div class="quiz-exp">${right ? '✅ 正确！' : '❌ 正确答案：' + esc((quizState.mode === 'tone' ? toneOptions() : q.opts)[q.ans])} ${jyut}<br>💡 ${esc(q.exp)}</div>
    <div style="text-align:center;margin-top:14px"><button class="btn primary" id="quizNext">${quizState.i + 1 >= quizState.qs.length ? '查看成绩 →' : '下一题 →'}</button></div>`;
  $('#quizNext').onclick = () => { quizState.answered = false; quizState.i++; renderQuizQ(); };
}
function renderQuizResult() {
  const s = quizState.score, m = quizState.mode;
  if (AUTH.ready && s > (stats[m] || 0)) { stats[m] = s; saveAccountCache(); scheduleSync(); }
  const msg = s >= 9 ? '🏆 掂过碌蔗！可以出师了' : s >= 7 ? '👍 有板有枝，继续保持' : s >= 5 ? '💪 过半了，回炉重点章节再来' : '🌱 正常的——回「九声六调/韵母」页磨一磨再来战';
  $('#page-quiz').innerHTML = `
  <div class="quiz-box quiz-result">
    <div class="score">${s} / ${QSIZE}</div>
    <div style="color:var(--muted);margin-bottom:6px">最高连对 ${quizState.maxCombo} 题 🔥</div>
    <div style="font-size:15px;margin-bottom:18px">${msg}</div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="btn primary" id="quizAgain">🔁 再来一轮</button>
      <button class="btn" data-quiz-back>返回选模式</button>
    </div>
  </div>`;
  $('#quizAgain').onclick = () => startQuiz(m);
}

/* ============================================================
   F11 学习指南页
   ============================================================ */
function buildGuide() {
  $('#page-guide').innerHTML = `
  <div class="page-head">
    <h1>🧭 学习指南 <small style="font-weight:400;color:var(--muted);font-size:14px">先花 5 分钟读完，少走 30 天弯路</small></h1>
  </div>

  <div class="guide-sec card">
    <h3>🔁 从声母韵母到拼字拼词（v1.1）</h3>
    <div class="step-flow">
      <div class="step"><b>① 呼读</b>声母呼读音（b→巴 baa1）</div>
      <div class="step"><b>② 韵母</b>完整音节示范，分清附带声母</div>
      <div class="step"><b>③ 合口</b>声母滑向韵母+声调定型</div>
      <div class="step"><b>④ 成词</b>单字连成词语（拼读教练）</div>
    </div>
    <div class="note-box">卡在"知道声母韵母却拼不出字"？去「拼读教练」用拼读机+逐字拼读演示，每天 10 分钟，一周后见字能拼。</div>
  </div>

  <div class="guide-sec card">
    <h3>👤 关于账号与云端同步（多用户部署时）</h3>
    <div class="note-box">本站支持两种用法：① <b>双击 index.html</b>——匿名模式，进度存本机浏览器；② 由服务器部署（node server.js）——顶栏出现「登录」按钮，注册后打卡和测验成绩自动同步云端，换设备登录不丢进度，登录时会与本机进度自动合并（打卡取并集、成绩取最高）。</div>
  </div>

  <div class="guide-sec card">
    <h3>📺 视频教程（配合文字更直观）</h3>
    <div class="grid cols-3">
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=粤语粤拼零基础入门"><b>粤语粤拼零基础</b><p style="font-size:12.5px;color:var(--muted)">系统的粤拼入门视频课，与第 1 周内容配套</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=粤语九声六调讲解"><b>九声六调精讲</b><p style="font-size:12.5px;color:var(--muted)">声调听感建立的专项视频，配本站调值图食用</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=粤语发音教学声母韵母"><b>声母韵母口型示范</b><p style="font-size:12.5px;color:var(--muted)">观察唇形、舌位和送气动作</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=粤语歌教学逐句教唱"><b>粤语歌逐句教唱</b><p style="font-size:12.5px;color:var(--muted)">跟唱党福音，逐句拆解咬字</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=看TVB学粤语"><b>看剧学粤语</b><p style="font-size:12.5px;color:var(--muted)">第 2、3 个月的泛听素材与方法</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=粤语正音懒音"><b>正音与懒音</b><p style="font-size:12.5px;color:var(--muted)">进阶：听懂港式懒音，自己发标准音</p></a>
    </div>
    <div class="note-box">视频为 B 站搜索直达（内容随平台更新）；文字吃不透的模块优先配视频看，卡点随时回对应模块点读。</div>
  </div>

  <div class="guide-sec card">
    <h3>✅ 注音与读音核对</h3>
    <div class="ok-box">汉字注音参考 Unicode Unihan 粤音数据；与它不同的教材或口语读音需另列来源。字典核对、例字归类和录音核对是三件不同的事。普通话近似音只帮助找发音位置，不能替代粤语示范。</div>
    <div class="note-box"><b>粤语发音：</b>声母、韵母、基础例字和拼读示范使用完整粤语音节录音，来源为 <a href="https://jyutping.org/jyutping/" target="_blank" rel="noopener">jyutping.org 粤拼方案</a>。呼读和借音节不等于孤立音素；句子朗读需要浏览器中已安装的粤语语音。字典校验只能核对注音，不能证明播放的声音正确。</div>
  </div>

  <div class="guide-sec card">
    <h3>🔗 外部参考站（免费，交叉验证用）</h3>
    <div class="grid cols-3">
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://www.neihou.cn/jyutping"><b>粤语通 · 声母韵母</b><p style="font-size:12.5px;color:var(--muted)">拼音表格与发音方法，可与本站声母/韵母模块交叉验证</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://www.neihou.cn/tones"><b>粤语通 · 粤语声调</b><p style="font-size:12.5px;color:var(--muted)">波形图展示音高变化，配合本站「九声六调」食用更佳</p></a>
      <a class="card qlink" style="box-shadow:none;text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://www.neihou.cn/pronunciation"><b>粤语通 · 粤语拼读</b><p style="font-size:12.5px;color:var(--muted)">粤拼标注段落练习，学完本站拼音关后的进阶泛读</p></a>
    </div>
    <div class="note-box">尊重原创：外部网站内容归原作者所有，本站只做链接推荐、不复制其内容；学习遇到分歧读音，以 Unihan 粤音库 + 粤语审音配词字字库为准。</div>
  </div>

  <div class="guide-sec card">
    <h3>🌉 普通话迁移三大利器</h3>
    <div class="kv" style="grid-template-columns:110px 1fr">
      <div class="k">① 直接迁移</div><div class="v">b p m f / d t n l / g k h 等声母、i u o 等元音和普通话几乎一样——这些<b>不用重学</b>，把精力省下来。</div>
      <div class="k">② 补缺口</div><div class="v">普通话没有的音要重点新建：<b>ng 声母</b>（我、牛）、<b>-m 韵尾</b>（三、心）、<b>入声 -p/-t/-k</b>（一、八、六）、<b>第 3/6 声</b>（两个平调）、<b>oe/eoi/oeng</b>（香、水、双）。</div>
      <div class="k">③ 防串台</div><div class="v">长得像但读法不同的要刻意隔离：粤拼 <b>j</b>=普通话 y（不是"鸡"！）；粤拼 <b>z/c/s</b> 一套通吃普通话 z/j、c/q、s/x 两套；粤语 <b>ung</b>≈普通话 ong；"家讲九"声母是 g 不是 j。</div>
    </div>
  </div>

  <div class="guide-sec card">
    <h3>🔁 四步跟读法（一切听音内容通用）</h3>
    <div class="step-flow">
      <div class="step"><b>① 盲听</b>整句听 2 遍，只听不读</div>
      <div class="step"><b>② 慢跟</b>语速 0.6，逐字逐句跟</div>
      <div class="step"><b>③ 原速</b>语速 0.8–1.0 连读</div>
      <div class="step"><b>④ 盲读</b>不看注音读，录音对比</div>
    </div>
    <div class="note-box">每句走完一轮约 2–3 分钟。每天 8–10 句就是高质量的 30 分钟。</div>
  </div>

  <div class="guide-sec card">
    <h3>⏰ 每日节奏建议（15–30 分钟）</h3>
    <table class="tbl">
      <tr><th>时长</th><th>内容</th></tr>
      <tr><td>5 min</td><td>热身：昨日内容快读一遍（口诀/例字）</td></tr>
      <tr><td>10–15 min</td><td>当天计划的学习内容（learn）</td></tr>
      <tr><td>5–10 min</td><td>练习任务（practice）+ 过关自测（test）</td></tr>
      <tr><td>随时随地</td><td>泛听：通勤/做饭放粤语歌，泡耳朵</td></tr>
    </table>
  </div>

  <div class="guide-sec card">
    <h3>🔊 关于电脑发音（TTS）</h3>
    <div class="kv" style="grid-template-columns:110px 1fr">
      <div class="k">用什么浏览器</div><div class="v"><b>Microsoft Edge（推荐）</b>或 Chrome：自带高质量粤语语音（如 Microsoft HiuMaan / Google 粤語）。顶栏亮绿灯即正常。</div>
      <div class="k">亮红灯怎么办</div><div class="v">① 换 Edge/Chrome 打开本站；② Windows 设置 → 时间和语言 → 语音 → 添加"中文(香港)"语音包后重启浏览器。</div>
      <div class="k">发音太机械？</div><div class="v">正常现象。TTS 负责"随时可听"，感情和连读请跟诗歌页 + 歌曲页的原曲（网易云/B站链接）配合使用，效果翻倍。</div>
    </div>
  </div>

  <div class="guide-sec card">
    <h3>❓ 新手 FAQ</h3>
    <div class="warn-box">Q：我听香港人说的和网站标的不一样？<br>A：口语里有"懒音"（n→l、ng 脱落、-n/-ng 混、gw 丢圆唇）。<b>听得出懒音、自己发标准音</b>是最佳策略——按字典音学，永远不吃亏。</div>
    <div class="note-box">Q：要学繁体字吗？<br>A：粤语正字（嘅、喺、咗、冇）建议跟着认，本站注解里都写了规律；长篇繁体阅读可以后置到第 3 个月之后。</div>
    <div class="note-box">Q：90 天真能学会粤语吗？<br>A：达到"生存粤语"（点餐问路闲聊 30 秒）完全现实；要看剧不听字幕、和本地人谈笑风生，则需后续 6–12 个月的输入积累——但地基就是这 90 天打的。</div>
    <div class="ok-box">Q：学不下去怎么办？<br>A：最低配保底版：只打卡 + 只跟读一首歌。火苗不灭，总有燎原的一天。</div>
  </div>

  <div class="guide-sec card">
    <h3>🚀 毕业以后（第 91 天起）</h3>
    <div class="grid cols-3">
      <div class="card" style="box-shadow:none"><b>📺 看剧精听</b><p style="font-size:13px;color:var(--muted)">推荐 TVB 经典（《男亲女爱》《溏心风暴》），一句话三步跟读法。每天 20 分钟。</p></div>
      <div class="card" style="box-shadow:none"><b>📻 播客/电台</b><p style="font-size:13px;color:var(--muted)">通勤泛听香港电台节目，不求全懂，练语流。</p></div>
      <div class="card" style="box-shadow:none"><b>➕ 进阶专题</b><p style="font-size:13px;color:var(--muted)">变调规则全解、俗语文化、粤语正字——修改《需求分析.md》§8 让本站加料！</p></div>
    </div>
  </div>`;
}

/* ============================================================
   F13 用户系统（v1.1 · 服务器模式）
   ============================================================ */
const AUTH = { on: false, ready: false, user: null, syncTimer: null, pending: Promise.resolve(), version: 0 };
try { AUTH.user = JSON.parse(sessionStorage.getItem('ygt_session') || 'null'); } catch (_) {}
function accountKey(key) { return 'ygt_account:' + encodeURIComponent(AUTH.user.name) + ':' + key; }
function saveAccountCache() {
  if (!AUTH.ready) return;
  LS.set(accountKey('progress'), [...checkedDays]); LS.set(accountKey('stats'), stats);
}
function requireLogin() {
  if (AUTH.ready) return true;
  if (AUTH.user && AUTH.on) toast('正在验证登录，请稍后再试');
  else if (AUTH.on) openLoginModal();
  else toast('计划学习需要登录，请通过本地服务器打开网页');
  return false;
}
function refreshAccountViews() {
  pauseAllMedia();
  quizState.mode = null; quizState.qs = []; quizState.answered = true;
  renderSideProgress(); buildHome(); buildPlan(); buildQuiz(); renderAuthBtn();
  SONG_STUDY.refreshAccount();
}
async function apiFetch(method, url, body, user = AUTH.user) {
  try {
    const r = await fetch(url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(user ? { Authorization: 'Bearer ' + user.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await r.json();
  } catch (e) { return null; }
}
function scheduleSync(now) {
  if (!AUTH.ready) return;
  clearTimeout(AUTH.syncTimer);
  const user = AUTH.user, body = { progress: [...checkedDays], stats: { ...stats } };
  AUTH.syncTimer = setTimeout(() => { AUTH.syncTimer = null; syncSnapshot(user, body); }, now ? 0 : 800);
}
function syncSnapshot(user, body) {
  AUTH.pending = AUTH.pending.then(async () => {
    const result = await apiFetch('POST', '/api/progress', body, user);
    if (AUTH.user?.token !== user.token) return;
    if (result?.error === 'bad token') { await doLogout(false); toast('登录已过期，请重新登录'); }
    else if (!result?.ok) toast('进度同步失败，已保存在当前账号的本机缓存');
  });
  return AUTH.pending;
}
async function initAuth() {
  const pong = await apiFetch('GET', '/api/ping');
  if (!pong || !pong.ok) return;
  AUTH.on = true;
  renderAuthBtn();
  if (AUTH.user && AUTH.user.token) {
    const user = AUTH.user, version = AUTH.version;
    const res = await apiFetch('GET', '/api/progress', undefined, user);
    if (version !== AUTH.version || AUTH.user?.token !== user.token) return;
    if (res && res.ok) { AUTH.ready = true; mergeRemote(res); }
    else { await doLogout(false); }
  }
}
function renderAuthBtn() {
  if (!AUTH.on) return;
  let b = $('#authBtn');
  if (!b) {
    b = document.createElement('button');
    b.id = 'authBtn'; b.className = 'btn small';
    $('.topbar-tools').prepend(b);
    b.addEventListener('click', () => { if (AUTH.user) { if (confirm('退出当前账号？')) doLogout(true); } else openLoginModal(); });
  }
  b.textContent = AUTH.user ? `👤 ${AUTH.user.name} · 退出` : '👤 登录';
}
function openLoginModal() {
  openModal(`
    <div class="modal-head"><div style="font-weight:700;font-size:16px">👤 登录 / 注册</div>
      <button class="close" data-close>✕</button></div>
    <div class="modal-body">
      <div class="note-box">登录后开始计划学习。打卡与测验成绩保存到各自账号；歌曲学习记录按账号保存在本机。</div>
      <div class="kv" style="grid-template-columns:64px 1fr">
        <div class="k">用户名</div><div class="v"><input id="lgName" maxlength="24" placeholder="2–24 个字符" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px"></div>
        <div class="k">密码</div><div class="v"><input id="lgPass" type="password" maxlength="64" placeholder="至少 4 位" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px"></div>
      </div>
      <div id="lgMsg" style="font-size:13px;color:var(--bad);min-height:20px;margin:6px 0"></div>
      <div style="display:flex;gap:10px">
        <button class="btn primary" id="lgDo">登录</button>
        <button class="btn" id="lgReg">注册新账号</button>
      </div>
    </div>`);
  const go = async isReg => {
    const name = $('#lgName').value.trim(), pass = $('#lgPass').value;
    if (name.length < 2 || pass.length < 4) { $('#lgMsg').textContent = '用户名至少 2 个字符、密码至少 4 位'; return; }
    const version = ++AUTH.version;
    $('#lgMsg').textContent = '正在登录…';
    $('#lgDo').disabled = $('#lgReg').disabled = true;
    const res = await apiFetch('POST', isReg ? '/api/register' : '/api/login', { name, pass }, null);
    if (version !== AUTH.version) return;
    if (res && res.ok && res.token) {
      AUTH.user = { name: res.name, token: res.token };
      checkedDays = new Set(); stats = { tone: 0, pinyin: 0, law: 0 };
      sessionStorage.setItem('ygt_session', JSON.stringify(AUTH.user));
      const p = await apiFetch('GET', '/api/progress');
      if (version !== AUTH.version) return;
      if (!p?.ok) { await doLogout(false); toast('登录验证失败，请重新登录'); return; }
      AUTH.ready = true; mergeRemote(p);
      closeModal();
      toast(isReg ? '🎉 注册成功，欢迎加入！' : `👋 欢迎回来，${name}！`);
    } else {
      if ($('#lgMsg')) { $('#lgMsg').textContent = (res && res.error) || '网络错误，请稍后再试'; $('#lgDo').disabled = $('#lgReg').disabled = false; }
    }
  };
  $('#lgDo').onclick = () => go(false);
  $('#lgReg').onclick = () => go(true);
}
function mergeRemote(p) {
  checkedDays = new Set(p.progress || []);
  stats = { tone: 0, pinyin: 0, law: 0, ...p.stats };
  saveAccountCache(); refreshAccountViews();
}
async function doLogout(callServer) {
  const user = AUTH.user, body = { progress: [...checkedDays], stats: { ...stats } }, wasReady = AUTH.ready;
  AUTH.version++; clearTimeout(AUTH.syncTimer); AUTH.syncTimer = null;
  AUTH.user = null; AUTH.ready = false;
  sessionStorage.removeItem('ygt_session');
  checkedDays = new Set(); stats = { tone: 0, pinyin: 0, law: 0 }; currentMonth = 'm1';
  refreshAccountViews();
  if ($('#page-plan').classList.contains('active')) switchPage('home');
  if (callServer && user) {
    if (wasReady) await syncSnapshot(user, body);
    await apiFetch('POST', '/api/logout', undefined, user);
    toast('已退出登录');
  }
}

/* Base sounds and complete example syllables share one cancellable player. */
function playSyllables(syllables, options = {}) {
  return PRONUNCIATION.play(syllables, { rate: settings.rate, onError: toast, ...options });
}
function playLesson(kind, id) {
  const syllable = PHONETIC_LESSONS[kind][id];
  if (!syllable) return;
  const label = kind === 'initials' ? `声母 ${id} · 呼读 ${syllable}` :
    `韵母 ${id} · 完整示范音节 ${syllable}`;
  const status = $(kind === 'initials' ? '#initialPlaybackStatus' : '#finalPlaybackStatus');
  if (status) status.textContent = label;
  return playSyllables([kind === 'finals' ? 'final-example:' + id : syllable]);
}
function spellingSteps(syllable, character) {
  const d = decompose(syllable);
  if (!d) return [];
  const steps = [];
  if (d.ini) steps.push({ sound: PHONETIC_LESSONS.initials[d.ini], label: `声母 ${d.ini} · 呼读示范` });
  steps.push({ sound: 'final-example:' + d.fin, label: `韵母 ${d.fin} · 完整音节示范` });
  steps.push({ sound: syllable, label: `合口：${character || ''} ${syllable}` });
  return steps;
}
function playSpelling(items) {
  const steps = items.flatMap(item => spellingSteps(item.j, item.c));
  const status = $('#spellingStatus');
  return playSyllables(steps.map(s => s.sound), {
    gapMs: 650,
    onStep: i => { if (status) status.textContent = steps[i].label; },
    onDone: () => { if (status) status.textContent = '拼读结束'; },
  });
}
/* ---------- v1.7 · MP3 剪辑（帧级无损切割，导出 AB 段 mp3） ---------- */
const MP3_BR = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
const MP3_SR = [44100,48000,32000,0];
async function cutMp3Export(url, startS, endS, outName) {
  const buf = await (await fetch(url)).arrayBuffer();
  const u8 = new Uint8Array(buf);
  let p = 0;
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
    p = 10 + (((u8[6] & 127) << 21) | ((u8[7] & 127) << 14) | ((u8[8] & 127) << 7) | (u8[9] & 127));
  }
  while (p < u8.length - 4 && !(u8[p] === 0xFF && (u8[p + 1] & 0xE0) === 0xE0)) p++;
  const out = [];
  let t = 0, started = false;
  while (p < u8.length - 4) {
    if (!(u8[p] === 0xFF && (u8[p + 1] & 0xE0) === 0xE0)) { p++; continue; }
    const ver = (u8[p + 1] >> 3) & 3, layer = (u8[p + 1] >> 1) & 3;
    if (ver !== 3 || layer !== 1) { p++; continue; }
    const bri = u8[p + 2] >> 4, sri = (u8[p + 2] >> 2) & 3, pad = (u8[p + 2] >> 1) & 1;
    const br = MP3_BR[bri] * 1000, sr = MP3_SR[sri];
    if (!br || !sr) { p++; continue; }
    const flen = Math.floor(144 * br / sr) + pad;
    if (p + flen > u8.length) break;
    const fdur = 1152 / sr;
    if (!started && t + fdur >= startS) started = true;
    if (started) out.push(u8.subarray(p, p + flen));
    if (started && t >= endS) break;
    t += fdur; p += flen;
  }
  if (!out.length) { toast('剪辑失败：未能解析该 mp3 的帧'); return; }
  const blob = new Blob(out, { type: 'audio/mpeg' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = outName;
  document.body.appendChild(a); a.click(); a.remove();
  toast('已导出剪辑：' + outName + '（帧级切割、无损）');
}

/* ---------- 逐句跟唱按钮复位 ---------- */
function resetLoopBtns() {
  $$('[data-loop]').forEach(b => { b.classList.remove('singing'); b.textContent = b.dataset.label || b.textContent; });
}

/* ============================================================
   本地媒体（v1.2 · media/ 目录音频自动识别）
   约定：media/songs/<歌名>.mp3、media/poems/<诗名>.mp3；
   服务器模式可用 media/manifest.json 指定文件名与教学段 start/end。
   ============================================================ */
const MEDIA = { manifest: null, songs: [], poems: [] };
const AUDIO_EXTS = ['mp3', 'm4a', 'ogg', 'wav'];
function fmtTime(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function pauseAllMedia(skipSong = false) {
  PRONUNCIATION.stop();
  if (!skipSong && typeof SONG_STUDY !== 'undefined') SONG_STUDY.stop();
  [...MEDIA.songs, ...MEDIA.poems].forEach(m => { if (m && m.audio) { try { m.audio.pause(); } catch (e) {} } });
}
function probeAudio(dir, name, preferredFile) {
  const list = [...new Set(preferredFile ? [preferredFile, ...AUDIO_EXTS.map(e => name + '.' + e)] : AUDIO_EXTS.map(e => name + '.' + e))];
  return new Promise(resolve => {
    let i = 0;
    const tryNext = () => {
      if (i >= list.length) return resolve(null);
      const f = list[i++];
      const a = new Audio();
      a.preload = 'metadata';
      let done = false;
      const ok = () => { if (done) return; done = true; a.preload = 'auto'; resolve({ audio: a, file: f }); };
      const bad = () => { if (done) return; done = true; setTimeout(tryNext, 0); };
      a.addEventListener('loadedmetadata', ok, { once: true });
      a.addEventListener('error', bad, { once: true });
      setTimeout(bad, 5000);
      a.src = dir + '/' + encodeURIComponent(f);
    };
    tryNext();
  });
}
async function probeMedia() {
  try {
    const r = await fetch('media/manifest.json', { cache: 'no-store' });
    if (r.ok) MEDIA.manifest = await r.json();
  } catch (e) { /* file:// 模式：跳过 manifest，按文件名探测 */ }
  const sm = (MEDIA.manifest && MEDIA.manifest.songs) || {};
  const pm = (MEDIA.manifest && MEDIA.manifest.poems) || {};
  POEMS.forEach((p, i) => {
    probeAudio('media/poems', p.title, pm[p.title] && pm[p.title].file).then(r => {
      if (!r) return;
      MEDIA.poems[i] = { audio: r.audio };
      renderPoemPlayer(i);
    });
  });
}
const RATE_OPTS = [0.5, 0.6, 0.75, 0.85, 1];
function renderSongPlayer(i) {
  const box = document.querySelector(`[data-lp="${i}"]`);
  if (!box) return;
  const m = MEDIA.songs[i];
  box.innerHTML = `
  <div class="lp-box">
    <span class="lp-badge">💿 本地原曲</span>
    <button class="btn small primary" data-ap="play:${i}">▶ 播放</button>
    <button class="btn small" data-ap="seek:${i}:-5">⏪5s</button>
    <button class="btn small" data-ap="seek:${i}:5">⏩5s</button>
    <label class="lp-rate">语速<select data-ap-rate="${i}">${RATE_OPTS.map(v => `<option value="${v}"${v === 0.75 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    <button class="btn small" data-ap="a:${i}">设A</button>
    <button class="btn small" data-ap="b:${i}">设B</button>
    <button class="btn small" data-ap="loop:${i}">🔁 循环AB</button>
    <button class="btn small" data-ap="clear:${i}">清除段</button>
    ${m.clip ? `<button class="btn small" data-ap="jump:${i}">🎯 教学段 ${fmtTime(m.clip.start)}–${m.clip.end != null ? fmtTime(m.clip.end) : '尾'}</button>` : ''}
    <button class="btn small" data-cut="${i}">✂️ 导出AB段</button>
    <span class="lp-time" id="lpt-${i}">0:00 / 0:00</span>
  </div>
  <div class="lp-hint">跟唱法：语速 0.75 → 设A/设B 圈住要练的段落 → 🔁 循环AB 反复跟唱；熟练后语速调回 1。</div>`;
  const row = box.closest('[data-songrow]'); if (row) row.style.display = '';
  const emptyHint = document.getElementById('localEmpty'); if (emptyHint) emptyHint.style.display = 'none';
  const a = m.audio;
  a.playbackRate = 0.75;
  a.addEventListener('timeupdate', () => {
    const lbl = document.getElementById('lpt-' + i);
    if (lbl) lbl.textContent = fmtTime(a.currentTime) + ' / ' + fmtTime(a.duration);
    if (m.loop && m.seg.b != null && a.currentTime >= m.seg.b) a.currentTime = m.seg.a != null ? m.seg.a : 0;
  });
  a.addEventListener('play', () => { const b = box.querySelector(`[data-ap="play:${i}"]`); if (b) b.textContent = '⏸ 暂停'; });
  a.addEventListener('pause', () => { const b = box.querySelector(`[data-ap="play:${i}"]`); if (b) b.textContent = '▶ 播放'; });
}
function renderPoemPlayer(i) {
  const box = document.querySelector(`[data-lpp="${i}"]`);
  if (!box) return;
  const a = MEDIA.poems[i].audio;
  box.innerHTML = `
  <div class="lp-box">
    <span class="lp-badge">💿 本地朗读</span>
    <button class="btn small primary" data-pp="play:${i}">▶ 播放</button>
    <label class="lp-rate">语速<select data-pp-rate="${i}">${RATE_OPTS.map(v => `<option value="${v}"${v === 0.8 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    <span class="lp-time" id="lppt-${i}">0:00 / 0:00</span>
  </div>`;
  a.playbackRate = 0.8;
  a.addEventListener('timeupdate', () => {
    const lbl = document.getElementById('lppt-' + i);
    if (lbl) lbl.textContent = fmtTime(a.currentTime) + ' / ' + fmtTime(a.duration);
  });
  a.addEventListener('play', () => { const b = box.querySelector(`[data-pp="play:${i}"]`); if (b) b.textContent = '⏸ 暂停'; });
  a.addEventListener('pause', () => { const b = box.querySelector(`[data-pp="play:${i}"]`); if (b) b.textContent = '▶ 播放'; });
}

/* ============================================================
   弹窗 & 全局事件
   ============================================================ */
function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modalMask').classList.add('show');
}
function closeModal() { TTS.stopLoop(); pauseAllMedia(); $('#modalMask').classList.remove('show'); }

document.addEventListener('click', e => {
  const stop = e.target.closest('[data-stop-pronunciation]');
  if (stop) { TTS.stopLoop(); pauseAllMedia(); resetLoopBtns(); return; }
  const si = e.target.closest('[data-phonetic-initial]');
  if (si) {
    TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
    playLesson('initials', si.dataset.phoneticInitial);
    return;
  }
  const sf = e.target.closest('[data-phonetic-final]');
  if (sf) {
    TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
    playLesson('finals', sf.dataset.phoneticFinal);
    return;
  }
  const pmf = e.target.closest('[data-poem-filter]');
  if (pmf) { poemFilter = pmf.dataset.poemFilter; renderPoemList(); return; }
  const pmb = e.target.closest('[data-poem-back]');
  if (pmb) { renderPoemList(); return; }
  const pm = e.target.closest('[data-poem]');
  if (pm) { openPoemDetail(+pm.dataset.poem); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('已复制：' + cp.dataset.copy)).catch(() => {}); return; }
  const cut = e.target.closest('[data-cut]');
  if (cut) {
    const i1 = +cut.dataset.cut, m1 = MEDIA.songs[i1];
    if (!m1) return;
    const a1 = m1.audio;
    const st = m1.seg.a != null ? m1.seg.a : (m1.clip && m1.clip.start) || 0;
    const ed = m1.seg.b != null ? m1.seg.b : (m1.clip && m1.clip.end) || a1.duration || 0;
    if (ed - st < 0.5) { toast('先用 设A/设B（或教学段）选择要剪辑的范围'); return; }
    toast('正在按帧剪辑导出…');
    cutMp3Export('media/songs/' + encodeURIComponent(m1.file), st, ed, (SONGS[i1] || { name: 'clip' }).name + '-片段.mp3');
    return;
  }
  const ap = e.target.closest('[data-ap]');
  if (ap) {
    const [act, idxStr, arg] = ap.dataset.ap.split(':');
    const m = MEDIA.songs[+idxStr];
    if (!m) return;
    const a = m.audio;
    if (act === 'play') {
      const wasPaused = a.paused;
      TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
      if (wasPaused) a.play().catch(() => {});
    } else if (act === 'seek') { a.currentTime = Math.max(0, Math.min((a.duration || 1e9) - 0.2, a.currentTime + (+arg))); }
    else if (act === 'a') { m.seg.a = a.currentTime; toast('段落起点 A：' + fmtTime(m.seg.a) + '（再设 B 即可循环）'); }
    else if (act === 'b') { m.seg.b = a.currentTime; toast('段落终点 B：' + fmtTime(m.seg.b) + '，点「🔁 循环AB」开始'); }
    else if (act === 'loop') { m.loop = !m.loop; toast(m.loop ? '🔁 段落循环已开启' : '段落循环已关闭'); }
    else if (act === 'clear') { m.seg.a = m.seg.b = null; m.loop = false; toast('已清除段落'); }
    else if (act === 'jump' && m.clip) { a.currentTime = m.clip.start; if (a.paused) { TTS.stopLoop(); pauseAllMedia(); a.play().catch(() => {}); } }
    return;
  }
  const pp = e.target.closest('[data-pp]');
  if (pp) {
    const [act, idxStr] = pp.dataset.pp.split(':');
    const m = MEDIA.poems[+idxStr];
    if (!m) return;
    if (act === 'play') { const wasPaused = m.audio.paused; TTS.stopLoop(); resetLoopBtns(); pauseAllMedia(); if (wasPaused) m.audio.play().catch(() => {}); }
    return;
  }
  const say = e.target.closest('[data-say]');
  if (say) {
    TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
    if (say.dataset.jyutping) playSyllables(say.dataset.jyutping.split(','), { rate: parseFloat(say.dataset.rate || '') || settings.rate });
    else if (!TTS.speak(say.dataset.say, { rate: parseFloat(say.dataset.rate || '') || undefined })) {
      toast('未检测到粤语语音，无法朗读此内容；声母和韵母仍可使用本地录音。');
    }
    const toneRow = say.closest('.tone-row');
    if (toneRow) {
      const svg = toneRow.querySelector('.tone-svg');
      if (svg) { svg.classList.remove('playing'); void svg.offsetWidth; svg.classList.add('playing'); }
    }
    return;
  }
  const seq = e.target.closest('[data-seq]');
  if (seq) {
    TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
    if (seq.dataset.jyutpingSeq) { playSyllables(seq.dataset.jyutpingSeq.split(',')); return; }
    const arr = seq.dataset.seq.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (!TTS.speakSeq(arr)) toast('当前浏览器不支持语音合成，请用 Edge / Chrome 打开');
    return;
  }
  const loop = e.target.closest('[data-loop]');
  if (loop) {
    if (TTS.isLooping()) { TTS.stopLoop(); resetLoopBtns(); pauseAllMedia(); return; }
    pauseAllMedia();
    const lines = loop.dataset.loop.split('｜').map(s => s.trim()).filter(Boolean);
    const ok = TTS.speakLoop(lines, { rate: 0.75, gapMs: 2800, onDone: resetLoopBtns });
    if (!ok) { toast('当前浏览器不支持语音合成，请用 Edge / Chrome 打开'); return; }
    resetLoopBtns();
    loop.classList.add('singing');
    loop.textContent = '⏹ 停止跟唱';
    return;
  }
  const spell = e.target.closest('[data-spell-syllable]');
  if (spell) {
    TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
    playSpelling([{ j: spell.dataset.spellSyllable }]);
    return;
  }
  const bd = e.target.closest('[data-bdemo]');
  if (bd) {
    const w = BLEND_WORDS[+bd.dataset.bdemo];
    if (!w) return;
    TTS.stopLoop(); resetLoopBtns(); pauseAllMedia();
    playSpelling([...w.w].map((c, i) => ({ c, j: w.j[i] })));
    return;
  }
  const gp = e.target.closest('[data-goto]');
  if (gp) { goto(gp.dataset.goto); return; }
  const gp2 = e.target.closest('[data-goto-page]');
  if (gp2) { goto(gp2.dataset.gotoPage); return; }
  const gpl = e.target.closest('[data-goto-plan]');
  if (gpl) {
    if (!requireLogin()) return;
    currentMonth = 'm' + (Math.floor((+gpl.dataset.gotoPlan - 1) / 30) + 1);
    buildPlan(); goto('plan');
    setTimeout(() => { const el = document.querySelector(`[data-check-day="${gpl.dataset.gotoPlan}"]`); if (el) el.closest('.day-card').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
    return;
  }
  const ini = e.target.closest('[data-initial]');
  if (ini) { initialModal(INITIALS[+ini.dataset.initial]); return; }
  const fin = e.target.closest('[data-final]');
  if (fin) {
    const [gid, ix] = fin.dataset.final.split(':');
    const g = FINAL_GROUPS.find(g => g.id === gid);
    finalModal(g.finals[+ix]);
    return;
  }
  const chk = e.target.closest('[data-check-day]');
  if (chk) {
    if (!requireLogin()) return;
    const d = +chk.dataset.checkDay;
    if (checkedDays.has(d)) checkedDays.delete(d);
    else {
      checkedDays.add(d);
      const b = BADGES.find(b => b.days === checkedDays.size);
      toast(b ? `🎉 打卡成功！解锁徽章「${b.icon} ${b.name}」！` : '✅ 打卡成功，继续保持！');
    }
    saveProgress();
    return;
  }
  const qm = e.target.closest('[data-quiz]');
  if (qm) { startQuiz(qm.dataset.quiz); return; }
  if (e.target.closest('[data-quiz-back]')) { buildQuiz(); return; }
  const opt = e.target.closest('.quiz-opt');
  if (opt) { answerQuiz(+opt.dataset.opt); return; }
  const mt = e.target.closest('[data-month]');
  if (mt) { currentMonth = mt.dataset.month; buildPlan(); return; }
  if (e.target.closest('[data-close]') || e.target.id === 'modalMask') { closeModal(); return; }
  if (e.target.closest('[data-login]')) { requireLogin(); return; }
  if (e.target.closest('#menuBtn')) { $('#sidebar').classList.toggle('open'); return; }
});

/* ---------- 顶栏工具 ---------- */
$('#recordingSource').value = PRONUNCIATION.source;
$('#recordingSource').onchange = e => { TTS.stopLoop(); pauseAllMedia(); PRONUNCIATION.setSource(e.target.value); };
$('#rateSlider').value = settings.rate || 0.8;
$('#rateVal').textContent = (+$('#rateSlider').value).toFixed(2);
TTS.setRate(+$('#rateSlider').value);
$('#rateSlider').addEventListener('input', e => {
  settings.rate = +e.target.value; LS.set('ygt_settings', settings);
  $('#rateVal').textContent = (+e.target.value).toFixed(2);
  TTS.setRate(+e.target.value);
});
$('#voiceSelect').addEventListener('change', e => {
  if (TTS.setVoice(e.target.value)) {
    settings.voice = e.target.value; LS.set('ygt_settings', settings);
    toast('已切换语音，试听一下：');
    TTS.speak('你好！我系你嘅粤语老师，一齐学粤语啦。', { rate: 0.85 });
  }
});
// 本地音频播放器语速
document.addEventListener('change', e => {
  const r = e.target.closest('[data-ap-rate]');
  if (r) { const m = MEDIA.songs[+r.dataset.apRate]; if (m) m.audio.playbackRate = +r.value; }
  const pr = e.target.closest('[data-pp-rate]');
  if (pr) { const m = MEDIA.poems[+pr.dataset.ppRate]; if (m) m.audio.playbackRate = +pr.value; }
});
document.addEventListener('click', e => {
  if (e.target.closest('#resetProgress')) {
    if (!requireLogin()) return;
    if (confirm('确定清空全部打卡与测验成绩吗？此操作不可恢复。')) {
      checkedDays = new Set(); stats = { tone: 0, pinyin: 0, law: 0 };
      saveAccountCache();
      saveProgress(); buildQuiz(); toast('已重置，重新出发！');
    }
  }
});

/* ---------- 启动 ---------- */
function boot() {
  $('#nav').innerHTML = NAV.map(n => `<button class="nav-item" data-page="${n.id}"><span class="ico">${n.icon}</span>${n.label}</button>`).join('');
  $$('.nav-item').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));

  buildHome(); buildInitials(); buildFinals(); buildBlend(); buildTones();
  buildPoems(); buildSongs(); buildPhrases(); buildPlan(); buildQuiz(); buildGuide();
  renderSideProgress();
  initAuth();
  probeMedia();

  TTS.init(refreshVoiceChip, settings.voice);
  let tries = 0;
  const t = setInterval(() => { refreshVoiceOptions(); if (++tries > 8 || (TTS.cantoVoices.length && TTS.voice)) clearInterval(t); }, 400);
  refreshVoiceOptions();

  switchPage('home');
}
boot();
})();
