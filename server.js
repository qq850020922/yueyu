/* ============================================================
   粤讲粤掂 · 多用户服务器（需求分析.md §4-F13）
   零 npm 依赖：静态托管 + 注册/登录 + 云端进度同步
   启动：node server.js   （端口可用环境变量 PORT 指定，默认 3000）
   数据：server-data/users.json（自动创建；备份=拷贝该目录）
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { discoverSongs, indexSongs } = require('./tools/index-songs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.YGT_DATA_DIR || path.join(ROOT, 'server-data');
const DB_FILE = path.join(DATA_DIR, 'users.json');
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 天
const yueyumaoSource = require('./tools/yueyumao-source').createSource(fetch, { directory: path.join(DATA_DIR, 'yueyumao-pages') });
const yueyumaoAudio = require('./tools/yueyumao-audio').createAudioCache(path.join(ROOT, 'media', 'yueyumao'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

/* ---------- 存储 ---------- */
let db = { users: {}, tokens: {} };
function loadDB() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.users) db.users = {};
    if (!db.tokens) db.tokens = {};
  } catch (e) { db = { users: {}, tokens: {} }; }
}
function saveDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE); // 原子替换
  } catch (e) { console.error('[server-data] 保存失败:', e.message); }
}

/* ---------- 工具 ---------- */
function hash(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 64).toString('hex');
}
function newToken() { return crypto.randomBytes(24).toString('hex'); }
function cleanTokens() {
  const now = Date.now();
  let dirty = false;
  for (const [t, v] of Object.entries(db.tokens)) {
    if (v.exp < now) { delete db.tokens[t]; dirty = true; }
  }
  if (dirty) saveDB();
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const rec = db.tokens[m[1]];
  if (!rec || rec.exp < Date.now()) return null;
  return db.users[rec.name] ? { name: rec.name, u: db.users[rec.name] } : null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 20000) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end(body);
}

/* ---------- API ---------- */
async function handleAPI(req, res, pathname) {
  if (pathname === '/api/yueyumao-audio' && ['GET', 'HEAD'].includes(req.method)) {
    try {
      const requested = new URL(req.url, 'http://localhost').searchParams.get('path');
      const result = await yueyumaoAudio(requested);
      return serveStatic(req, res, '/media/yueyumao' + result.relative.split('/').map(encodeURIComponent).join('/'));
    } catch (error) { return send(res, error.status || 502, { error: error.message }); }
  }
  if (pathname === '/api/yueyumao' && req.method === 'GET') {
    try { return send(res, 200, await yueyumaoSource(new URL(req.url, 'http://localhost').searchParams)); }
    catch (error) { return send(res, error.status || 502, { error: error.message }); }
  }
  if (pathname === '/api/songs' && req.method === 'GET') {
    return send(res, 200, { songs:discoverSongs() });
  }
  if (pathname === '/api/ping') return send(res, 200, { ok: true, name: 'ygt-server', version: '1.1' });

  if (pathname === '/api/register' && req.method === 'POST') {
    const b = await readBody(req).catch(() => null);
    const name = String(b && b.name || '').trim(), pass = String(b && b.pass || '');
    if (!/^[\w\u4e00-\u9fa5-]{2,24}$/.test(name)) return send(res, 400, { error: '用户名需 2–24 位（中英文/数字/下划线/短横线）' });
    if (pass.length < 4 || pass.length > 64) return send(res, 400, { error: '密码需 4–64 位' });
    if (['__proto__', 'prototype', 'constructor'].includes(name) || Object.hasOwn(db.users, name)) return send(res, 409, { error: '用户名已被注册或不可用' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[name] = { salt, h: hash(pass, salt), created: Date.now(), progress: [], stats: { tone: 0, pinyin: 0, law: 0 } };
    const token = newToken();
    db.tokens[token] = { name, exp: Date.now() + TOKEN_TTL };
    saveDB();
    return send(res, 200, { ok: true, token, name });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const b = await readBody(req).catch(() => null);
    const name = String(b && b.name || '').trim(), pass = String(b && b.pass || '');
    const u = Object.hasOwn(db.users, name) ? db.users[name] : null;
    if (!u) return send(res, 401, { error: '用户名或密码不对' });
    const h = hash(pass, u.salt);
    const ok = h.length === u.h.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.h));
    if (!ok) return send(res, 401, { error: '用户名或密码不对' });
    const token = newToken();
    db.tokens[token] = { name, exp: Date.now() + TOKEN_TTL };
    cleanTokens(); saveDB();
    return send(res, 200, { ok: true, token, name });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const h = req.headers['authorization'] || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (m && db.tokens[m[1]]) { delete db.tokens[m[1]]; saveDB(); }
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/progress') {
    const a = authUser(req);
    if (!a) return send(res, 401, { error: 'bad token' });
    if (req.method === 'GET') {
      return send(res, 200, { ok: true, progress: a.u.progress || [], stats: a.u.stats || { tone: 0, pinyin: 0, law: 0 } });
    }
    if (req.method === 'POST') {
      const b = await readBody(req).catch(() => null);
      if (!b) return send(res, 400, { error: 'bad body' });
      const days = [...new Set((Array.isArray(b.progress) ? b.progress : [])
        .map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 90))].sort((x, y) => x - y);
      const clamp = v => Math.max(0, Math.min(10, Math.round(Number(v) || 0)));
      const st = b.stats || {};
      a.u.progress = days;
      a.u.stats = { tone: clamp(st.tone), pinyin: clamp(st.pinyin), law: clamp(st.law) };
      a.u.updated = Date.now();
      saveDB();
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: 'not found' });
}

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (_) { res.writeHead(400); return res.end('400'); }
  if (p === '/') p = '/index.html';
  const f = path.resolve(ROOT, '.' + p);
  const relative = path.relative(ROOT, f);
  if (relative.startsWith('..') || path.isAbsolute(relative) ||
      !(relative === 'index.html' || /^(js|css|media)[\\/]/.test(relative))) {
    res.writeHead(403); return res.end('403');
  }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    const headers = { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start = match && match[1] ? +match[1] : 0;
      let end = match && match[2] ? Math.min(+match[2], data.length - 1) : data.length - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, data.length - +match[2]); end = data.length - 1; }
      if (!match || (!match[1] && !match[2]) || start > end || start >= data.length) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + data.length }); return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
      return res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
    }
    res.writeHead(200, { ...headers, 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

/* ---------- 启动 ---------- */
loadDB();
indexSongs();
const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname.startsWith('/api/')) {
    handleAPI(req, res, pathname).catch(e => send(res, 500, { error: e.message || 'server error' }));
    return;
  }
  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log(`[粤讲粤掂] 服务器已启动: http://localhost:${server.address().port}`);
  console.log(`[粤讲粤掂] 多用户模式：注册/登录/云端进度已启用（数据目录 server-data/）`);
  console.log(`[粤讲粤掂] 已注册用户数: ${Object.keys(db.users).length}`);
});
