const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
function wav() {
  const rate=8000, samples=rate*20, data=Buffer.alloc(44+samples*2);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++) data.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*440/rate)*1000),44+i*2);
  return data;
}
const watchdog = setTimeout(() => { console.error('Electron runtime verification timed out'); process.exit(1); }, 90000);
(async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-electron-'));
  await fs.writeFile(path.join(folder,'Artist - Song.wav'),wav());await fs.writeFile(path.join(folder,'Artist - Song.lrc'),'[00:01]desktop lyrics');
  let app;
  try {
    console.log('Launching Electron runtime verification');
    app=await electron.launch({timeout:20000,args:['.',`--user-data-dir=${path.join(folder,'profile')}`,'--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    const win=await app.firstWindow();
    const errors=[];win.on('pageerror',e=>errors.push(e.message));
    await win.waitForFunction(()=>window.playerApp?.library.db);
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},folder);
    await win.evaluate(()=>window.playerApp.selectMusicFolder());
    const tracks=await win.evaluate(()=>window.playerApp.library.getTracks().map(t=>({title:t.title,duration:t.duration,lyrics:t.lyrics,fileName:t.fileName})));
    assert.equal(tracks.length,1, `Expected one audio track, got ${tracks.length}; errors: ${errors.join("; ")}`);
    const track=tracks[0];
    assert.equal(track.title,'Song');assert.equal(track.duration,20);assert.equal(track.lyrics,undefined);
    await win.evaluate(()=>window.playerApp.player.playTrack(window.playerApp.library.getTracks().find(t=>t.filePath?.includes("Artist - Song.wav"))));
    await win.waitForFunction(()=>window.playerApp.player.isPlaying && window.playerApp.player.audio.duration>0);
    assert.match(await win.evaluate(()=>window.playerApp.player.audio.src),/^playerium-audio:/);
    const sound = await win.evaluate(async () => {
      const player = window.playerApp.player, analyser = player.audioCtx.createAnalyser();
      player.gainNode.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let audible=false;
      for(let attempt=0;attempt<30;attempt++) {
        await new Promise(resolve=>setTimeout(resolve,100));analyser.getByteTimeDomainData(samples);
        if(samples.some(sample=>Math.abs(sample-128)>1)){audible=true;break;}
      }
      player.gainNode.disconnect(analyser);
      return {audible,context:player.audioCtx.state,volume:player.volume,position:player.audio.currentTime};
    });
    assert.equal(sound.audible,true,`Streaming audio must reach Web Audio: ${JSON.stringify(sound)}`);
    const denied=await win.evaluate(async()=>{try{await window.electronAPI.getMetadata('/etc/passwd');return false;}catch{return true;}});
    assert.equal(denied,true);
    await win.reload();await win.waitForFunction(()=>window.playerApp?.library.db);
    await win.evaluate(()=>window.playerApp.player.playTrack(window.playerApp.library.getTracks().find(t=>t.filePath?.includes("Artist - Song.wav"))));
    await win.waitForFunction(()=>window.playerApp.player.isPlaying);
    assert.deepEqual(errors,[]);
    console.log('Electron import, streaming playback, reload and IPC access checks passed');
    await app.evaluate(() => {
      const {createRequire}=process.getBuiltinModule('module');
      const localRequire=createRequire(process.cwd()+'/.update-test.cjs');
      const {DesktopUpdater}=localRequire(process.cwd()+'/desktop-updater.js');
      DesktopUpdater.prototype.install=async function(info){global.updateTestInfo=info;this.onState({state:'installing'});return {started:true};};
    });
    await win.evaluate(()=>window.playerApp.ui.showUpdateModal({latestVersion:'9.0.0',releaseNotes:'- Исправлено обновление'}));
    await win.locator('#btnDownloadUpdate').click();
    await win.waitForFunction(()=>document.getElementById('updateStatusText').textContent==='Установка');
    assert.equal(await app.evaluate(()=>global.updateTestInfo.latestVersion),'9.0.0');
  } finally { if(app)await app.close();await fs.rm(folder,{recursive:true,force:true}); }
  await require('./update-helper.cjs')();
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(() => clearInterval(watchdog));
