/* Fetch complete Cantonese syllables, not concatenated international IPA samples. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const lessons = require('../js/phonetic-lessons.js');
const { configureProxy, getOnce } = require('./fetch-ipa.js');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'media', 'pronunciation');
const source = 'https://jyutping.org/audio/';
const repository = 'https://github.com/CanCLID/jyutping.org';

const valid = buf => buf.length > 1000 && (buf.subarray(0, 3).toString() === 'ID3' ||
  (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

async function request(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await getOnce(url); } catch (error) { last = error; }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw last;
}

async function main() {
  if (!await configureProxy(process.argv.slice(2))) return;
  const data = vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8') +
    '\n({ INITIALS, FINAL_GROUPS, CHAR_BANK, BLEND_WORDS, HUDU, ALONE });');
  const needed = new Set([...Object.values(lessons.initials), ...Object.values(lessons.finals)]);
  const examples = [...data.INITIALS, ...data.FINAL_GROUPS.flatMap(g => g.finals)].flatMap(v => v.examples);
  for (const e of [...examples, ...data.CHAR_BANK, ...Object.values(data.HUDU), ...Object.values(data.ALONE)]) needed.add(e.j);
  for (const word of data.BLEND_WORDS) word.j.forEach(s => needed.add(s));
  fs.mkdirSync(dir, { recursive: true });
  const creditPath = path.join(dir, 'CREDITS.json');
  const credits = fs.existsSync(creditPath) ? JSON.parse(fs.readFileSync(creditPath, 'utf8')) : {
    source: 'https://jyutping.org/jyutping/', repository,
    licenseSource: repository + '/blob/master/LICENSE', files: {},
  };
  // Preserve the repository's actual license notice alongside the copied assets.
  if (!fs.existsSync(path.join(dir, 'LICENSE.txt'))) {
    const license = JSON.parse(await request('https://api.github.com/repos/CanCLID/jyutping.org/contents/LICENSE'));
    fs.writeFileSync(path.join(dir, 'LICENSE.txt'), Buffer.from(license.content, 'base64'));
  }
  const files = {}, missing = [];
  const queue = [...needed].sort();
  function save() {
    fs.writeFileSync(creditPath, JSON.stringify(credits, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'js', 'pronunciation-map.js'),
      '/* Complete Cantonese syllables; see media/pronunciation/CREDITS.json. */\n' +
      'const PRONUNCIATION_FILES = ' + JSON.stringify(Object.fromEntries(Object.entries(files).sort())) + ';\n');
  }
  async function worker() {
    while (queue.length) {
      const syllable = queue.shift();
      if (!/^[a-z]+[1-6]$/.test(syllable)) throw new Error('Invalid syllable: ' + syllable);
      const name = syllable + '.mp3', target = path.join(dir, name);
      if (fs.existsSync(target)) {
        const buf = fs.readFileSync(target);
        if (valid(buf) && credits.files[syllable]?.sha256 === sha256(buf)) {
          files[syllable] = name;
          continue;
        }
      }
      try {
        const url = source + name;
        const buf = await request(url);
        if (!valid(buf)) throw new Error('Response is not MP3 audio');
        fs.writeFileSync(target, buf);
        files[syllable] = name;
        credits.files[syllable] = { file: name, url, sha256: sha256(buf), retrievedAt: new Date().toISOString() };
        save();
        console.log('OK', syllable);
      } catch (error) {
        missing.push(syllable);
        console.error('MISSING', syllable, error.message);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  save();
  console.log('Downloaded:', Object.keys(files).length, 'Missing:', missing.join(', ') || 'none');
  if (missing.length) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
