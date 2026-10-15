const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.YGT_TEST_URL || 'http://localhost:3011';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'yueyumao-browser-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=9237', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;

async function main() {
  let tabs;
  for (let i = 0; i < 60; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:9237/json')).json(); break; }
    catch (_) { await delay(200); }
  }
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { ws.onopen = resolve; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const run = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression, label) => {
    for (let i = 0; i < 100; i++) { if (await run(expression)) return; await delay(200); }
    throw Error('Timed out: ' + label + ': ' + await run("document.querySelector('.page.active')?.textContent"));
  };
  const screenshot = async name => {
    const result = await call('Page.captureScreenshot', { format: 'png' });
    const output = path.join(os.tmpdir(), name);
    fs.writeFileSync(output, Buffer.from(result.data, 'base64'));
    console.log('Screenshot: ' + output);
  };
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [], cancel() {}, speak() { throw Error('Unexpected system speech'); }
    }});
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base });
  await until("!!document.querySelector('[data-page=phrases]')", 'app boot');
  assert.equal(await run("Number(document.querySelector('#rateSlider').value)"), 1);
  await run("document.querySelector('[data-page=phrases]').click()");
  await until("document.querySelectorAll('#dailyOnline .catalog-row').length === 12", 'daily catalogue');
  assert(await run("Number(/\\/ (\\d+) 页/.exec(document.querySelector('#dailyOnline .catalog-summary').textContent)[1]) > 1"));
  assert(await run("document.querySelector('#dailyOnline .catalog-title').textContent.length > 0"));
  await screenshot('yueyumao-desktop.png');
  await run("document.querySelector('#dailyOnline [data-catalog-detail]').click()");
  await until("!!document.querySelector('#dailyOnline .catalog-detail')", 'entry detail');
  assert(await run("document.querySelector('#dailyOnline .catalog-detail h2').textContent.length > 0"));
  await run("document.querySelector('#dailyOnline [data-catalog-play]').click()");
  await until("document.querySelector('#dailyOnline audio')?.currentTime > 0", 'real source audio playing');
  assert(await run("new URL(document.querySelector('#dailyOnline audio').src).pathname === '/api/yueyumao-audio'"));
  await run("document.querySelector('#dailyOnline [data-catalog-rate]').value='0.6';document.querySelector('#dailyOnline [data-catalog-rate]').dispatchEvent(new Event('change'))");
  assert.equal(await run("document.querySelector('#dailyOnline audio').playbackRate"), 0.6);
  await run("document.querySelector('[data-page=vocabulary]').click()");
  assert(await run("document.querySelector('#dailyOnline audio').paused"));
  await until("document.querySelectorAll('#wordsOnline .catalog-row').length === 12", 'word catalogue');
  const first = await run("document.querySelector('#wordsOnline .catalog-title').textContent");
  await run("document.querySelector('#wordsOnline [data-catalog-page=\"2\"]').click()");
  await until("document.querySelector('#wordsOnline .catalog-summary')?.textContent.includes('第 2 /')", 'word pagination');
  assert.notEqual(await run("document.querySelector('#wordsOnline .catalog-title').textContent"), first);
  await run("document.querySelector('#wordsOnline .catalog-pagination input').value='3';document.querySelector('#wordsOnline .catalog-pagination').requestSubmit()");
  await until("document.querySelector('#wordsOnline .catalog-summary')?.textContent.includes('第 3 /')", 'page jump');
  await run("document.querySelector('#wordsOnline .catalog-search input').value='你好';document.querySelector('#wordsOnline .catalog-search').requestSubmit()");
  await until("document.querySelector('#wordsOnline .catalog-summary')?.textContent.includes('全站搜索：你好')", 'upstream search');
  assert(await run("document.querySelectorAll('#wordsOnline .catalog-row').length > 0"));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await run("document.querySelector('#wordsOnline [data-catalog-reset]').click();window.scrollTo(0,0)");
  await until("document.querySelector('#wordsOnline .catalog-summary')?.textContent.includes('粤语词组')", 'reset category');
  assert(await run('document.documentElement.scrollWidth <= window.innerWidth'));
  await screenshot('yueyumao-mobile.png');
  await run("document.querySelector('[data-page=phrases]').click();document.querySelector('[data-phrase-source=local]').click()");
  assert(await run("document.querySelector('#dailyOnline').hidden && !document.querySelector('#phraseLessons').hidden && document.querySelectorAll('#phraseLessons .phrase-item').length > 100"));
  await run("document.querySelector('[data-phrase-source=online]').click()");
  assert(await run("!document.querySelector('#dailyOnline').hidden && document.querySelector('#phraseLessons').hidden"));
  await run(`(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/api/yueyumao')) { window.fetch = original; return new Response(JSON.stringify({error:'模拟音源暂时不可用'}), {status:502}); }
      return original(...args);
    };
    document.querySelector('#dailyOnline [data-catalog-back]').click();
    document.querySelector('#dailyOnline [data-catalog-page="2"]').click();
  })()`);
  await until("!!document.querySelector('#dailyOnline [data-catalog-retry]')", 'source failure');
  await run("document.querySelector('#dailyOnline [data-catalog-retry]').click()");
  await until("document.querySelector('#dailyOnline .catalog-summary')?.textContent.includes('第 2 /')", 'retry');
  const fixture = `<div class="card-body"><span class="zhong">中文：</span><a href="https://evil.example/post/1.html">恶意</a><span class="zhong">粤语：</span><a>恶意</a><audio src="https://evil.example/evil.mp3"></audio></div>`;
  assert.equal(await run(`YUEYU_CATALOG.parseList(${JSON.stringify(fixture)}, 'daily', '').entries.length`), 0);
  assert.equal(await run("YUEYU_CATALOG.safeURL('javascript:alert(1)', 'audio')"), null);
  assert.equal(await run("YUEYU_CATALOG.safeURL('https://evil.example/a.mp3', 'audio')"), null);
  await run("document.querySelector('[data-page=poems]').click();document.querySelector('[data-poem]').click();document.querySelectorAll('.poem-line')[1].querySelector('[data-rate]').click()");
  await until("document.querySelector('#poemPlaybackStatus')?.textContent === '跟读结束'", 'poem playback through saved local MP3 files');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: live daily/word lists, full details, real MP3 playback without system voice, speed, pause on navigation, pagination, page jump, full-site search, local lessons, retry, URL filtering, desktop/mobile layout.');
  await call('Page.navigate', { url: new URL('file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')).href });
  await until("!!document.querySelector('[data-page=vocabulary]')", 'file app boot');
  await run("document.querySelector('[data-page=vocabulary]').click()");
  await until("!!document.querySelector('#wordsOnline [role=alert]')", 'file mode explanation');
  assert(await run("document.querySelector('#wordsOnline [role=alert]').textContent.includes('服务器模式')"));
  await call('Browser.close');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome.kill(); });
