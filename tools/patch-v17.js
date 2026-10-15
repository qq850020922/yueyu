/* v1.7 app.js 补丁：IPA 层 / 歌词 sidecar / MP3 剪辑 / 双喇叭修复 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'js', 'app.js');
let s = fs.readFileSync(F, 'utf8');
const rep = (from, to, label) => {
  if (s.split(from).length !== 2) throw new Error('定位失败: ' + label);
  s = s.replace(from, to);
};

/* 1) IPA 层 + MP3 剪辑（插在 逐句跟唱按钮复位 之前） */
rep("/* ---------- 逐句跟唱按钮复位 ---------- */", `/* ============================================================
   v1.7 · 真人 IPA 录音层（media/ipa/*.ogg 存在时优先于合成音）
   录音获取：终端运行 node tools/fetch-ipa.js（Wikimedia Commons CC 授权）
   ============================================================ */
const IPA_OK = new Set();
async function probeIPA() {
  const ids = ['aa','a','e','i','o','u','oe','eo','yu','m','n','ng','b','p','d','t','g','k','f','h','z','c','s','j','w'];
  for (const id of ids) {
    try { const r = await fetch('media/ipa/' + id + '.ogg', { method: 'HEAD' }); if (r.ok) IPA_OK.add(id); } catch (e) {}
  }
}
let ipaAudio = null;
function playIPAFiles(ids) {
  if (ipaAudio) { try { ipaAudio.pause(); } catch (e) {} }
  let i = 0;
  const next = () => {
    if (i >= ids.length) return;
    const a = new Audio('media/ipa/' + ids[i++] + '.ogg');
    ipaAudio = a; a.onended = () => setTimeout(next, 90);
    a.play().catch(() => {});
  };
  next();
  return true;
}
function initialIPASeq(id) { return IPA_OK.has(id) ? [id] : null; }
function finalIPASeq(fid) {
  if (fid === 'm' || fid === 'ng') return IPA_OK.has(fid) ? [fid] : null;
  let v = fid, nasal = null, stop = null;
  if (/ng$/.test(fid) && fid !== 'ng') { nasal = 'ng'; v = fid.slice(0, -2); }
  else if (/m$/.test(fid) && fid !== 'm') { nasal = 'm'; v = fid.slice(0, -1); }
  else if (/[ptk]$/.test(fid)) { stop = { p: 'b', t: 'd', k: 'g' }[fid.slice(-1)]; v = fid.slice(0, -1); }
  const G = { aai: ['aa','i'], aau: ['aa','u'], ai: ['a','i'], au: ['a','u'], ei: ['e','i'], iu: ['i','u'], oi: ['o','i'], ou: ['o','u'], ui: ['u','i'], eoi: ['eo','yu'] };
  let seq = G[v] ? G[v].slice() : (IPA_OK.has(v) ? [v] : null);
  if (!seq) return null;
  seq = seq.filter(x => IPA_OK.has(x));
  if (seq.length < (G[v] ? 2 : 1)) return null;
  if (nasal) { if (!IPA_OK.has(nasal)) return null; seq.push(nasal); }
  if (stop) { if (!IPA_OK.has(stop)) return null; seq.push(stop); }
  return seq;
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

/* ---------- 逐句跟唱按钮复位 ---------- */`, 'IPA block');

/* 2) 本音按钮 IPA 优先 */
rep(`    if (!SYNTH.playInitial(si.dataset.synthIni)) toast('当前浏览器不支持音频合成');
    return;
  }`, `    const seq = initialIPASeq(si.dataset.synthIni);
    if (seq) playIPAFiles(seq);
    else if (!SYNTH.playInitial(si.dataset.synthIni)) toast('当前浏览器不支持音频合成');
    return;
  }`, 'ini handler');
rep(`    if (!SYNTH.playFinal(sf.dataset.synthFin)) toast('当前浏览器不支持音频合成');
    return;
  }`, `    const seq = finalIPASeq(sf.dataset.synthFin);
    if (seq) playIPAFiles(seq);
    else if (!SYNTH.playFinal(sf.dataset.synthFin)) toast('当前浏览器不支持音频合成');
    return;
  }`, 'fin handler');

/* 3) 双喇叭修复 */
s = s.split('">🔊 本音</button>').join('">本音</button>');

/* 4) 歌词 sidecar（.txt/.lrc 同名文件） */
const oldProbe = s.slice(s.indexOf('      // 自动解析 mp3 内嵌歌词'), s.indexOf('      });', s.indexOf('      // 自动解析 mp3 内嵌歌词')) + 8);
const newProbe = `      // 歌词三源：mp3 内嵌 → 同名 .txt/.lrc（media/songs 或 media/lyrics）
      (async () => {
        let ly = await extractLyrics('media/songs/' + encodeURIComponent(r.file));
        if (!ly) {
          const base = r.file.replace(/\\.[a-z0-9]+$/i, '');
          const nm = SONGS[i].name;
          const cands = [];
          [['media/songs/', base], ['media/songs/', nm], ['media/lyrics/', nm], ['media/lyrics/', base]].forEach(x => {
            cands.push(x[0] + encodeURIComponent(x[1]) + '.txt', x[0] + encodeURIComponent(x[1]) + '.lrc');
          });
          for (const c of cands) {
            try {
              const res = await fetch(c);
              if (!res.ok) continue;
              const text = await res.text();
              const lines = text.split(/\\r?\\n/).map(l => l.replace(/\\[\\d{1,2}:\\d{2}(\\.\\d+)?\\]/g, '').replace(/\\[[^\\]]*\\]/g, '').trim()).filter(l => /[\\u3400-\\u9fff]/.test(l));
              if (lines.length >= 2) { ly = lines; MEDIA.songs[i].lyricsFile = c; break; }
            } catch (e) {}
          }
        }
        MEDIA.songs[i].lyrics = ly;
        const box = document.querySelector('[data-lp="' + i + '"] .lp-box');
        if (box) {
          const b = document.createElement('button');
          b.className = 'btn small'; b.setAttribute('data-lyrics', i);
          b.textContent = ly ? '📄 歌词教学（' + ly.length + '行）' : '📄 歌词教学';
          box.appendChild(b);
        }
      })();`;
rep(oldProbe, newProbe, 'probe lyrics');

/* 5) 歌词按钮指引 + 剪辑按钮处理 */
rep(`    if (m && m.lyrics) useLyrics(m.lyrics, '《' + (SONGS[+lyb.dataset.lyrics] || {}).name + '》内置歌词');
    return;
  }`, `    if (m && m.lyrics) useLyrics(m.lyrics, '《' + (SONGS[+lyb.dataset.lyrics] || {}).name + '》歌词');
    else toast('未找到歌词：把「歌名.txt」放在 media/songs/ 或 media/lyrics/（与 mp3 同名）');
    return;
  }
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
  }`, 'lyrics+cut handler');

/* 6) 播放器加剪辑按钮 */
rep('    ${m.clip ? `<button class="btn small" data-ap="jump:${i}">🎯 教学段 ${fmtTime(m.clip.start)}–${m.clip.end != null ? fmtTime(m.clip.end) : \'尾\'}</button>` : \'\'}',
    '    ${m.clip ? `<button class="btn small" data-ap="jump:${i}">🎯 教学段 ${fmtTime(m.clip.start)}–${m.clip.end != null ? fmtTime(m.clip.end) : \'尾\'}</button>` : \'\'}\n    <button class="btn small" data-cut="${i}">✂️ 导出AB段</button>', 'cut button');

/* 7) boot 挂 probeIPA */
rep('  initAuth();\n  probeMedia();', '  initAuth();\n  probeMedia();\n  probeIPA();', 'boot');

fs.writeFileSync(F, s);
console.log('v1.7 app.js 全部接线 OK');
