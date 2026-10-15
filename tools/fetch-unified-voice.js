/* CUHK teaching recordings, attributed to Chan King Ying on the source page.
   No redistribution license is asserted. Keep source attribution with local copies. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'media', 'voice-cuhk');
const origin = 'https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/';
async function main() {
  fs.mkdirSync(dir, { recursive:true });
  const original = vm.runInNewContext(fs.readFileSync(path.join(root, 'js/pronunciation-map.js'), 'utf8') + '; PRONUNCIATION_FILES');
  const lessons = require('../js/phonetic-lessons.js');
  const segments = require('./phonetic-segments.json');
  const queue = [...new Set([...Object.keys(original), ...Object.values(lessons.finals), ...Object.values(segments).flatMap(items => Object.values(items).map(s => s[0]))])].filter(s => /^[a-z]+[1-6]$/.test(s));
  const files = {}, unavailable = [], credits = { source:origin + 'main.php', speaker:'陳京英（来源网页致谢）', license:'Source does not specify a redistribution license. Local study copies.', files:{} };
  async function worker() {
    while (queue.length) {
      const s = queue.shift(), name = s + '.wav', target = path.join(dir, name), url = origin + 'sound/' + name;
      let data;
      try {
        if (fs.existsSync(target)) data = fs.readFileSync(target);
        else {
          const response = await fetch(url, { signal:AbortSignal.timeout(20000) });
          if (response.status === 404) { unavailable.push(s); continue; }
          if (!response.ok) throw Error('HTTP ' + response.status);
          data = Buffer.from(await response.arrayBuffer());
        }
        if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid WAV');
        fs.writeFileSync(target, data); files[s] = name;
        credits.files[s] = { url, sha256:crypto.createHash('sha256').update(data).digest('hex') };
      } catch (error) { unavailable.push(s); console.error(s, error.message); }
    }
  }
  await Promise.all(Array.from({ length:6 }, worker));
  credits.unavailable = unavailable.sort();
  fs.writeFileSync(path.join(dir, 'CREDITS.json'), JSON.stringify(credits, null, 2));
  fs.writeFileSync(path.join(root, 'js/unified-voice-map.js'), '/* See media/voice-cuhk/CREDITS.json. */\nconst UNIFIED_VOICE_FILES = ' + JSON.stringify(files) + ';\n');
  const missingLessons = [...Object.values(lessons.initials), ...Object.values(lessons.finals)].filter(s => !files[s]);
  console.log(JSON.stringify({ downloaded:Object.keys(files).length, unavailable, missingLessons }));
  if (missingLessons.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
