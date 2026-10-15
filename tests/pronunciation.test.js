const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const lessons = require('../js/phonetic-lessons.js');
const files = vm.runInNewContext(read('js/pronunciation-map.js') + '\nPRONUNCIATION_FILES');
const phonemes = vm.runInNewContext(read('js/phoneme-map.js') + '\nPHONEME_FILES');
const data = vm.runInNewContext(read('js/data.js') + '\n({INITIALS, FINAL_GROUPS, CHAR_BANK, BLEND_WORDS})');
const finals = data.FINAL_GROUPS.flatMap(g => g.finals);
const initial = s => /^(gw|kw|ng|[bpmfdtnlgkhzcsjw])/.exec(s)?.[0] || '';
const final = s => ['m', 'ng'].includes(s.slice(0, -1)) ? s.slice(0, -1) : s.slice(initial(s).length, -1);

test('all 19 initials and 55 teaching items have matching Cantonese syllables', () => {
  assert.equal(data.INITIALS.length, 19);
  assert.equal(finals.length, 55);
  assert.deepEqual(Object.keys(lessons.initials).sort(), [...data.INITIALS.map(i => i.id)].sort());
  assert.deepEqual(Object.keys(lessons.finals).sort(), [...finals.map(f => f.id)].sort());
  for (const [id, syllable] of Object.entries(lessons.initials)) {
    assert.equal(initial(syllable), id);
    assert.equal(final(syllable), 'aa');
    assert(files[syllable], syllable);
  }
  for (const f of finals) {
    const syllable = lessons.finals[f.id];
    assert(files[syllable], syllable);
    if (!f.onlyCompound) assert.equal(final(syllable), f.id);
  }
  assert.equal(lessons.finals.a, 'sam1');
  assert.equal(lessons.finals.eo, 'ceot1');
  for (const f of finals) assert(f.examples.some(e => e.j === lessons.finals[f.id]), 'teaching syllable must have a named example: ' + f.id);
});

test('lesson examples and spelling targets have exact local recordings and correct categories', () => {
  for (const i of data.INITIALS) for (const e of i.examples) {
    assert.equal(initial(e.j), i.id, e.c + e.j);
    assert(files[e.j], e.j);
  }
  for (const f of finals) for (const e of f.examples) {
    if (!f.onlyCompound) assert.equal(final(e.j), f.id, e.c + e.j);
    assert(files[e.j], e.j);
  }
  for (const e of data.CHAR_BANK) assert(files[e.j], e.j);
  for (const w of data.BLEND_WORDS) for (const s of w.j) assert(files[s], s);
});

test('all indexed MP3 assets match their provenance hashes', () => {
  const credits = JSON.parse(read('media/pronunciation/CREDITS.json'));
  for (const [syllable, file] of Object.entries(files)) {
    assert.equal(file, syllable + '.mp3');
    const buf = fs.readFileSync(path.join(root, 'media/pronunciation', file));
    assert(buf.length > 1000);
    assert(buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 255 && (buf[1] & 224) === 224));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), credits.files[syllable].sha256);
  }
});

function playerFixture() {
  const sounds = [];
  class Audio {
    constructor(src) { this.src = src; this.paused = false; this.plays = 0; sounds.push(this); }
    play() { this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const player = vm.runInNewContext(read('js/pronunciation.js') + '\nPRONUNCIATION', {
    Audio, PRONUNCIATION_FILES: files, PHONEME_FILES: phonemes, PHONETIC_LESSONS: lessons, setTimeout, clearTimeout,
  });
  return { player, sounds };
}

test('final teaching playback uses the original complete recording exactly once', async () => {
  const { player, sounds } = playerFixture();
  const promise = player.play(['final-example:im']);
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0].src, 'media/pronunciation/gim3.mp3');
  assert.equal(sounds[0].plays, 1);
  sounds[0].onended();
  assert.equal(await promise, true);
});

test('all base sounds are distinct clips with traceable boundaries and non-silent PCM', () => {
  const { pcm8 } = require('../tools/build-phonemes');
  const credits = JSON.parse(read('media/phonemes/CREDITS.json'));
  const expected = [...data.INITIALS.map(i => 'initials:' + i.id), ...finals.map(f => 'finals:' + f.id)];
  assert.equal(expected.length, 74);
  assert.deepEqual(Object.keys(phonemes).sort(), expected.sort());
  for (const key of expected) {
    const data = fs.readFileSync(path.join(root, 'media/phonemes', phonemes[key]));
    const parsed = pcm8(data), credit = credits.files[key];
    assert(credit.end > credit.start, key);
    assert(parsed.data.some(n => Math.abs(n) > .01), key);
    assert(Math.abs(parsed.data.length / parsed.rate - (credit.end - credit.start + .2)) < .001, key);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), credit.sha256);
  }
  for (const id of ['ei','im','ing']) assert.equal(credits.files['finals:' + id].syllable, 'finals/' + id);
});

test('the player can still resolve an archived isolated final clip', async () => {
  const {player,sounds} = playerFixture();
  const promise = player.play(['finals:ei']);
  assert.equal(sounds.length,1);
  assert.equal(sounds[0].src,'media/phonemes/finals/ei.wav');
  sounds[0].onended();
  assert.equal(await promise,true);
});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('one lesson click plays one full recording once and preserves pitch', async () => {
  const { player, sounds } = playerFixture();
  const done = player.play('aai1', { rate: 0.6 });
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0].plays, 1);
  assert.equal(sounds[0].playbackRate, 0.6);
  assert.equal(sounds[0].preservesPitch, true);
  sounds[0].onended();
  assert.equal(await done, true);
  assert.equal(sounds.length, 1);
});

test('switching cancels old audio and ignores a late ended callback', async () => {
  const { player, sounds } = playerFixture();
  const old = player.play(['aa1', 'aai1']);
  const oldEnded = sounds[0].onended;
  const current = player.play('baa1');
  assert(sounds[0].paused);
  assert.equal(await old, false);
  oldEnded();
  await tick();
  assert.equal(sounds.length, 2);
  assert(sounds[1].src.endsWith('baa1.mp3'));
  sounds[1].onended();
  assert.equal(await current, true);
});

test('stop during a sequence gap cancels the next syllable', async () => {
  const { player, sounds } = playerFixture();
  const done = player.play(['aa1', 'aai1'], { gapMs: 25 });
  sounds[0].onended();
  await tick();
  player.stop();
  assert.equal(await done, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sounds.length, 1);
});

test('missing or broken recordings report failure without substituting another sound', async () => {
  const { player, sounds } = playerFixture();
  let errors = 0;
  assert.equal(await player.play('nonexistent1', { onError: () => errors++ }), false);
  assert.equal(sounds.length, 0);
  const done = player.play('aa1', { onError: () => errors++ });
  sounds[0].onerror();
  assert.equal(await done, false);
  assert.equal(errors, 2);
});

test('TTS refuses to substitute a Mandarin voice for Cantonese', () => {
  let spoken = 0;
  const synthesis = { getVoices: () => [{ name: 'Mandarin', lang: 'zh-CN' }], speak: () => spoken++, cancel() {} };
  const tts = vm.runInNewContext(read('js/tts.js') + '\nTTS', {
    window: { speechSynthesis: synthesis }, speechSynthesis: synthesis,
    SpeechSynthesisUtterance: class {}, setInterval: () => 1, clearInterval() {},
  });
  tts.init();
  assert.equal(tts.hasVoice, false);
  assert.equal(tts.speak('你好'), false);
  assert.equal(tts.speakSeq(['你', '好']), false);
  assert.equal(tts.speakLoop(['你好']), false);
  assert.equal(spoken, 0);
});

test('poem recordings reuse one audio element and preserve the supplied reading', async () => {
  const { player, sounds } = playerFixture();
  const gaps = [];
  const done = player.play(['aa1', 'geoi2'], { online: true, gapMs: i => { gaps.push(i); return 0; } });
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0].src, 'media/pronunciation/aa1.mp3');
  sounds[0].onended();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0].src, 'https://www.yueyumao.com/wav/geoi2.mp3');
  assert.equal(sounds[0].plays, 2);
  sounds[0].onended();
  assert.equal(await done, true);
  assert.equal(gaps[0], 0);
});

test('poem online failure identifies the missing syllable and does not skip it', async () => {
  const { player, sounds } = playerFixture();
  let error = '';
  const done = player.play(['geoi2', 'aa1'], { online: true, onError: message => { error = message; } });
  sounds[0].onerror();
  assert.equal(await done, false);
  assert(error.includes('geoi2'));
  assert.equal(sounds[0].plays, 1);
  assert.equal(await player.play('../bad', { online: true }), false);
});

test('stopping a poem during a gap prevents the next online recording', async () => {
  const { player, sounds } = playerFixture();
  const done = player.play(['aa1', 'geoi2'], { online: true, gapMs: 25 });
  sounds[0].onended();
  await tick();
  player.stop();
  assert.equal(await done, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sounds[0].plays, 1);
});
