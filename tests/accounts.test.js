const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('authenticated progress is isolated and private files cannot be downloaded', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canto-accounts-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true,
    env: { ...process.env, PORT: '0', YGT_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
      child.once('error', reject);
      child.stdout.on('data', chunk => {
        const port = /http:\/\/localhost:(\d+)/.exec(String(chunk))?.[1];
        if (port && port !== '0') { clearTimeout(timer); resolve('http://127.0.0.1:' + port); }
      });
    });
    async function api(url, method = 'GET', body, token) {
      const res = await fetch(base + url, { method, headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}),
      }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json() };
    }
    assert.equal((await api('/api/progress')).status, 401);
    const a = (await api('/api/register', 'POST', { name: 'alpha', pass: 'test-password' })).body;
    const b = (await api('/api/register', 'POST', { name: 'beta', pass: 'test-password' })).body;
    assert(a.token && b.token && a.token !== b.token);
    await Promise.all([
      api('/api/progress', 'POST', { name:'beta', progress:[1,3], stats:{tone:7} }, a.token),
      api('/api/progress', 'POST', { name:'alpha', progress:[2], stats:{pinyin:5} }, b.token),
    ]);
    assert.deepEqual((await api('/api/progress', 'GET', undefined, a.token)).body.progress, [1,3]);
    assert.deepEqual((await api('/api/progress', 'GET', undefined, b.token)).body.progress, [2]);
    assert.deepEqual((await api('/api/progress', 'GET', undefined, a.token)).body.stats, {tone:7,pinyin:0,law:0});
    assert.deepEqual((await api('/api/progress', 'GET', undefined, b.token)).body.stats, {tone:0,pinyin:5,law:0});
    await api('/api/progress', 'POST', { progress:[], stats:{} }, a.token);
    assert.deepEqual((await api('/api/progress', 'GET', undefined, b.token)).body.progress, [2]);
    await api('/api/logout', 'POST', undefined, a.token);
    assert.equal((await api('/api/progress', 'GET', undefined, a.token)).status, 401);
    assert.equal((await api('/api/progress', 'POST', { progress:[90] })).status, 401);
    for (const target of ['/server-data/users.json','/server.js','/js/../server-data/users.json','/js/%2e%2e%5cserver-data/users.json']) {
      assert.equal((await fetch(base + target)).status, 403, target);
    }
    assert.equal((await fetch(base + '/js/app.js')).status, 200);
    assert.equal((await fetch(base + '/media/voice-cuhk/nei5.wav', {headers:{Range:'bytes=0-15'}})).status, 206);
    assert.equal((await api('/api/register', 'POST', {name:'__proto__',pass:'test-password'})).status,409);
  } finally {
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    fs.rmSync(directory, {recursive:true,force:true});
  }
});
