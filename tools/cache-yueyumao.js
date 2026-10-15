const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAudioCache } = require('./yueyumao-audio');
const root = path.resolve(__dirname, '..');

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--poems') throw new Error('用法：node tools/cache-yueyumao.js --poems');
  const context = vm.createContext({});
  for (const file of ['data', 'poems-curriculum', 'poems-curriculum2', 'pronunciation-map', 'unified-voice-map']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file + '.js'), 'utf8'), context);
  }
  const syllables = vm.runInContext(`[...new Set(POEMS.flatMap(poem => poem.lines.flatMap(line => line.j.trim().split(/\\s+/))))]
    .filter(syllable => !Object.hasOwn(PRONUNCIATION_FILES, syllable) && !Object.hasOwn(UNIFIED_VOICE_FILES, syllable)).sort()`, context);
  const cache = createAudioCache(path.join(root, 'media', 'yueyumao'));
  let completed = 0, downloaded = 0, cached = 0;
  const failures = [];
  const queue = [...syllables];
  console.log('诗词缺项字音：' + queue.length + ' 个；2 路下载，支持断点续跑。');
  async function worker() {
    while (queue.length) {
      const syllable = queue.shift();
      try {
        const result = await cache('/wav/' + syllable + '.mp3');
        if (result.cached) cached++; else downloaded++;
      } catch (error) { failures.push({ syllable, error: error.message }); }
      completed++;
      if (completed % 50 === 0 || completed === syllables.length) console.log(`${completed}/${syllables.length}：新下载 ${downloaded}，已缓存 ${cached}，失败 ${failures.length}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  await Promise.all([worker(), worker()]);
  console.log(JSON.stringify({ downloaded, cached, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
