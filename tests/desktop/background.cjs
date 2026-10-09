const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-background-'));
 const app=await _electron.launch({args:['.','--user-data-dir='+profile]});
 try{
  const window=await app.firstWindow();await window.waitForFunction(()=>window.playerApp?.library.db);
  const before=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.close();return {destroyed:w.isDestroyed(),visible:w.isVisible(),windows:BrowserWindow.getAllWindows().length};});
  assert.deepEqual(before,{destroyed:false,visible:false,windows:1});
  const after=await app.evaluate(({app,BrowserWindow})=>{app.emit('second-instance');return BrowserWindow.getAllWindows()[0].isVisible();});
  assert.equal(after,true);console.log('Windows close hides the window, preserves the renderer, and reopening restores it');
 }finally{await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
