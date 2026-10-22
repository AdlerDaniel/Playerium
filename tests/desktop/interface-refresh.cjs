const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-refresh-'));let app;try{
 const source=process.argv.includes('--source');app=await electron.launch({executablePath:path.resolve(source?'node_modules/electron/dist/electron.exe':'dist/win-unpacked/Playerium.exe'),args:[...(source?['.']:[]),`--user-data-dir=${root}`,'--no-sandbox'],timeout:30000});
 const win=await app.firstWindow();const errors=[];win.on('pageerror',e=>errors.push(e.message));await win.waitForFunction(()=>window.playerApp?.ui.interfaceRefresh);
 assert.equal(await app.evaluate(({app})=>app.getVersion()),'1.7.50');
 const liveJob=process.env.PLAYERIUM_LIVE_COVER_JOB;
 if(!liveJob){const image=await win.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=128;c.getContext('2d').fillRect(0,0,128,128);return c.toDataURL('image/webp').split(',')[1];});await win.route('https://aihorde.net/**',r=>r.fulfill({json:r.request().url().includes('/check/')?{done:true}:{generations:[{img:image}]}}));}
 const job={key:'album-generation:__added-artwork',job:liveJob||'persisted-cover-test',started:Date.now(),regenerate:true};
 // An optional real service job exercises recovery in an isolated profile, never in the user's database.
 await win.evaluate(async job=>{const a=window.playerApp;a.albumArt.stop();const t={id:'actual-service-cover',title:'Cover recovery verification',artist:'Playerium'};a.library.tracks.set(t.id,t);await a.library.putInStore('tracks',t);await a.library.putInStore('settings',{...job,retryAt:Date.now()+1800000});a.ui.navigateTo({type:'allTracks',title:'Добавленные'});await a.albumArt.step();},job);
 let cover=await win.evaluate(()=>({url:window.playerApp.library.addedArtwork.coverUrl}));
 const deadline=Date.now()+8*60*1000;
 while(!cover.url&&Date.now()<deadline){console.log('Waiting for the real service:',await win.evaluate(()=>window.playerApp.library.addedArtwork.generationNote));await new Promise(r=>setTimeout(r,20000));await win.evaluate(()=>window.playerApp.albumArt.step());cover=await win.evaluate(()=>({url:window.playerApp.library.addedArtwork.coverUrl}));}
 if(!cover.url)console.log('Cover recovery state:',await win.evaluate(()=>window.playerApp.library.getFromStore('settings','album-generation:__added-artwork')));
 assert.match(cover.url||'',/^data:image\/jpeg/,'The completed real Horde job must be downloaded and decoded by the packaged app');
 await win.reload();await win.waitForFunction(()=>window.playerApp?.ui.interfaceRefresh);assert.match(await win.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl),/^data:image\/jpeg/);
 for(const width of [900,1024,1280]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,800),width);
  const buttons=await win.evaluate(()=>[...document.querySelectorAll('.player-right>button,#btnVolumeIcon,#volumeSliderContainer')].map(n=>{const r=n.getBoundingClientRect();return {id:n.id,x:r.x,y:r.y,w:r.width,h:r.height,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  for(const b of buttons){assert.ok(b.w>=40,b.id);assert.ok(b.hit,b.id+' is covered');assert.ok(b.x+b.w<=width,b.id+' overflows');}
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j];assert.ok(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x),a.id+' overlaps '+b.id);}
 }
 const miniReady=app.waitForEvent('window',{timeout:15000});await win.locator('#btnMiniWindow').click();const mini=await miniReady;await mini.waitForLoadState();assert.equal((await win.locator('#btnMiniWindow svg').boundingBox()).width,20);
 await win.screenshot({path:'build/interface150-packaged.png'});assert.deepEqual(errors,[]);console.log('Packaged 1.7.50: '+(liveJob?'real service':'fixture')+' cover recovered and retained after restart; volume, device, queue, cinema and mini-player controls do not overlap; mini window opened.');
 }finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200}).catch(e=>console.warn('Temporary test profile cleanup:',e.code));}})().catch(e=>{console.error(e);process.exitCode=1;});
