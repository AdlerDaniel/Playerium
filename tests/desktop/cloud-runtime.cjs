const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{let app;const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-cloud-runtime-'));try{
 const config=path.join(root,'desktop.json');await fs.writeFile(config,JSON.stringify({installed:{client_id:'123456789-fixture.apps.googleusercontent.com',client_secret:'fixture-secret'}}));
 app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`,'--no-sandbox']});const win=await app.firstWindow();await win.waitForFunction(()=>window.playerApp?.library.db);
 await app.evaluate(({dialog},config)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[config]}),config);
 assert.equal(await win.evaluate(()=>window.electronAPI.cloudRequest('configure')),true);
 const status=await win.evaluate(()=>window.electronAPI.cloudRequest('status'));assert.equal(status.configured,true);assert.equal(status.connected,false);assert.equal(status.clientSecret,undefined);
 const encrypted=await fs.readFile(path.join(root,'profile','google-drive','account.bin'));assert.equal(encrypted.includes(Buffer.from('fixture-secret')),false);
 await win.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings'}));await win.locator('[data-setup] summary').click();assert.equal(await win.locator('[data-configure]').isVisible(),true);
 const session=await win.evaluate(()=>window.electronAPI.cloudRequest('stage',{ext:'.mp3',size:4}));await win.evaluate(session=>window.electronAPI.cloudRequest('stageChunk',{id:session.id,offset:0,base64:btoa('song')}),session);const staged=await win.evaluate(session=>window.electronAPI.cloudRequest('stageComplete',{id:session.id}),session);const info=await win.evaluate(source=>window.electronAPI.cloudRequest('fingerprint',{source}),staged.source);assert.equal(info.size,4);
 const denied=await win.evaluate(async()=>{try{await window.electronAPI.cloudRequest('fingerprint',{source:'C:\\Windows\\win.ini'});return false;}catch{return true;}});assert.equal(denied,true);
 await fs.unlink(staged.source);console.log('Google Drive configuration import, native credential protection, staging and IPC access checks passed');
 }finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
