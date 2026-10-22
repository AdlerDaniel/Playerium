const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-polish-'));let app;try{
 app=await electron.launch({executablePath:path.resolve('dist/win-unpacked/Playerium.exe'),args:[`--user-data-dir=${root}`,'--no-sandbox'],timeout:30000});
 const win=await app.firstWindow();await win.waitForFunction(()=>window.playerApp?.ui.interfaceV2);const errors=[];win.on('pageerror',e=>errors.push(e.message));
 assert.equal(await win.locator('#btnActivity,#btnMobileActivity,.app-brand').count(),0);
 const icon=await win.locator('#btnMiniWindow svg').boundingBox();assert.equal(icon.width,20);assert.equal(icon.height,20);
 const miniReady=app.waitForEvent('window',{timeout:15000});await win.locator('#btnMiniWindow').click();const mini=await miniReady;await mini.waitForLoadState();await win.waitForFunction(()=>window.playerApp.ui.interfaceV2.miniActive);assert.equal(app.windows().length,2);
 await win.screenshot({path:'build/desktop-interface-polish.png'});assert.deepEqual(errors,[]);console.log('Packaged Windows: startup, removed controls, mini-player icon and mini window passed');
 }finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
