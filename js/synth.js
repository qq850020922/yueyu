/* ============================================================
   声母/韵母「本音」合成引擎 v2（v1.5 修复版）
   关键修正：v1 的滤波器并联导致滑音变混、辅音被淹没（听感全是 a）。
   v2 改为单一滤波器组 + AudioParam 时间线调度（真正的共振峰滑移），
   辅音段（爆破/摩擦/鼻音）与元音载体严格串行，辅音增益显著提高。
   ============================================================ */
const SYNTH = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /* 元音共振峰 [F1,F2,F3]（近似男声） */
  const V = {
    aa: [850, 1220, 2600], a: [600, 1450, 2500], e: [550, 1900, 2650],
    i: [300, 2300, 3000], o: [520, 860, 2500], u: [320, 800, 2400],
    oe: [420, 1550, 2300], eo: [460, 1350, 2200], yu: [250, 2000, 2450],
  };
  const NAS = { m: [280, 1100, 2300], n: [280, 1700, 2600], ng: [280, 2100, 2600] };
  const BURST = { p: 750, t: 3600, k: 2200 };

  /* ---------- 带通滤波器组（共享一组，随时间滑移） ----------
     segs: [{f:[F1,F2,F3], t:绝对开始秒}]，时长 dur；gain 包络整体 */
  let glottal = null;
  function getGlottal(c) {
    if (glottal) return glottal;
    const N = 40, real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) imag[n] = 1 / (n * n); // 谐波按 1/n² 滚降≈声门脉冲
    glottal = c.createPeriodicWave(real, imag, { disableNormalization: false });
    return glottal;
  }
  function voicedSegs(segs, dur, opt = {}) {
    const c = getCtx(); if (!c) return false;
    const t0 = c.currentTime + Math.min(opt.at || 0.02, 0.02) + Math.max(0, (opt.at || 0) - 0.02);
    const osc = c.createOscillator();
    osc.setPeriodicWave(getGlottal(c));
    const f0s = opt.f0 || 122, f0e = opt.f0e || 104;
    osc.frequency.setValueAtTime(f0s, t0);
    osc.frequency.linearRampToValueAtTime(f0e, t0 + dur);
    const env = c.createGain();
    const peak = opt.gain != null ? opt.gain : 0.9;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.02);
    env.gain.setValueAtTime(peak, t0 + Math.max(0.025, dur - 0.06));
    env.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    const gains = [1, 0.5, 0.22], qs = [6, 8, 9];
    for (let k = 0; k < 3; k++) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = qs[k];
      bp.frequency.setValueAtTime(segs[0].f[k], t0 + segs[0].t);
      for (let sg = 1; sg < segs.length; sg++) {
        bp.frequency.linearRampToValueAtTime(segs[sg].f[k], t0 + segs[sg].t);
      }
      const g = c.createGain(); g.gain.value = gains[k];
      osc.connect(bp); bp.connect(g); g.connect(env);
    }
    env.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return true;
  }
  /* ---------- 噪声段（爆破/送气/摩擦） ---------- */
  function noiseSeg(at, dur, { hp, bp, gain = 0.3 } = {}) {
    const c = getCtx(); if (!c) return false;
    const t0 = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * (dur + 0.04)));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    let node = src;
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = 0.8; node.connect(f); node = f; }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
    return true;
  }
  const glide = (a, b, at) => [{ f: V[a], t: at }, { f: V[b], t: at + 0.16 }];

  /* ============ 声母本音：辅音(可闻) + 轻读 a 载体 ============ */
  function playInitial(id) {
    const c = getCtx(); if (!c) return false;
    const base = c.currentTime + 0.02;
    const AA = V.aa;
    const vowel = (at, segs, dur) => voicedSegs(segs || [{ f: AA, t: 0 }], dur || 0.4, { at: at, f0: 128, f0e: 106 });
    const SPEC = {
      b: () => { noiseSeg(base + 0.1, 0.022, { bp: 700, gain: 0.5 }); vowel(0.13); },
      p: () => { noiseSeg(base + 0.05, 0.085, { bp: 1200, gain: 0.35 }); vowel(0.14); },
      d: () => { noiseSeg(base + 0.1, 0.022, { bp: 1900, gain: 0.5 }); vowel(0.13); },
      t: () => { noiseSeg(base + 0.05, 0.085, { bp: 2600, gain: 0.35 }); vowel(0.14); },
      g: () => { noiseSeg(base + 0.1, 0.024, { bp: 2100, gain: 0.5 }); noiseSeg(base + 0.1, 0.02, { hp: 500, gain: 0.2 }); vowel(0.13); },
      k: () => { noiseSeg(base + 0.05, 0.09, { bp: 1900, gain: 0.35 }); vowel(0.15); },
      m: () => voicedSegs([{ f: NAS.m, t: 0 }, { f: AA, t: 0.24 }], 0.62, { f0: 122, f0e: 104, gain: 0.42 }),
      n: () => voicedSegs([{ f: NAS.n, t: 0 }, { f: AA, t: 0.24 }], 0.62, { f0: 122, f0e: 104, gain: 0.42 }),
      ng: () => voicedSegs([{ f: NAS.ng, t: 0 }, { f: AA, t: 0.24 }], 0.62, { f0: 122, f0e: 104, gain: 0.42 }),
      l: () => voicedSegs([{ f: [360, 1100, 2700], t: 0 }, { f: AA, t: 0.22 }], 0.6, { f0: 126, f0e: 106, gain: 0.45 }),
      f: () => { noiseSeg(base, 0.18, { bp: 2300, gain: 0.42 }); vowel(0.2); },
      h: () => { noiseSeg(base, 0.16, { hp: 400, gain: 0.26 }); vowel(0.18); },
      s: () => { noiseSeg(base, 0.2, { hp: 4200, gain: 0.5 }); vowel(0.22); },
      z: () => { noiseSeg(base, 0.055, { hp: 4000, gain: 0.4 }); vowel(0.07); },
      c: () => { noiseSeg(base, 0.095, { hp: 3600, gain: 0.5 }); vowel(0.11); },
      j: () => voicedSegs(glide('i', 'aa', 0), 0.5, { f0: 130, f0e: 106 }),
      w: () => voicedSegs(glide('u', 'aa', 0), 0.5, { f0: 126, f0e: 106 }),
      gw: () => { noiseSeg(base + 0.1, 0.022, { bp: 1600, gain: 0.45 }); voicedSegs(glide('u', 'aa', 0), 0.5, { f0: 126, f0e: 106 }); },
      kw: () => { noiseSeg(base + 0.05, 0.085, { bp: 1600, gain: 0.35 }); voicedSegs(glide('u', 'aa', 0), 0.5, { f0: 126, f0e: 106 }); },
    };
    const fn = SPEC[id];
    if (!fn) return false;
    fn();
    return true;
  }

  /* ============ 韵母本音 ============ */
  const GLIDES = {
    aai: ['aa', 'i'], aau: ['aa', 'u'], ai: ['a', 'i'], au: ['a', 'u'],
    ei: ['e', 'i'], iu: ['i', 'u'], oi: ['o', 'i'], ou: ['o', 'u'],
    ui: ['u', 'i'], eoi: ['eo', 'yu'],
  };
  function playFinal(id) {
    const c = getCtx(); if (!c) return false;
    if (id === 'm' || id === 'ng') {
      return voicedSegs([{ f: NAS[id], t: 0 }], 0.55, { f0: 116, f0e: 110, gain: 0.4 });
    }
    let v = id, nasal = null, stop = null;
    if (/ng$/.test(id) && id !== 'ng') { nasal = 'ng'; v = id.slice(0, -2); }
    else if (/m$/.test(id) && id !== 'm') { nasal = 'm'; v = id.slice(0, -1); }
    else if (/[ptk]$/.test(id)) { stop = id.slice(-1); v = id.slice(0, -1); }
    const isGlide = GLIDES[v];
    const vDur = stop ? 0.28 : isGlide ? 0.5 : 0.62;
    const segs = [];
    if (isGlide) {
      segs.push({ f: V[GLIDES[v][0]], t: 0 });
      segs.push({ f: V[GLIDES[v][1]], t: vDur - 0.14 });
    } else {
      segs.push({ f: V[v] || V.aa, t: 0 });
    }
    if (nasal) {
      segs.push({ f: NAS[nasal], t: vDur + 0.24 });
      return voicedSegs(segs, vDur + 0.5, { f0: 122, f0e: 108 });
    }
    if (stop) {
      const ok = voicedSegs(segs, vDur, { f0: 124, f0e: 112 });
      noiseSeg(c.currentTime + 0.02 + vDur, 0.02, { bp: BURST[stop], gain: 0.42 });
      return ok;
    }
    return voicedSegs(segs, vDur, { f0: 124, f0e: 106 });
  }

  return { playInitial, playFinal, getCtx };
})();
