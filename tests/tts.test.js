const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function fixture(initial = []) {
  let voices = initial, poll;
  const statuses = [], spoken = [];
  const synth = { getVoices: () => voices, speak: u => spoken.push(u) };
  const tts = vm.runInNewContext(read('js/tts.js') + ';TTS', {
    window: { speechSynthesis: synth }, speechSynthesis: synth,
    SpeechSynthesisUtterance: function(text) { this.text = text; },
    setInterval: cb => { poll = cb; return 1; }, clearInterval() {},
  });
  tts.init((...status) => statuses.push(status));
  return { tts, synth, statuses, spoken, poll: () => poll(), setVoices: v => { voices = v; } };
}

test('empty or Mandarin-only mobile voice lists cannot speak Cantonese', () => {
  const f = fixture();
  assert.equal(f.statuses.at(-1)[0], 'bad');
  assert.equal(f.tts.speak('你好'), false);
  f.setVoices([{ lang: 'zh-CN', name: 'Mandarin', voiceURI: 'mandarin' }]);
  f.poll();
  assert.equal(f.tts.hasVoice, false);
  assert.equal(f.spoken.length, 0);
});

test('late Cantonese voices include script tags and retain the selected voice', () => {
  const f = fixture();
  f.setVoices([
    { lang: 'yue-HK', name: 'Cantonese Natural', voiceURI: 'a' },
    { lang: 'zh_Hant_HK', name: 'Hong Kong', voiceURI: 'b' },
  ]);
  f.synth.onvoiceschanged();
  assert.equal(f.tts.cantoVoices.length, 2);
  assert.equal(f.tts.setVoice('b'), true);
  f.poll();
  assert.equal(f.tts.voice.voiceURI, 'b');
  assert.equal(f.tts.speak('你好'), true);
  assert.equal(f.spoken[0].voice.voiceURI, 'b');
  f.setVoices([]);
  f.synth.onvoiceschanged();
  assert.equal(f.tts.hasVoice, false);
  assert.equal(f.statuses.at(-1)[0], 'bad');
});

test('both recording sources have enough tone questions covering all six tones', () => {
  const questions = vm.runInNewContext(read('js/data.js') + ';QUIZ.tone');
  for (const [index, symbol, directory] of [
    ['js/pronunciation-map.js', 'PRONUNCIATION_FILES', 'media/pronunciation'],
    ['js/unified-voice-map.js', 'UNIFIED_VOICE_FILES', 'media/voice-cuhk'],
  ]) {
    const files = vm.runInNewContext(read(index) + ';' + symbol);
    const playable = questions.filter(q => Object.hasOwn(files, q.j));
    assert(playable.length >= 10);
    assert.deepEqual([...new Set(playable.map(q => q.t))].sort(), [1, 2, 3, 4, 5, 6]);
    for (const q of playable) assert(fs.existsSync(path.join(root, directory, files[q.j])), q.j);
  }
});
