const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
function wav() {
  const rate=8000, samples=rate*3, data=Buffer.alloc(44+samples*2);
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
    assert.equal(track.title,'Song');assert.equal(track.duration,3);assert.equal(track.lyrics,undefined);
    await win.evaluate(()=>window.playerApp.player.playTrack(window.playerApp.library.getTracks().find(t=>t.filePath?.includes("Artist - Song.wav"))));
    await win.waitForFunction(()=>window.playerApp.player.isPlaying && window.playerApp.player.audio.duration>0);
    assert.match(await win.evaluate(()=>window.playerApp.player.audio.src),/^playerium-audio:/);
    const sound = await win.evaluate(async () => {
      const player = window.playerApp.player, analyser = player.audioCtx.createAnalyser();
      player.gainNode.connect(analyser);
      await new Promise(resolve => setTimeout(resolve,100));
      const samples = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(samples);
      player.gainNode.disconnect(analyser);
      return samples.some(sample => Math.abs(sample - 128) > 1);
    });
    assert.equal(sound,true,'Streaming audio must reach Web Audio without CORS silencing');
    const denied=await win.evaluate(async()=>{try{await window.electronAPI.getMetadata('/etc/passwd');return false;}catch{return true;}});
    assert.equal(denied,true);
    await win.reload();await win.waitForFunction(()=>window.playerApp?.library.db);
    await win.evaluate(()=>window.playerApp.player.playTrack(window.playerApp.library.getTracks().find(t=>t.filePath?.includes("Artist - Song.wav"))));
    await win.waitForFunction(()=>window.playerApp.player.isPlaying);
    assert.deepEqual(errors,[]);
    console.log('Electron import, streaming playback, reload and IPC access checks passed');
  } finally { if(app)await app.close();await fs.rm(folder,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(() => clearInterval(watchdog));
