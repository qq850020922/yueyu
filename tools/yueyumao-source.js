const ORIGIN = 'https://www.yueyumao.com';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function sourceURL(params) {
  const type = params.get('type');
  if (type === 'detail') {
    const id = params.get('id') || '';
    if (!/^[1-9]\d{0,7}$/.test(id)) throw new Error('无效词条编号');
    return `${ORIGIN}/post/${id}.html`;
  }
  const page = params.get('page') || '1';
  if (!/^[1-9]\d{0,3}$/.test(page)) throw new Error('页码需为 1–9999');
  if (type === 'search') {
    const q = (params.get('q') || '').trim();
    if (!q || [...q].length > 80) throw new Error('请输入 1–80 个字的搜索词');
    return `${ORIGIN}/search.php?${new URLSearchParams({ q, page })}`;
  }
  const categories = { daily: 2, words: 3 };
  if (!Object.hasOwn(categories, type)) throw new Error('无效栏目');
  const category = categories[type];
  return `${ORIGIN}/category-${category}${page === '1' ? '' : '_' + page}.html`;
}

function createSource(fetcher = fetch, options = {}) {
  const cache = new Map();
  let active = 0;
  return async params => {
    let url;
    try { url = sourceURL(params); } catch (error) { error.status = 400; throw error; }
    const saved = cache.get(url);
    if (saved && saved.expires > Date.now()) return saved.promise;
    if (active >= 4) { const error = new Error('音源站请求繁忙，请稍后重试'); error.status = 429; throw error; }
    active++;
    const promise = (async () => {
      try {
        const disk = options.directory && path.join(options.directory, crypto.createHash('sha256').update(url).digest('hex') + '.json');
        if (disk) {
          try {
            const saved = JSON.parse(await fs.readFile(disk, 'utf8'));
            if (saved.source === url && typeof saved.html === 'string' && Buffer.byteLength(saved.html) <= 2 * 1024 * 1024) return saved;
          } catch (_) {}
        }
        const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('来源页面暂时不可用');
        const reader = response.body.getReader(), chunks = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('来源页面过大'); }
          chunks.push(Buffer.from(value));
        }
        const result = { html: Buffer.concat(chunks).toString('utf8'), source: url };
        if (disk) {
          await fs.mkdir(options.directory, { recursive: true });
          const temporary = disk + '.' + crypto.randomUUID() + '.tmp';
          try { await fs.writeFile(temporary, JSON.stringify(result)); await fs.rename(temporary, disk); }
          finally { await fs.rm(temporary, { force: true }); }
        }
        return result;
      } catch (error) {
        cache.delete(url);
        throw new Error('粤语猫暂时无法连接，请稍后重试');
      } finally { active--; }
    })();
    cache.delete(url);
    if (cache.size >= 48) cache.delete(cache.keys().next().value);
    cache.set(url, { expires: Date.now() + 10 * 60 * 1000, promise });
    return promise;
  };
}

module.exports = { sourceURL, createSource };
