const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ORIGIN = 'https://www.yueyumao.com';

function audioPath(value) {
  let decoded;
  try { decoded = decodeURIComponent(value || ''); } catch (_) { throw new Error('无效录音路径'); }
  if (!/^\/(?:wav|files|voice\/liju)\/[^/\\?%#:*"<>|\x00-\x1f]+\.mp3$/i.test(decoded)) throw new Error('无效录音路径');
  return decoded;
}

const validMP3 = bytes => bytes.length > 128 &&
  (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224));

function createAudioCache(directory, fetcher = fetch) {
  const pending = new Map();
  return async value => {
    let relative;
    try { relative = audioPath(value); } catch (error) { error.status = 400; throw error; }
    if (pending.has(relative)) return pending.get(relative);
    if (pending.size >= 4) { const error = new Error('录音下载繁忙，请稍后重试'); error.status = 429; throw error; }
    const target = path.join(directory, ...relative.slice(1).split('/'));
    const task = (async () => {
      try {
        try { if (validMP3(await fs.readFile(target))) return { target, relative, cached: true }; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        let url = new URL(ORIGIN + relative).href;
        const requestOptions = () => ({ signal: AbortSignal.timeout(20000), redirect: 'error' });
        let response = await fetcher(url, requestOptions());
        // A missing dictionary file can use the exact same syllable from the lesson source.
        if (response.status === 404 && /^\/wav\/[a-z]+[1-6]\.mp3$/.test(relative)) {
          await response.body?.cancel();
          url = 'https://jyutping.org/audio/' + path.basename(relative);
          response = await fetcher(url, requestOptions());
        }
        if (!response.ok) throw new Error('来源录音不可用：HTTP ' + response.status);
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.length;
          if (size > 15 * 1024 * 1024) { await reader.cancel(); throw new Error('录音超过大小限制'); }
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        if (!validMP3(bytes)) throw new Error('来源没有返回有效 MP3');
        await fs.mkdir(path.dirname(target), { recursive: true });
        const temporary = target + '.' + crypto.randomUUID() + '.tmp';
        try { await fs.writeFile(temporary, bytes); await fs.rename(temporary, target); }
        finally { await fs.rm(temporary, { force: true }); }
        await fs.writeFile(target + '.json', JSON.stringify({ source: url, retrievedAt: new Date().toISOString(),
          sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, null, 2) + '\n');
        return { target, relative, cached: false };
      } finally { pending.delete(relative); }
    })();
    pending.set(relative, task);
    return task;
  };
}

module.exports = { audioPath, validMP3, createAudioCache };
