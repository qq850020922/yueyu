/* Cantonese teaching syllables. A carrier syllable is never an isolated phoneme. */
const PHONETIC_LESSONS = {
  initials: {
    b: 'baa1', p: 'paa3', m: 'maa1', f: 'faa1', d: 'daa2', t: 'taa1',
    n: 'naa4', l: 'laa1', g: 'gaa1', k: 'kaa1', ng: 'ngaa4', h: 'haa1',
    z: 'zaa1', c: 'caa1', s: 'saa1', gw: 'gwaa1', kw: 'kwaa1', j: 'jaa5', w: 'waa1',
  },
  finals: {
    aa: 'aa1', e: 'ze1', i: 'ji1', o: 'o1', u: 'wu1', oe: 'hoe1', yu: 'jyu1',
    a: 'sam1', eo: 'seon1',
    aai: 'aai1', aau: 'aau1', ai: 'ai1', au: 'au1', ei: 'fei1', iu: 'jiu1',
    oi: 'oi1', ou: 'ou1', ui: 'fui1', eoi: 'seoi1',
    aam: 'aam1', am: 'am1', im: 'sim2', aan: 'aan1', an: 'san1', in: 'sin1',
    on: 'on1', un: 'fun1', eon: 'seon1', yun: 'syun1',
    aang: 'aang1', ang: 'ang1', eng: 'zeng6', ing: 'sing1', ong: 'ong1',
    ung: 'gung1', oeng: 'goeng1',
    aap: 'aap3', ap: 'ap1', ip: 'sip3', aat: 'aat3', at: 'sat1', it: 'sit3',
    ot: 'hot3', ut: 'fut3', eot: 'seot1', yut: 'syut3',
    aak: 'aak3', ak: 'ak1', ik: 'sik1', ok: 'ok3', uk: 'uk1', oek: 'goek3', ek: 'sek6',
    m: 'm4', ng: 'ng5',
  },
};
if (typeof module !== 'undefined') module.exports = PHONETIC_LESSONS;
