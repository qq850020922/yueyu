/* One cancellable recording sequence for phonetic lessons and spelling practice. */
const PRONUNCIATION = (() => {
  let generation = 0, audio = null, timer = null, pending = null;
  let source = 'unified';
  try { source = localStorage.getItem('ygt_recording_source') || source; } catch (_) {}
  const unified = () => source === 'unified' && typeof UNIFIED_VOICE_FILES !== 'undefined';
  const files = () => unified() ? UNIFIED_VOICE_FILES : (typeof PRONUNCIATION_FILES === 'undefined' ? {} : PRONUNCIATION_FILES);
  const isPhoneme = syllable => typeof PHONEME_FILES !== 'undefined' && Object.hasOwn(PHONEME_FILES, syllable);
  const finalExample = key => typeof PHONETIC_LESSONS !== 'undefined' && key.startsWith('final-example:') ? PHONETIC_LESSONS.finals[key.slice(14)] : null;
  const has = syllable => isPhoneme(syllable) || (finalExample(syllable) ?
    typeof PRONUNCIATION_FILES !== 'undefined' && Object.hasOwn(PRONUNCIATION_FILES, finalExample(syllable)) : Object.hasOwn(files(), syllable));

  function stop() {
    generation++;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause();
      audio = null;
    }
    if (pending) { const resolve = pending; pending = null; resolve(false); }
  }

  function wait(ms) {
    return new Promise(resolve => {
      pending = resolve;
      timer = setTimeout(() => { timer = null; pending = null; resolve(true); }, ms);
    });
  }

  function playOne(syllable, rate, token) {
    return new Promise(resolve => {
      const example = finalExample(syllable);
      const src = example ? 'media/pronunciation/' + PRONUNCIATION_FILES[example] : isPhoneme(syllable) ? 'media/phonemes/' + PHONEME_FILES[syllable] :
        (unified() ? 'media/voice-cuhk/' : 'media/pronunciation/') + files()[syllable];
      const item = new Audio(src);
      audio = item;
      pending = resolve;
      item.playbackRate = Math.max(0.5, Math.min(1, rate));
      item.preservesPitch = true;
      const finish = ok => {
        item.onended = item.onerror = null;
        if (pending === resolve) pending = null;
        if (audio === item) audio = null;
        resolve(ok && token === generation);
      };
      item.onended = () => finish(true);
      item.onerror = () => finish(false);
      try { item.play().catch(() => finish(false)); } catch (_) { finish(false); }
    });
  }

  async function play(syllables, options = {}) {
    stop();
    const list = typeof syllables === 'string' ? [syllables] : syllables;
    if (!list?.length || list.some(s => !has(s))) {
      options.onError?.(unified() ? '统一音色暂无这个音节；可在顶部选择「原录音（多位）」试听。' : '缺少对应的粤语录音，请运行 tools/fetch-pronunciation.js 补齐。');
      return false;
    }
    const token = generation;
    for (let i = 0; i < list.length; i++) {
      if (token !== generation) return false;
      options.onStep?.(i, list[i]);
      const ok = await playOne(list[i], options.rate || 0.8, token);
      if (token !== generation) return false;
      if (!ok) { options.onError?.('录音播放失败，请检查本地音频文件。'); return false; }
      if (i < list.length - 1 && !await wait(options.gapMs ?? 350)) return false;
    }
    options.onDone?.();
    return true;
  }

  function setSource(value) {
    stop(); source = value === 'original' ? 'original' : 'unified';
    try { localStorage.setItem('ygt_recording_source', source); } catch (_) {}
  }
  return { play, stop, has, setSource, get source() { return source; } };
})();
