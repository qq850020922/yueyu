/* 从 Wikimedia Commons 下载 IPA 发音录音（CC 授权）→ media/ipa/
   生成 js/ipa-map.js 供网页播放；凭据写入 media/ipa/CREDITS.json */
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'media', 'ipa');

const API = 'https://commons.wikimedia.org/w/api.php';
let proxy = '';
async function configureProxy(args) {
  if (args.includes('--help')) {
    console.log('node tools/fetch-ipa.js [--proxy http://127.0.0.1:PORT | --direct] [--check]');
    return false;
  }
  const index = args.indexOf('--proxy');
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('--proxy requires a URL');
  if (index >= 0 && args.includes('--direct')) throw new Error('Choose --proxy or --direct');
  proxy = args.includes('--direct') ? '' : index >= 0 ? args[index + 1] :
    process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
  if (!proxy && !args.includes('--direct') && process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { windowsHide: true });
      if (/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(stdout)) {
        const setting = stdout.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1].trim();
        const address = setting?.includes('=') ? setting.match(/(?:^|;)https=([^;]+)/i)?.[1] : setting;
        if (address) proxy = address.includes('://') ? address : 'http://' + address;
      }
    } catch (_) { /* Explicit arguments remain available without registry access. */ }
  }
  if (proxy) {
    const parsed = new URL(proxy);
    if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(parsed.protocol)) throw new Error('Unsupported proxy protocol');
    console.log('Proxy:', parsed.protocol + '//' + parsed.host);
  } else {
    console.log('Direct connection. For a local proxy, use --proxy http://127.0.0.1:PORT');
  }
  return true;
}
async function getOnce(url) {
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'curl.exe' : 'curl',
      ['--disable', '--silent', '--show-error', '--fail', '--location', '--max-redirs', '5',
        '--connect-timeout', '8', '--max-time', '45', '--proto', '=https', '--proto-redir', '=https',
        '--user-agent', 'CantoneseStudyIPA/1.0 (educational audio downloader)',
        '--proxy', proxy, '--noproxy', '', '--url', url],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 50000, windowsHide: true });
    return stdout;
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'curl is required (included in modern Windows).' :
      e.stderr?.toString('utf8').trim() || String(e.code || e.message));
  }
}
async function get(url) {
  for (let i = 0; i < 4; i++) {
    try { return await getOnce(url); }
    catch (e) {
      if (i === 3) throw new Error('下载失败: ' + url + '\n' + e.message);
      console.log('  重试', i + 1, e.message);
      await new Promise(r => setTimeout(r, /429/.test(e.message) ? 5000 * (i + 1) : 1200 * (i + 1)));
    }
  }
  throw new Error('下载失败: ' + url);
}
async function fileInfo(title) {
  const u = `${API}?action=query&format=json&redirects=1&prop=videoinfo&vilimit=1&viprop=url%7Cextmetadata%7Cderivatives&titles=${encodeURIComponent('File:' + title)}`;
  const j = JSON.parse((await get(u)).toString('utf8'));
  if (j.error) throw new Error('Wikimedia API: ' + JSON.stringify(j.error));
  const pages = j.query && j.query.pages || {};
  const page = Object.values(pages)[0];
  if (!page || !page.videoinfo) return null;
  const ii = page.videoinfo[0];
  const md = ii.extmetadata || {};
  return {
    url: ii.url.split('?')[0],
    mp3: ii.derivatives?.find(d => d.type === 'audio/mpeg')?.src,
    license: (md.LicenseShortName && md.LicenseShortName.value) || '',
    artist: (md.Artist && md.Artist.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 80),
    src: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(title.replace(/ /g, '_')),
  };
}

/* 键=本站音标id；候选=Commons 文件名（依次尝试） */
const WANT = {
  // 声母
  b: ['voiceless bilabial plosive.ogg'], p: ['Aspirated voiceless bilabial stop.ogg'],
  m: ['bilabial nasal.ogg'], f: ['voiceless labiodental fricative.ogg'],
  d: ['voiceless alveolar plosive.ogg'], t: ['Aspirated voiceless alveolar stop.ogg'],
  n: ['alveolar nasal.ogg'], l: ['alveolar lateral approximant.ogg'],
  g: ['voiceless velar plosive.ogg'], k: ['voiceless velar plosive aspirated.ogg'],
  ng: ['velar nasal.ogg'], h: ['voiceless glottal fricative.ogg'],
  z: ['voiceless alveolar affricate.ogg'], c: ['voiceless alveolar affricate aspirated.ogg'],
  s: ['voiceless alveolar sibilant.ogg', 'voiceless alveolar fricative.ogg'],
  j: ['palatal approximant.ogg'], w: ['voiced labio-velar approximant.ogg'],
  // 单元音韵母
  aa: ['open front unrounded vowel.ogg', 'open central unrounded vowel.ogg'],
  a: ['near-open central vowel.ogg', 'open central unrounded vowel.ogg'],
  e: ['open-mid front unrounded vowel.ogg'],
  i: ['close front unrounded vowel.ogg'],
  o: ['open-mid back rounded vowel.ogg'],
  u: ['close back rounded vowel.ogg'],
  oe: ['open-mid front rounded vowel.ogg'],
  eo: ['close-mid central rounded vowel.ogg'],
  yu: ['close front rounded vowel.ogg'],
};

function saveIndex(got, credits) {
  fs.writeFileSync(path.join(DIR, 'CREDITS.json'), JSON.stringify(credits, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'js', 'ipa-map.js'),
    `/* Wikimedia Commons IPA recordings; see media/ipa/CREDITS.json. */
const IPA_FILES = ${JSON.stringify(got)};
`);
}
async function main(args = process.argv.slice(2)) {
  if (!await configureProxy(args)) return;
  if (args.includes('--check')) {
    const info = await fileInfo(WANT.b[0]);
    if (!info) throw new Error('Test file not found on Commons');
    const { buf } = await downloadAudio(info);
    console.log('OK: Commons API and audio download (' + buf.length + ' bytes)');
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  const got = {}, missing = [];
  const creditPath = path.join(DIR, 'CREDITS.json');
  const credits = fs.existsSync(creditPath) ? JSON.parse(fs.readFileSync(creditPath, 'utf8')) : [];
  for (const id of Object.keys(WANT)) {
    const credit = credits.find(c => c.id === id && WANT[id].includes(c.commons));
    if (!credit) continue;
    const name = path.basename(credit.file);
    const file = path.join(DIR, name);
    if (fs.existsSync(file) && validAudio(fs.readFileSync(file), path.extname(name))) got[id] = name;
  }
  for (const [id, titles] of Object.entries(WANT)) {
    if (got[id]) { console.log('SKIP', id); continue; }
    await new Promise(r => setTimeout(r, 1500));
    let info = null, usedTitle = null;
    for (const t of titles) { info = await fileInfo(t); if (info) { usedTitle = t; break; } }
    if (!info) { missing.push(id + ' (' + titles[0] + ')'); continue; }
    const { buf, extension, url } = await downloadAudio(info);
    const file = id + extension;
    fs.writeFileSync(path.join(DIR, file), buf);
    got[id] = file;
    const oldCredit = credits.findIndex(c => c.id === id);
    if (oldCredit >= 0) credits.splice(oldCredit, 1);
    credits.push({ id, file: 'media/ipa/' + file, commons: usedTitle, license: info.license || 'See source', artist: info.artist || 'See source', source: info.src, download: url });
    saveIndex(got, credits);
    console.log('OK', id, '←', usedTitle, '(' + info.license + ')');
  }
  saveIndex(got, credits);
  console.log('---'); console.log('成功:', Object.keys(got).length, '缺失:', missing.length ? missing.join(', ') : '无');
  if (missing.length) process.exitCode = 1;
}
function validAudio(buf, extension) {
  if (!buf || buf.length < 1000) return false;
  if (extension === '.ogg') return buf.subarray(0, 4).toString() === 'OggS';
  if (extension === '.mp3') return buf.subarray(0, 3).toString() === 'ID3' ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  return false;
}
async function downloadAudio(info) {
  // Prefer the site's playback derivative to reduce load on original-file servers.
  const url = info.mp3 || info.url;
  const extension = info.mp3 ? '.mp3' : '.ogg';
  const buf = await get(url);
  if (!validAudio(buf, extension)) throw new Error('Invalid audio response: ' + url);
  return { buf, extension, url };
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, configureProxy, getOnce };
