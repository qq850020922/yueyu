/* Retrieve actual final recordings and decode existing IPA reference files for inspection. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { configureProxy, getOnce } = require('./fetch-ipa');
const { wav16 } = require('./build-phonemes');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'media', 'phonetic-sources');
const finals = {
  'cantonese-finals-1': 'aai aam aan aang aau ai ang au e ei eng im in ing m ng oe oeng oi on ong ou ui un ung',
  'cantonese-finals-2': 'aak ak ap at ek ik oek ok ot',
};
const delay = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!await configureProxy(process.argv.slice(2))) return;
  fs.mkdirSync(path.join(target, 'finals'), { recursive:true });
  fs.mkdirSync(path.join(target, 'ipa'), { recursive:true });
  const credits = { finals:{}, ipa:JSON.parse(fs.readFileSync(path.join(root, 'media/ipa/CREDITS.json'), 'utf8')) };
  for (const [repo, list] of Object.entries(finals)) {
    for (const id of list.split(' ')) {
      const name = id + '.m4a', url = `https://wcho-collab.github.io/${repo}/${name}`;
      const file = path.join(target, 'finals', name);
      if (!fs.existsSync(file)) {
        const data = await getOnce(url);
        if (data.toString('ascii',4,8) !== 'ftyp') throw Error('Invalid M4A: ' + id);
        fs.writeFileSync(file, data);
      }
      credits.finals[id] = { url, repository:`https://github.com/wcho-collab/${repo}`, license:'No redistribution license specified by the source; local study copy.' };
    }
  }
  fs.writeFileSync(path.join(target, 'CREDITS.json'), JSON.stringify(credits,null,2));
  const sources = vm.runInNewContext(fs.readFileSync(path.join(root, 'js/ipa-map.js'),'utf8') + ';IPA_FILES');
  const finalsSources = Object.keys(credits.finals).map(s => [s, 'media/phonetic-sources/finals/' + s + '.m4a']);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'canto-decode-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9232','--user-data-dir='+profile,'about:blank'], { windowsHide:true,stdio:'ignore' });
  let ws;
  try {
    let tabs;
    for(let i=0;i<50;i++){try{tabs=await(await fetch('http://127.0.0.1:9232/json')).json();break;}catch(_){await delay(200);}}
    ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
    let n=0; const pending=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    await call('Page.navigate',{url:'http://localhost:3000'});await delay(700);
    for(const [kind, list] of [['ipa',Object.entries(sources).map(([s,f])=>[s,'media/ipa/'+f])], ['finals',finalsSources]]) {
      for(const [id, file] of list) {
        const expression=`(async()=>{const ctx=new AudioContext({sampleRate:22050});const b=await ctx.decodeAudioData(await(await fetch(${JSON.stringify(file)})).arrayBuffer());const data=Array.from(b.getChannelData(0));await ctx.close();return {rate:b.sampleRate,data};})()`;
        const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
        const {rate,data}=r.result.value;
        fs.writeFileSync(path.join(target,kind,id+'.wav'),wav16(data,rate));
      }
    }
    await call('Browser.close'); console.log('Prepared native finals and decoded IPA sources.');
  } finally { if(ws)ws.close();chrome.kill(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
