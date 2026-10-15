/* Timing is explicit: untimed text never receives guessed song boundaries. */
const LYRICS = (() => {
  function parse(source) {
    const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
    const rows = [];
    for (const raw of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const tags = [...raw.matchAll(/\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
      const text = raw.replace(/\[[^\]]*\]/g, '').trim();
      if (tags.length) {
        for (const t of tags) rows.push({ text, start: Math.max(0, +t[1] * 60 + +t[2] + Number('0.' + (t[3] || '0')) + offset), end: null });
      } else if (text) rows.push({ text, start: null, end: null });
    }
    const timed = rows.filter(r => r.start !== null).sort((a, b) => a.start - b.start);
    for (const row of timed) row.end = timed.find(next => next.start > row.start)?.start ?? null;
    return (timed.length === rows.length ? timed : rows).filter(r => r.text);
  }
  function range(row, duration) {
    const end = row.end ?? duration;
    return Number.isFinite(row.start) && row.start >= 0 && Number.isFinite(end) && end > row.start
      && (!Number.isFinite(duration) || (row.start < duration && end <= duration + 0.1))
      ? { start: row.start, end } : null;
  }
  function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder('utf-16be').decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { return new TextDecoder('gb18030').decode(bytes); }
  }
  function embedded(buffer) {
    const b = new Uint8Array(buffer);
    if (b.length < 10 || String.fromCharCode(...b.slice(0, 3)) !== 'ID3' || ![3, 4].includes(b[3])) return null;
    const sync = p => ((b[p] & 127) * 2097152 + (b[p + 1] & 127) * 16384 + (b[p + 2] & 127) * 128 + (b[p + 3] & 127));
    const uint = p => new DataView(b.buffer, b.byteOffset + p, 4).getUint32(0);
    const end = Math.min(b.length, 10 + sync(6));
    // Unsynchronised or compressed tags are not interpreted as plain lyric text.
    if (b[5] & 128) return null;
    let p = 10;
    if (b[5] & 64) { if (p + 4 > end) return null; p += b[3] === 4 ? sync(p) : 4 + uint(p); }
    let fallback = null;
    while (p + 10 <= end) {
      const id = String.fromCharCode(...b.slice(p, p + 4));
      const size = b[3] === 4 ? sync(p + 4) : uint(p + 4);
      const flags = b[p + 9]; p += 10;
      const finish = p + size;
      if (!/^[A-Z0-9]{4}$/.test(id) || !size || finish > end) break;
      if ((id === 'USLT' || id === 'SYLT') && size >= 6 && flags === 0) {
        const enc = b[p], wide = enc === 1 || enc === 2;
        if (enc > 3) { p = finish; continue; }
        let cursor = p + (id === 'USLT' ? 4 : 6);
        let encoding = enc === 0 ? 'iso-8859-1' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'utf-16le';
        if (enc === 1 && b[cursor] === 254 && b[cursor + 1] === 255) encoding = 'utf-16be';
        const getText = () => {
          const begin = cursor;
          while (cursor < finish && !(b[cursor] === 0 && (!wide || b[cursor + 1] === 0))) cursor += wide ? 2 : 1;
          const text = new TextDecoder(encoding).decode(b.slice(begin, cursor));
          cursor += wide ? 2 : 1; return text.replace(/^\uFEFF/, '');
        };
        getText(); // Content descriptor, including its terminating null.
        if (id === 'USLT') fallback = new TextDecoder(encoding).decode(b.slice(cursor, finish)).replace(/\0/g, '');
        else if (b[p + 4] === 2) {
          let output = '';
          while (cursor < finish) {
            const text = getText(); if (cursor + 4 > finish) break;
            const seconds = uint(cursor) / 1000; cursor += 4;
            output += `[${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}]${text.trim()}\n`;
          }
          if (output) return output;
        }
      }
      p = finish;
    }
    return fallback;
  }
  return { parse, range, decode, embedded };
})();
if (typeof module !== 'undefined') module.exports = LYRICS;
