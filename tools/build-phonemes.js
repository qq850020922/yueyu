/* Extract continuous speech segments; never construct a final from separate vowels/codas. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const plan = require('./phonetic-segments.json');
function pcm8(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw Error('Not WAV');
  let format, data;
  for (let p = 12; p + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', p, p + 4), size = buffer.readUInt32LE(p + 4);
    if (p + 8 + size > buffer.length) throw Error('Truncated WAV');
    if (id === 'fmt ') format = buffer.subarray(p + 8, p + 8 + size);
    if (id === 'data') data = buffer.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!format || !data || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || ![8,16].includes(format.readUInt16LE(14))) throw Error('Expected mono PCM8/16');
  const width = format.readUInt16LE(14) / 8;
  const samples = Array.from({ length:data.length / width }, (_,i) => width === 1 ? (data[i]-128)/128 : data.readInt16LE(i*2)/32768);
  return { rate:format.readUInt32LE(4), data:samples };
}
function wav16(samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((n, i) => out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, n)) * 32767), 44 + i * 2));
  return out;
}
function build() {
  const index = {}, credits = {
    source:'See each file: independent final recordings, IPA references, and continuous Cantonese recording crops.',
    method:'Continuous crops, boundaries inspected on spectrograms. Not individually audited by a Cantonese teacher.',
    processing:'PCM sources decoded to PCM16; amplitude normalization; <=2ms edge fade; 60ms leading/140ms trailing silence. No vowel/coda concatenation or pitch changes.',
    files:{},
  };
  for (const [kind, entries] of Object.entries(plan)) {
    const dir = path.join(root, 'media', 'phonemes', kind); fs.mkdirSync(dir, { recursive:true });
    for (const [id, [syllable, start, stop]] of Object.entries(entries)) {
      const sourceDir = syllable.includes('/') ? 'phonetic-sources' : 'voice-cuhk';
      const input = fs.readFileSync(path.join(root, 'media', sourceDir, syllable + '.wav'));
      const { rate, data } = pcm8(input);
      const end = stop < 0 ? data.length / rate + stop : stop;
      if (!(start >= 0 && end > start && end <= data.length / rate)) throw Error('Invalid segment: ' + id);
      const crop = data.slice(Math.round(start * rate), Math.round(end * rate));
      const mean = crop.reduce((a,b) => a+b,0) / crop.length;
      const centered = crop.map(n => n - mean), peak = Math.max(...centered.map(Math.abs));
      if (peak < .008) throw Error('No useful signal: ' + id);
      const fade = Math.min(Math.round(rate * .002), Math.floor(crop.length / 8));
      const signal = centered.map((n, i) => n * Math.min(4, .82 / peak) * Math.min(1, i / fade, (crop.length - 1 - i) / fade));
      const output = wav16([...Array(Math.round(rate * .06)).fill(0), ...signal, ...Array(Math.round(rate * .14)).fill(0)], rate);
      const file = kind + '/' + id + '.wav', key = kind + ':' + id;
      fs.writeFileSync(path.join(root, 'media', 'phonemes', file), output); index[key] = file;
      const sourceInfo = JSON.parse(fs.readFileSync(path.join(root, 'media/phonetic-sources/CREDITS.json'), 'utf8'));
      const sourceCredit = syllable.startsWith('ipa/') ? sourceInfo.ipa.find(c => c.id === id) :
        syllable.startsWith('finals/') ? sourceInfo.finals[id] : { source:'https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/sound/' + syllable + '.wav', license:'No redistribution license asserted; local study copy.' };
      credits.files[key] = { ...sourceCredit, file, syllable, start, end,
        sourceSha256:crypto.createHash('sha256').update(input).digest('hex'),
        sha256:crypto.createHash('sha256').update(output).digest('hex'),
      };
    }
  }
  fs.writeFileSync(path.join(root, 'media', 'phonemes', 'CREDITS.json'), JSON.stringify(credits, null, 2));
  fs.writeFileSync(path.join(root, 'js', 'phoneme-map.js'), '/* Continuous native recording crops; see media/phonemes/CREDITS.json. */\nconst PHONEME_FILES = ' + JSON.stringify(index) + ';\n');
  console.log('Built', Object.keys(index).length, 'continuous phonetic practice clips.');
}
if (require.main === module) build();
module.exports = { pcm8, wav16 };
