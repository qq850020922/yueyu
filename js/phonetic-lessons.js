/* Cantonese teaching syllables. A carrier syllable is never an isolated phoneme. */
const PHONETIC_LESSONS = {
  initials: {
    b: 'baa1', p: 'paa3', m: 'maa1', f: 'faa1', d: 'daa2', t: 'taa1',
    n: 'naa4', l: 'laa1', g: 'gaa1', k: 'kaa1', ng: 'ngaa4', h: 'haa1',
    z: 'zaa1', c: 'caa1', s: 'saa1', gw: 'gwaa1', kw: 'kwaa1', j: 'jaa5', w: 'waa1',
  },
  finals: {
    aa: 'faa1', e: 'se1', i: 'si1', o: 'go1', u: 'fu1', oe: 'hoe1', yu: 'syu1',
    a: 'sam1', eo: 'ceot1',
    aai: 'daai6', aau: 'gaau1', ai: 'gai1', au: 'zau2', ei: 'fei1', iu: 'jiu3',
    oi: 'oi3', ou: 'hou2', ui: 'wui4', eoi: 'seoi2',
    aam: 'saam1', am: 'sam1', im: 'gim3', aan: 'saan1', an: 'san1', in: 'bin1',
    on: 'on1', un: 'bun3', eon: 'ceon1', yun: 'zyun1',
    aang: 'caang1', ang: 'gang1', eng: 'geng2', ing: 'ting1', ong: 'gong1',
    ung: 'zung1', oeng: 'hoeng1',
    aap: 'aap3', ap: 'sap6', ip: 'tip3', aat: 'baat3', at: 'jat1', it: 'git3',
    ot: 'hot3', ut: 'fut3', eot: 'ceot1', yut: 'syut3',
    aak: 'baak6', ak: 'bak1', ik: 'sik1', ok: 'hok6', uk: 'muk6', oek: 'zoek6', ek: 'cek3',
    m: 'm4', ng: 'ng5',
  },
};
if (typeof module !== 'undefined') module.exports = PHONETIC_LESSONS;
