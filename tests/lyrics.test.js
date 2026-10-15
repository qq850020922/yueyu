const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const lyrics = require('../js/lyrics.js');

test('LRC offsets, repeated timestamps, blank boundaries and chronological order', () => {
  const rows = lyrics.parse('[ti:练习]\n[offset:-500]\n[00:03.00][00:06.00]你好\n[00:01.25]学习\n[00:08.00]\n');
  assert.deepEqual(rows, [
    { text:'学习', start:.75, end:2.5 }, { text:'你好', start:2.5, end:5.5 }, { text:'你好', start:5.5, end:7.5 },
  ]);
});
test('plain text does not acquire guessed timing; last LRC row uses audio duration', () => {
  assert.equal(lyrics.range(lyrics.parse('你好')[0], 10), null);
  assert.deepEqual(lyrics.range(lyrics.parse('[00:01]你好')[0], 3), { start:1, end:3 });
  assert.equal(lyrics.range({ start:4, end:2 }, 10), null);
  assert.equal(lyrics.range({ start:1, end:12 }, 10), null);
});
test('UTF-8, UTF-16 and legacy Chinese lyric text', () => {
  assert.equal(lyrics.decode(Buffer.from('你好')), '你好');
  assert.equal(lyrics.decode(Buffer.from([255,254,96,79,125,89])), '你好');
  assert.equal(lyrics.decode(Buffer.from([196,227,186,195])), '你好');
});
function tag(id, payload) {
  const frame = Buffer.alloc(10); frame.write(id); frame.writeUInt32BE(payload.length,4);
  const size = frame.length + payload.length;
  const header = Buffer.from([73,68,51,3,0,0,(size>>21)&127,(size>>14)&127,(size>>7)&127,size&127]);
  return Buffer.concat([header,frame,payload]);
}
test('ID3 USLT and SYLT preserve lyrics and millisecond timestamps', () => {
  assert.equal(lyrics.embedded(tag('USLT', Buffer.concat([Buffer.from([3,101,110,103,0]),Buffer.from('你好\n学习')]))), '你好\n学习');
  const stamp = Buffer.alloc(4); stamp.writeUInt32BE(1250);
  const data = tag('SYLT', Buffer.concat([Buffer.from([3,101,110,103,2,1,0]),Buffer.from('你好\0'),stamp]));
  assert.equal(lyrics.embedded(data), '[0:01.250]你好\n');
  assert.equal(lyrics.embedded(Buffer.from('not an MP3')), null);
});
test('unified corpus covers every initial/final demonstration with valid attributed WAVs', () => {
  const lessons = require('../js/phonetic-lessons.js');
  const files = vm.runInNewContext(fs.readFileSync('js/unified-voice-map.js','utf8') + ';UNIFIED_VOICE_FILES');
  const credits = JSON.parse(fs.readFileSync('media/voice-cuhk/CREDITS.json','utf8'));
  for (const s of [...Object.values(lessons.initials),...Object.values(lessons.finals)]) assert(files[s], s);
  for (const [s, file] of Object.entries(files)) {
    const data = fs.readFileSync('media/voice-cuhk/' + file);
    assert.equal(data.toString('ascii',0,4), 'RIFF');
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), credits.files[s].sha256);
  }
});
