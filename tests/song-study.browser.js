/* Integration checks in installed Chrome, using original test text and teaching audio. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = 9231;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'canto-song-test-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { windowsHide:true, stdio:'ignore' });
let ws;
const delay = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  let tabs;
  for (let i=0; i<60; i++) { try { tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (_) { await delay(200); } }
  ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0; const pending=new Map(), errors=[];
  ws.onmessage=e=>{ const m=JSON.parse(e.data); if(m.id){ const p=pending.get(m.id); pending.delete(m.id); m.error?p.reject(Error(m.error.message)):p.resolve(m.result); } else if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails); };
  const call=(method,params={})=>new Promise((resolve,reject)=>{ const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params})); });
  const evaluate=async expression=>{ const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Page.navigate',{url:'http://localhost:3000'}); await delay(1800);
  assert.equal(await evaluate("typeof SONG_STUDY"), 'object');
  await evaluate("document.querySelector('[data-page=songs]').click()");
  assert.equal(await evaluate("document.querySelectorAll('#page-songs a[href]').length"),0);
  assert(await evaluate("document.querySelectorAll('[data-song-index]').length >= 2"));
  assert(await evaluate("document.querySelector('#songAudio audio')?.src.includes('/media/songs/') && document.querySelector('#songText').value.length > 0 && document.querySelectorAll('.study-line').length > 0"), 'default media/songs audio and lyrics must be loaded');
  const fixture=await evaluate(`(async()=>{
    const bytes=await (await fetch('media/voice-cuhk/nei5.wav')).arrayBuffer();
    const dt=new DataTransfer(); dt.items.add(new File([bytes],'原创测试.wav',{type:'audio/wav'}));
    dt.items.add(new File(['[00:00.00]你好\\n[00:00.20]学习'],'原创测试.lrc',{type:'text/plain'}));
    const input=document.querySelector('#songFiles'); input.files=dt.files; input.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,500));
    return {lines:document.querySelectorAll('.study-line').length, text:document.querySelector('#songText').value, enabled:!document.querySelector('[data-line-action="clip:0"]').disabled};
  })()`);
  assert.equal(fixture.lines,2); assert(fixture.enabled,JSON.stringify(fixture));
  await evaluate("document.querySelector('[data-line-action=\"clip:0\"]').click()"); await delay(1000);
  const clip=await evaluate("({paused:document.querySelector('#songAudio audio').paused,time:document.querySelector('#songAudio audio').currentTime})");
  assert(clip.paused && clip.time < .4,JSON.stringify(clip));
  await evaluate("document.querySelector('[data-character=\"0:0\"]').click()");
  assert((await evaluate("document.querySelector('#songDetail').textContent")).includes('声母'));
  await evaluate("document.querySelector('[data-done=\"0\"]').click();document.querySelector('#songAnalyze').click()");
  assert(await evaluate("document.querySelector('[data-done=\"0\"]').checked"));
  await evaluate("document.querySelector('#songText').value='你好\\n学习';document.querySelector('#songAnalyze').click()");
  assert(await evaluate("document.querySelector('[data-line-action=\"clip:0\"]').disabled"));
  const decoded=await evaluate(`(async()=>{
    const ctx=new AudioContext(); let count=0;
    for(const file of Object.values(UNIFIED_VOICE_FILES)){
      const b=await (await fetch('media/voice-cuhk/'+file)).arrayBuffer();
      const audio=await ctx.decodeAudioData(b);
      if(!(audio.duration>0) || !audio.getChannelData(0).some(n=>Math.abs(n)>.0001)) throw Error('Empty recording: '+file);
      count++;
    }
    await ctx.close(); return count;
  })()`);
  assert(decoded>=391);
  const clicks=await evaluate(`(async()=>{
    const original=window.Audio, played=[];
    window.Audio=class { constructor(src){this.src=src;} play(){played.push(this.src);return Promise.resolve();} pause(){} };
    const buttons=[...document.querySelectorAll('#page-initials [data-phonetic-initial],#page-finals [data-phonetic-final]')];
    for(const b of buttons){ b.click(); await Promise.resolve(); }
    PRONUNCIATION.stop(); window.Audio=original;
    const expected=[...INITIALS.map(v=>PHONETIC_LESSONS.initials[v.id]),...FINAL_GROUPS.flatMap(g=>g.finals.map(f=>PHONETIC_LESSONS.finals[f.id]))];
    return {buttons:buttons.length,plays:played.length,examples:played.every((s,i)=>s==='media/voice-cuhk/'+UNIFIED_VOICE_FILES[expected[i]])};
  })()`);
  assert.equal(clicks.buttons,74); assert.equal(clicks.plays,74); assert(clicks.examples);
  const newDecoded=await evaluate(`(async()=>{
    const ctx=new AudioContext();let n=0;
    for(const file of Object.values(PHONEME_FILES)){
      const b=await ctx.decodeAudioData(await(await fetch('media/phonemes/'+file)).arrayBuffer());
      if(!b.getChannelData(0).some(v=>Math.abs(v)>.01))throw Error('Silent base sound: '+file);n++;
    }await ctx.close();return n;
  })()`);
  assert.equal(newDecoded,74);
  const spelling=await evaluate(`(async()=>{
    const OriginalAudio=window.Audio, played=[], objects=[];
    window.Audio=class{constructor(src){this.src=src;objects.push(this);}play(){played.push(this.src);return Promise.resolve();}pause(){}};
    document.querySelector('[data-spell-syllable="nei5"]').click();
    objects[0].onended();await new Promise(r=>setTimeout(r,720));
    objects[1].onended();await new Promise(r=>setTimeout(r,720));
    objects[2].onended();await Promise.resolve();
    PRONUNCIATION.stop();window.Audio=OriginalAudio;return played;
  })()`);
  assert.deepEqual(spelling,['media/voice-cuhk/naa4.wav','media/voice-cuhk/fei1.wav','media/voice-cuhk/nei5.wav']);
  for (const width of [1365,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
    await delay(100);
    const dimensions=await evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})');
    assert(dimensions.scroll<=dimensions.width,JSON.stringify(dimensions));
    const shot=await call('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(os.tmpdir(),`canto-songs-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  for(const page of ['initials','finals']){
    await evaluate('document.querySelector(\'[data-page="'+page+'"]\').click()');
    for(const width of [1365,390,320]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});await delay(100);
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),page+': overflow at '+width);
      const shot=await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(os.tmpdir(),`canto-${page}-${width}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  await call('Page.navigate',{url:'file:///' + path.resolve('index.html').replace(/\\/g,'/')}); await delay(1600);
  assert(await evaluate("document.querySelector('#songAudio audio')?.src.includes('/media/songs/') && document.querySelector('#songText').value.length > 0"), 'file mode must load indexed songs and lyrics');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: '+decoded+' example WAV decodes; 74 restored teaching buttons; default songs and lyrics in server/file mode; paired import, LRC segment stop, character learning, progress, TXT boundaries, desktop/mobile, no runtime errors.');
  await call('Browser.close');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ if(ws)ws.close(); chrome.kill(); });
