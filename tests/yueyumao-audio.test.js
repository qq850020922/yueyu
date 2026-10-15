const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { audioPath, createAudioCache } = require('../tools/yueyumao-audio');
const { createSource } = require('../tools/yueyumao-source');
const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(256)]);

test('audio cache accepts only fixed MP3 paths and prevents traversal and Windows alternate streams', () => {
  assert.equal(audioPath('/wav/nei5.mp3'), '/wav/nei5.mp3');
  assert.equal(audioPath('/voice/liju/' + encodeURIComponent('你好') + '.mp3'), '/voice/liju/你好.mp3');
  for (const invalid of ['https://evil.example/a.mp3', '/wav/../a.mp3', '/wav/%2e%2e%2fa.mp3', '/wav/%252e%252e.mp3', '/wav/a:secret.mp3', '/wav/a\\b.mp3', '/wav/a.mp3?q=1', '/server.js', null]) {
    assert.throws(() => audioPath(invalid));
  }
});

test('saved audio survives a new cache instance without contacting the source', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ygt-audio-'));
  let calls = 0;
  const cache = createAudioCache(directory, async () => { calls++; return new Response(mp3); });
  const [first, concurrent] = await Promise.all([cache('/wav/nei5.mp3'), cache('/wav/nei5.mp3')]);
  assert.equal(calls, 1);
  assert.equal(first.target, concurrent.target);
  assert.deepEqual(await fs.readFile(first.target), mp3);
  const metadata = JSON.parse(await fs.readFile(first.target + '.json', 'utf8'));
  assert.equal(metadata.source, 'https://www.yueyumao.com/wav/nei5.mp3');
  assert.equal(metadata.sha256.length, 64);
  const offline = createAudioCache(directory, async () => { throw Error('offline'); });
  assert.equal((await offline('/wav/nei5.mp3')).cached, true);
});

test('failed downloads leave no MP3 and can retry', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ygt-audio-'));
  let fail = true;
  const cache = createAudioCache(directory, async () => new Response(fail ? '<html>Error</html>' : mp3));
  await assert.rejects(cache('/wav/ji4.mp3'));
  await assert.rejects(fs.access(path.join(directory, 'wav', 'ji4.mp3')));
  fail = false;
  assert.equal((await cache('/wav/ji4.mp3')).cached, false);
});

test('visited catalogue pages load from disk after restart with no source connection', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ygt-pages-'));
  const source = createSource(async () => new Response('<p>你好</p>', { headers: { 'Content-Type': 'text/html' } }), { directory });
  const first = await source(new URLSearchParams({ type: 'daily' }));
  const offline = createSource(async () => { throw Error('offline'); }, { directory });
  assert.deepEqual(await offline(new URLSearchParams({ type: 'daily' })), first);
});

test('missing dictionary syllables use the exact lesson-source syllable with provenance', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ygt-audio-'));
  const urls = [];
  const cache = createAudioCache(directory, async url => {
    urls.push(url);
    return urls.length === 1 ? new Response('missing', { status: 404 }) : new Response(mp3);
  });
  const result = await cache('/wav/bak3.mp3');
  assert.deepEqual(urls, ['https://www.yueyumao.com/wav/bak3.mp3', 'https://jyutping.org/audio/bak3.mp3']);
  assert.equal(JSON.parse(await fs.readFile(result.target + '.json', 'utf8')).source, urls[1]);
});
