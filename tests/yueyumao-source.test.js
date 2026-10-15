const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceURL, createSource } = require('../tools/yueyumao-source');
const params = object => new URLSearchParams(object);

test('source requests only construct supported category, search and detail URLs', () => {
  assert.equal(sourceURL(params({ type: 'daily' })), 'https://www.yueyumao.com/category-2.html');
  assert.equal(sourceURL(params({ type: 'words', page: 2 })), 'https://www.yueyumao.com/category-3_2.html');
  assert.equal(sourceURL(params({ type: 'detail', id: 16642 })), 'https://www.yueyumao.com/post/16642.html');
  const search = new URL(sourceURL(params({ type: 'search', q: '你好 & 粤语', page: 2 })));
  assert.equal(search.searchParams.get('q'), '你好 & 粤语');
  assert.equal(search.searchParams.get('page'), '2');
  for (const invalid of [
    { type: '__proto__' }, { type: 'https://example.com' }, { type: 'detail', id: '../server.js' },
    { type: 'daily', page: '-1' }, { type: 'daily', page: '1.5' }, { type: 'daily', page: '10000' },
    { type: 'search', q: '' }, { type: 'search', q: '字'.repeat(81) },
  ]) assert.throws(() => sourceURL(params(invalid)));
});

test('simultaneous and subsequent requests reuse the bounded source cache', async () => {
  let calls = 0;
  const source = createSource(async () => { calls++; return new Response('<p>内容</p>', { headers: { 'Content-Type': 'text/html' } }); });
  const results = await Promise.all([source(params({ type: 'daily' })), source(params({ type: 'daily' }))]);
  assert.equal(results[0].html, '<p>内容</p>');
  assert.deepEqual(results[0], results[1]);
  await source(params({ type: 'daily' }));
  assert.equal(calls, 1);
  for (let page = 2; page <= 50; page++) await source(params({ type: 'daily', page }));
  await source(params({ type: 'daily' }));
  assert.equal(calls, 51);
});

test('invalid requests never contact the source and failed requests can retry', async () => {
  let calls = 0;
  const source = createSource(async () => {
    calls++;
    return new Response('html', { status: calls === 1 ? 503 : 200, headers: { 'Content-Type': 'text/html' } });
  });
  await assert.rejects(source(params({ type: 'detail', id: 'invalid' })), error => error.status === 400);
  assert.equal(calls, 0);
  await assert.rejects(source(params({ type: 'words' })));
  assert.equal((await source(params({ type: 'words' }))).html, 'html');
  assert.equal(calls, 2);
});

test('source rejects non-HTML and oversized responses', async () => {
  for (const response of [
    new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'text/html' } }),
  ]) {
    const source = createSource(async () => response);
    await assert.rejects(source(params({ type: 'daily' })));
  }
});

test('only four distinct source requests run concurrently', async () => {
  const release = [];
  const source = createSource(() => new Promise(resolve => release.push(() => resolve(new Response('html', { headers: { 'Content-Type': 'text/html' } })))));
  const pending = [1, 2, 3, 4].map(page => source(params({ type: 'daily', page })));
  await assert.rejects(source(params({ type: 'daily', page: 5 })), error => error.status === 429);
  release.forEach(done => done());
  await Promise.all(pending);
});
