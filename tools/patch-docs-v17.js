/* v1.7 文档补丁 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let d = fs.readFileSync(path.join(ROOT, '需求分析.md'), 'utf8');
d = d.replace('| 版本 | v1.6 |', '| 版本 | v1.7 |');
d = d.replace('> **v1.6 变更摘要**',
'> **v1.7 变更摘要**：① 声母/韵母「本音」升级为三层音源：真人 IPA 录音（media/ipa/*.ogg，tools/fetch-ipa.js 一键从 Wikimedia Commons 下载，CC 授权并附 CREDITS.json）优先 → 合成引擎 v2.1（声门脉冲波源，音质显著改善）兜底 → 真人对照字 TTS；修复"本音按钮双喇叭"缺陷；② 歌词自动加载三源：mp3 内嵌 ID3 → 同名 .txt/.lrc（media/songs/ 或 media/lyrics/，与歌名同名即自动"📄 歌词教学"）；③ 新增 MP3 帧级无损剪辑导出（✂️ 导出AB段：浏览器内解析 MPEG1 Layer3 帧头，按 A/B 点切割下载，CBR 精确/VBR 近似；采样级精确与淡入淡出需重编码，列入 v1.8 用 ffmpeg.wasm 方案）。\n> **v1.6 变更摘要**');
if (!d.includes('| v1.7 |')) {
  d = d.replace('| v1.6 | synth v2 修复"全是a"；歌曲页改版（工作台+本地列表+曲库156+直链）；语音男女声标注与试听；播放预热优化；日常用语 174 条 | ✅ 已交付 |',
  '| v1.6 | synth v2 修复"全是a"；歌曲页改版（工作台+本地列表+曲库156+直链）；语音男女声标注与试听；播放预热优化；日常用语 174 条 | ✅ 已交付 |\n| v1.7 | 本音三层音源（真人IPA优先+合成v2.1+TTS对照）；双喇叭修复；歌词同名txt/lrc自动加载；MP3帧级剪辑导出 | ✅ 已交付 |');
}
d = d.replace('├── media/           ← v1.2 本地音频（可选）：songs/、poems/、manifest.json（教学段配置）',
'├── media/           ← 本地资源：songs/（mp3+同名.txt歌词）、lyrics/、poems/、ipa/（真人IPA录音，CC）、manifest.json');
const oldRow = d.match(/\| 挂自己的歌曲\/诗歌音频 \|[^\n]+\|/);
if (oldRow) {
  d = d.replace(oldRow[0],
  '| 挂自己的歌曲/诗歌音频 | mp3 放 `media/songs/歌名.mp3`；歌词放同名 `.txt`/`.lrc` 于 media/songs/ 或 media/lyrics/ | 全部自动识别加载；教学段改 `media/manifest.json` |\n| 获取真人IPA录音 | 终端运行 `node tools/fetch-ipa.js`（需可访问 wikimedia.org） | 约 25 个 ogg 自动入 media/ipa/（CC 授权附 CREDITS.json）；此后本音按钮自动优先真人录音 |');
}
fs.writeFileSync(path.join(ROOT, '需求分析.md'), d);

let r = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
r = r.replace('## 发音准确性',
'## 真人 IPA 录音（强烈推荐）\n\n让声母/韵母「本音」变成真人语音学录音：在能访问 wikimedia.org 的网络下运行一次\n\n```bash\nnode tools/fetch-ipa.js\n```\n\n约 25 个 ogg 自动下载到 `media/ipa/`（CC 授权，凭据见 CREDITS.json），此后所有"本音"按钮优先播放真人录音，合成音自动降为兜底。\n\n## 发音准确性');
r = r.replace('| 🎤 歌曲解析教学 |', '| 🎤 歌曲解析教学 |');
fs.writeFileSync(path.join(ROOT, 'README.md'), r);
console.log('docs v1.7 OK');
