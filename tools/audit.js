/* 全站粤拼审计：与 Unicode Unihan kCantonese 逐条比对 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const unihan = {};
fs.readFileSync(__dirname + '/Unihan_Readings.txt', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^U\+([0-9A-F]+)\tkCantonese\t(.+)$/);
  if (m) unihan[String.fromCodePoint(parseInt(m[1], 16))] = m[2].trim().split(/\s+/).map(s => s.toLowerCase());
});
console.error('Unihan kCantonese 字数:', Object.keys(unihan).length);

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/poems-curriculum.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/poems-curriculum2.js'), 'utf8'), ctx);
vm.runInContext(`this.__D = {INITIALS, FINAL_GROUPS, HUDU, ALONE, CONTRAST_PAIRS, CHAR_BANK, BLEND_WORDS, POEMS, SONGS, PHRASE_GROUPS, QUIZ, MNEMONIC};`, ctx);
const D = ctx.__D;

const issues = [];
const allow = new Set();
fs.readFileSync(path.join(__dirname, 'audit-allow.txt'), 'utf8').split('\n').forEach(l => {
  if (l.startsWith('#') || !l.trim()) return;
  const [c, j] = l.split('\t');
  if (c && j) allow.add(c.trim() + '|' + j.trim());
});
const check = (src, c, j) => {
  if (!/^[\u3400-\u9fff\uf900-\ufaff]$/.test(c)) return;    // 只审汉字
  j = j.replace(/[^a-z0-9]/g, '');                          // 去掉省略号等尾巴
  if (!/^[a-z]+[1-6]$/.test(j)) { issues.push([src, c, j, '格式异常']); return; }
  if (allow.has(c + '|' + j)) return;                       // 白名单：经复核的权威读音
  const readings = unihan[c];
  if (!readings) { issues.push([src, c, j, 'Unihan未收录']); return; }
  if (!readings.includes(j)) issues.push([src, c, j, '≠' + readings.join('/')]);
};
const fromLines = (src, lines) => lines.forEach(l => {
  const cs = [...l.h], js = l.j.trim().split(/\s+/);
  if (cs.length === js.length) cs.forEach((c, i) => check(src + ':' + l.h.slice(0, 6), c, js[i]));
});
D.INITIALS.forEach(v => v.examples.forEach(e => check('声母' + v.id, e.c, e.j)));
D.FINAL_GROUPS.forEach(g => g.finals.forEach(f => f.examples.forEach(e => check('韵母' + f.id, e.c, e.j))));
Object.entries(D.HUDU).forEach(([k, v]) => check('HUDU:' + k, v.c, v.j));
Object.entries(D.ALONE).forEach(([k, v]) => check('ALONE:' + k, v.c, v.j));
D.CONTRAST_PAIRS.forEach(p => { check('对立a', p.a.c, p.a.j); check('对立b', p.b.c, p.b.j); });
D.CHAR_BANK.forEach(e => check('字库:' + e.m.slice(0, 6), e.c, e.j));
D.BLEND_WORDS.forEach(w => [...w.w].forEach((c, i) => check('拼读词:' + w.w, c, w.j[i])));
D.POEMS.forEach(p => fromLines('诗:' + p.title, p.lines));
D.SONGS.forEach(s => fromLines('歌:' + s.name, s.lines));
D.PHRASE_GROUPS.forEach(g => g.items.forEach(it => {
  const cs = [...it.c].filter(ch => /[\u3400-\u9fff]/.test(ch));
  const js = it.j.trim().split(/\s+/).filter(s => /^[a-z]+[1-6]/.test(s));
  const src = '短语:' + it.c.slice(0, 8);
  if (cs.length === js.length) cs.forEach((c, i) => check(src, c, js[i].split(',')[0]));
}));
D.QUIZ.tone.forEach(q => check('测验', q.c, q.j));
D.QUIZ.pinyin.forEach(q => check('测验拼', q.c, q.opts[q.ans]));
D.MNEMONIC.six.c.split('').forEach((c, i) => check('口诀六', c, D.MNEMONIC.six.j[i]));
D.MNEMONINE = null;

// 汇总
console.error('审计条目发现问题数:', issues.length);
issues.forEach(([src, c, j, why]) => console.error(`${src} | ${c} ${j} | ${why}`));
fs.writeFileSync(path.join(__dirname, 'audit-issues.txt'), issues.map(x => x.join('\t')).join('\n'));
console.error('已写入 tools/audit-issues.txt');

// 生成权威字典文件（供歌词工作台兜底；Unihan 数据 © Unicode®, Unicode Terms of Use）
const out = [];
Object.entries(unihan).forEach(([c, rs]) => out.push(c + rs[0]));
fs.writeFileSync(path.join(ROOT, 'js/canto-dict.js'),
  `/* Unicode Unihan kCantonese 粤音字典（数据来源：Unicode(R) Unihan 数据库，\n   遵循 Unicode Terms of Use；按读音常用度取首个）。\n   用途：歌词解析工作台的注音兜底 + 发音校对基准。共 ${out.length} 字。 */\nconst CANTO_DICT_STR = ${JSON.stringify(out.join(' '))};\nconst CANTO_DICT = (() => { const m = new Map(); for (let i = 0; i < CANTO_DICT_STR.length; ) { const c = CANTO_DICT_STR[i]; let j = ''; i++; while (i < CANTO_DICT_STR.length && /[a-z0-9]/.test(CANTO_DICT_STR[i])) { j += CANTO_DICT_STR[i++]; } m.set(c, j); } return m; })();\n`);
console.error('canto-dict.js 已生成，字数:', out.length);
