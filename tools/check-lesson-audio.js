/* Compare local teaching recordings with the published source; this is not a listening review. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lessons = require('../js/phonetic-lessons');
const { configureProxy, getOnce } = require('./fetch-ipa');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  if (!await configureProxy(process.argv.slice(2))) return;
  const queue = [...new Set(Object.values(lessons.finals))];
  const count = queue.length, failures = [];
  async function worker() {
    while (queue.length) {
      const syllable = queue.shift();
      try {
        const remote = await getOnce('https://jyutping.org/audio/' + syllable + '.mp3');
        const local = fs.readFileSync(path.join(__dirname, '../media/pronunciation', syllable + '.mp3'));
        if (sha256(local) !== sha256(remote)) throw Error('source hash mismatch');
      } catch (error) { failures.push(syllable + ': ' + error.message); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`${count - failures.length}/${count} final example recordings match the online source byte for byte.`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
