const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-mini-'));
 const app=await _electron.launch({args:['.','--user-data-dir='+profile]});
 try{
  const main=await app.firstWindow();await main.waitForFunction(()=>window.playerApp?.ui.interfaceV2);
  await main.evaluate(()=>{const a=window.playerApp,p=a.player;window.miniCommands=[];for(const name of ['togglePlay','next','prev','seekToTime','setVolume'])p[name]=value=>window.miniCommands.push([name,value]);a.ui.toggleCurrentLike=async()=>window.miniCommands.push(['like']);p.currentTrack={id:'mini-test',title:'Одна аудиосессия',artist:'Исполнитель',duration:180};p.queue=[p.currentTrack,{id:'next',title:'Следующий',artist:'Artist'}];p.queueIndex=0;p.getDuration=()=>180;p.getCurrentTime=()=>37;p.isPlaying=true;a.ui.syncPlayerDisplay();});
  const nextWindow=app.waitForEvent('window');await main.locator('#btnMiniWindow').click();const mini=await nextWindow;
  await mini.waitForFunction(()=>document.body.textContent.includes('Одна аудиосессия'));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),2);
  assert.equal(await mini.locator('audio,video').count(),0);
  await mini.evaluate(async()=>{for(const [command,value] of [['toggle'],['next'],['previous'],['seek',65],['volume',.35],['like']])await window.miniPlayer.command(command,value);});
  await main.waitForFunction(()=>window.miniCommands.length===6);
  assert.deepEqual(await main.evaluate(()=>window.miniCommands),[['togglePlay',undefined],['next',undefined],['prev',undefined],['seekToTime',65],['setVolume',.35],['like']]);
  assert.equal(await mini.evaluate(async()=>{try{await window.miniPlayer.command('volume',2);return false;}catch{return true;}}),true);
  assert.equal(await mini.evaluate(async()=>{try{await window.miniPlayer.command('execute','anything');return false;}catch{return true;}}),true);
  await mini.evaluate(()=>window.miniPlayer.command('pin'));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('mini-player.html')).isAlwaysOnTop()),false);
  await main.evaluate(()=>window.playerApp.player.currentTrack.title='Обновлённый трек');await main.evaluate(()=>window.playerApp.ui.interfaceV2.publishMini(true));await mini.waitForFunction(()=>document.body.textContent.includes('Обновлённый трек'));
  await mini.close();assert.equal(await main.evaluate(()=>window.playerApp.player.isPlaying),true);
  console.log('Mini-player shares the main session, updates live, validates commands, pins independently and closes without stopping playback');
 }finally{await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
