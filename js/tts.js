/* ============================================================
   F2 发音引擎 · Web Speech API 封装（需求分析.md §4-F2）
   - 自动挑选 zh-HK 粤语语音；无粤语语音时回调警示
   - 语速 0.5–1.0 可调；支持 单字 / 整句 / 序列连读
   ============================================================ */
const TTS = (() => {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let voices = [];
  let picked = null;          // 当前粤语语音
  let rate = 1;
  let onStatus = () => {};    // 状态回调 (state, voiceName)

  function isCanto(v) {
    const l = (v.lang || '').toLowerCase().replace(/_/g, '-');
    if (/^yue(?:-|$)/.test(l) || /^zh-(?:hant-)?hk$/.test(l)) return true;
    const n = (v.name || '').toLowerCase();
    return /cantonese|粤|yue/.test(n) && !/mandarin|普通话/.test(n);
  }

  function pickBest() {
    const canto = voices.filter(isCanto);
    if (canto.length) {
      // 优先自然语音（神经音），再按名称排序求稳定
      canto.sort((a, b) => (b.name.includes('Natural') ? 1 : 0) - (a.name.includes('Natural') ? 1 : 0));
      picked = canto.find(v => v.voiceURI === picked?.voiceURI) || canto[0];
      onStatus('ok', picked.name);
    } else {
      picked = null;
      const zh = voices.find(v => (v.lang || '').toLowerCase().startsWith('zh'));
      onStatus('bad', zh ? null : undefined); // null=有中文但无粤语; undefined=一个中文语音都没有
    }
  }

  function refresh() {
    if (!supported) return onStatus('bad', undefined);
    try { voices = speechSynthesis.getVoices() || []; } catch (_) { voices = []; }
    pickBest();
  }

  function init(statusCb, savedVoiceURI) {
    onStatus = statusCb || onStatus;
    if (!supported) { onStatus('bad', undefined); return; }
    speechSynthesis.onvoiceschanged = () => { refresh(); if (savedVoiceURI) setVoice(savedVoiceURI); };
    refresh();
    if (savedVoiceURI) setVoice(savedVoiceURI);
    // 某些浏览器 voices 异步且不触发事件，轮询兜底
    let n = 0;
    const t = setInterval(() => {
      refresh();
      if (picked && savedVoiceURI) setVoice(savedVoiceURI);
      if (++n > 10 || (voices.length && picked)) clearInterval(t);
    }, 350);
  }

  function setVoice(uri) {
    const v = voices.find(v => v.voiceURI === uri);
    if (v && isCanto(v)) { picked = v; onStatus('ok', v.name); return true; }
    return false;
  }

  function setRate(r) { rate = Math.min(1, Math.max(0.5, +r || 1)); }

  function speak(text, opt = {}) {
    if (!supported || !picked) { return false; }
    if (typeof PRONUNCIATION !== 'undefined') PRONUNCIATION.stop();
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (picked) u.voice = picked;
      u.lang = picked ? picked.lang : 'zh-HK';
      u.rate = opt.rate != null ? opt.rate : rate;
      u.pitch = opt.pitch != null ? opt.pitch : 1;
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  // 序列连读：逐个朗读，间隔 ms
  function speakSeq(texts, opt = {}) {
    if (!supported || !picked || !texts || !texts.length) return false;
    if (typeof PRONUNCIATION !== 'undefined') PRONUNCIATION.stop();
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    texts.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      if (picked) u.voice = picked;
      u.lang = picked ? picked.lang : 'zh-HK';
      u.rate = opt.rate != null ? opt.rate : rate;
      if (i > 0) u.text = '，' + t; // 停顿感
      speechSynthesis.speak(u);
    });
    return true;
  }

  // v1.1 逐句跟唱：播一句 → 留白 gapMs 供用户跟 → 下一句（onDone 收尾）
  let loopTimer = null, loopActive = false;
  function speakLoop(texts, opt = {}) {
    if (!supported || !picked || !texts || !texts.length) return false;
    if (typeof PRONUNCIATION !== 'undefined') PRONUNCIATION.stop();
    stopLoop();
    loopActive = true;
    const gap = opt.gapMs != null ? opt.gapMs : 2600;
    const seq = [...texts];
    const step = () => {
      if (!loopActive) return;
      const t = seq.shift();
      if (t == null) { loopActive = false; if (opt.onDone) opt.onDone(); return; }
      const u = new SpeechSynthesisUtterance(t);
      if (picked) u.voice = picked;
      u.lang = picked ? picked.lang : 'zh-HK';
      u.rate = opt.rate != null ? opt.rate : rate;
      u.onend = () => { if (loopActive) loopTimer = setTimeout(step, gap); };
      u.onerror = () => { if (loopActive) loopTimer = setTimeout(step, gap); };
      speechSynthesis.speak(u);
      if (opt.onLine) opt.onLine(texts.length - seq.length - 1);
    };
    step();
    return true;
  }
  function stopLoop() {
    loopActive = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    if (supported) { try { if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); } catch (e) {} }
  }
  const isLooping = () => loopActive;

  return {
    init, speak, speakSeq, setRate, setVoice, speakLoop, stopLoop,
    get supported() { return supported; },
    get hasVoice() { return !!picked; },
    get voices() { return voices; },
    get cantoVoices() { return voices.filter(isCanto); },
    get voice() { return picked; },
    isLooping,
  };
})();
