const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-polish-'));let app;try{
 app=await electron.launch({executablePath:path.resolve('dist/win-unpacked/Playerium.exe'),args:[`--user-data-dir=${root}`,'--no-sandbox'],timeout:30000});
 const win=await app.firstWindow();await win.waitForFunction(()=>window.playerApp?.ui.interfaceV2);const errors=[];win.on('pageerror',e=>errors.push(e.message));
 assert.equal(await win.locator('#btnActivity,#btnMobileActivity,.app-brand').count(),0);
 assert.equal(await win.locator('#btnMiniWindow').count(),0);assert.equal(app.windows().length,1);
 await win.screenshot({path:'build/desktop-interface-polish.png'});assert.deepEqual(errors,[]);console.log('Packaged Windows: startup, removed controls, single-window layout passed');
 }finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
