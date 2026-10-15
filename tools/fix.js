/* 依据 Unihan 审计结论修复全站真错误（每处替换带出现次数断言） */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function patch(file, pairs) {
  let s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const [from, to, n] of pairs) {
    let cnt = 0, idx = 0;
    while ((idx = s.indexOf(from, idx)) !== -1) { cnt++; idx += from.length; }
    if (cnt !== n) throw new Error(`${file} 期望 ${from} 出现 ${n} 次，实际 ${cnt}`);
    s = s.split(from).join(to);
  }
  fs.writeFileSync(path.join(ROOT, file), s);
  console.log('OK', file, pairs.length, '组替换');
}

/* ---------- data.js ---------- */
patch('js/data.js', [
  ["{ c: '拼', j: 'pin3'", "{ c: '拼', j: 'ping1'", 1],
  ["{ c: '急', j: 'gap3', m: 'jí' }", "{ c: '急', j: 'gap1', m: 'jí' }", 1],
  ["{ c: '急', j: 'gap3' }", "{ c: '急', j: 'gap1' }", 1],
  ["j: 'o1',", "j: 'o2',", 1],
  ["{ c: '凹', j: 'aau1'", "{ c: '凹', j: 'aau3'", 1],
  [", { c: '呣', j: 'm1', m: '语气词' }", "", 1],
  ["{ c: '钱', j: 'cin2', m: '钱' }", "{ c: '钱', j: 'cin4', m: '钱' }", 1],
  ["{ c: '话', j: 'waa2', m: '告诉（话畀你知）' }", "{ c: '话', j: 'waa6', m: '告诉（话畀你知；口语常变调 waa2）' }", 1],
  ["'dim2 gaai2 gam3 ge3'", "'dim2 gaai2 gam2 ge3'", 1],
  ["'peng4 di1 laa1, hou2 maa1'", "'peng4 di1 laa1, hou2 maa3'", 1],
  ["'gei2 do1 cin2'", "'gei2 do1 cin4'", 1],
  ["'ni1 gin6 gei2 do1 cin2'", "'ni1 gin6 gei2 do1 cin4'", 1],
]);

/* ---------- plan.js: BLEND 无关，无改动 ---------- */

/* ---------- app.js 内嵌数据：BLEND_WORDS 做人 ---------- */
patch('js/app.js', [
  ["['zou3', 'jan4', 'zeoi3', 'gan2', 'jiu3', 'hoi1', 'sam1']", "['zou6', 'jan4', 'zeoi3', 'gan2', 'jiu3', 'hoi1', 'sam1']", 1],
]);

/* ---------- poems-curriculum.js ---------- */
patch('js/poems-curriculum.js', [
  ["'joek6 ceot1 kei4 leoi5'", "'joek6 ceot1 kei4 lei5'", 1],          // 观沧海·里
  ["'gu1 saan1 zi6 bak1 gu2 ting4 sai1'", "'gu1 saan1 zi6 bak1 gaa2 ting4 sai1'", 1], // 钱塘·贾
  ["'zing1 pung4 ceot1 hon3 sai3'", "'zing1 pung4 ceot1 hon3 soi3'", 1], // 使至塞上·塞
  ["'wong4 hok6 jat1 heoi3 bat1 fuk1 faan2'", "'wong4 hok6 jat1 heoi3 bat1 fuk6 faan2'", 1], // 黄鹤楼·复
  ["'ho4 si6 soeng4 hoeng3 bit6 si4 jyun4'", "'ho4 si6 coeng4 hoeng3 bit6 si4 jyun4'", 1], // 水调·长
  ["'sai3 haa6 cau1 loi4'", "'soi3 haa6 cau1 loi4'", 1],                // 渔家傲·塞
  ["'faan1 sai3 ngoi6 sing1'", "'faan1 soi3 ngoi6 sing1'", 1],          // 破阵子·塞
  ["'sai3 soeng6 jin1 zi1'", "'soi3 soeng6 jin1 zi1'", 1],              // 雁门·塞
  ["'fuk1 dak1 faan2 zi6 jin4'", "'fuk6 dak1 faan2 zi6 jin4'", 1],      // 归园·复
  ["'jat6 jyut6 jiu6 jiu6 ngan4 gam1 toi4'", "'jat6 jyut6 jiu6 jiu6 gam1 ngan4 toi4'", 1], // 梦游·金银对调
  ["'ho4 wai4 jin4 siu2 cin2'", "'ho4 wai4 jin4 siu2 cin4'", 1],        // 将进酒·钱
  ["'zok3 je6'", "'zok6 je6'", 1],                                      // 虞美人·昨
  ["'kei4 syu1'", "'kei4 zyu1'", 1],                                    // 静女·姝
  ["'seon4 mei5 ce2 ji6'", "'seon1 mei5 ce2 ji6'", 1],                  // 静女·洵
  ["'mong6 gau4 hoeng1'", "'mong6 gau6 hoeng1'", 1],                    // 涉江·旧
  ["'maan6 hou5 hou5'", "'maan6 hou6 hou6'", 1],                        // 涉江·浩
  ["'sing3 zoeng6 ci4 tong4'", "'sing4 zoeng6 ci4 tong4'", 1],          // 蜀相·丞
]);
/* 梦游 兮 hai1×8、全文件 复 fuk1（将进酒×3）：整词替换 */
{
  const f = path.join(ROOT, 'js/poems-curriculum.js');
  let s = fs.readFileSync(f, 'utf8');
  const c1 = s.split('hai1').length - 1, c2 = s.split('fuk1').length - 1;
  if (c1 !== 8) throw new Error('兮 hai1 期望 8 处，实际 ' + c1);
  s = s.split('hai1').join('hai4');
  const c3 = s.split('fuk1 ').length - 1;
  if (c3 !== 3) throw new Error('将进酒 复 fuk1 期望 3 处，实际 ' + c3);
  s = s.split('fuk1 ').join('fuk6 ');
  /* 梦游 鸾 luen4（此时兮已改成 hai4） */
  if (!s.includes('hai4 luen4 wui4 ce1')) throw new Error('鸾定位失败');
  s = s.replace('hai4 luen4 wui4 ce1', 'hai4 lyun4 wui4 ce1');
  fs.writeFileSync(f, s);
  console.log('OK poems-curriculum.js 整词替换（兮×8、复×3、鸾×1）');
}
console.log('全部修复完成');
