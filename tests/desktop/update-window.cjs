const {_electron}=require('playwright'),{createPackage}=require('@electron/asar');
const {prepareHelper}=require('../../desktop-update-helper');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const assert=require('node:assert/strict');
(async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-update-window-'));let app,parent;console.log('Preparing packaged helper runtime');
 try{
  const src=path.join(folder,'app');await fs.mkdir(src);
  await fs.writeFile(path.join(src,'package.json'),JSON.stringify({name:'playerium-helper-test',version:'1.0.0',main:'main.js'}));
  await fs.writeFile(path.join(src,'main.js'),`require('./desktop-update-helper').startHelper(process.argv[process.argv.indexOf('--playerium-update-helper')+1]).catch(e=>{console.error(e);require('electron').app.exit(1);});`);
  await fs.copyFile(path.resolve('desktop-update-helper.js'),path.join(src,'desktop-update-helper.js'));
  const archive=path.join(folder,'app.asar');await createPackage(src,archive);
  const helper=await prepareHelper(folder,path.resolve('node_modules/electron/dist/electron.exe'),archive);
  const source=path.join(folder,'source.exe'),target=path.join(folder,'target.exe'),marker=path.join(folder,'restarted.txt');
  const cs=path.join(folder,'fixture.cs');await fs.writeFile(cs,`using System.IO;class Fixture{static void Main(){File.WriteAllText(@"${marker}","restarted");}}`);
  await new Promise((resolve,reject)=>{const p=spawn(path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/out:'+source,cs],{windowsHide:true,stdio:'ignore'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error('fixture compile '+c)));});
  await fs.copyFile(source,target);
  parent=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
  const config=path.join(folder,'update.json'),result=path.join(folder,'result.json');
  await fs.writeFile(config,JSON.stringify({parentId:parent.pid,source,target,portable:true,result,digest:createHash('sha256').update(await fs.readFile(source)).digest('hex')}));
  app=await _electron.launch({executablePath:helper,args:['--playerium-update-helper',config,'--user-data-dir='+path.join(folder,'profile')]});
  console.log('Helper process launched');
  const window=await app.firstWindow();await window.waitForFunction(()=>document.getElementById('state')?.textContent==='Завершение работы Playerium');
  assert.equal(await window.title(),'');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
  await window.screenshot({path:path.resolve('build/update-install-window.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());assert.equal(window.isClosed(),false);
  parent.kill();await new Promise(resolve=>parent.once('exit',resolve));
  await new Promise((resolve,reject)=>{let n=0;const timer=setInterval(async()=>{if(await fs.stat(marker).catch(()=>null)){clearInterval(timer);resolve();}else if(n++>100){clearInterval(timer);reject(Error('Restart marker missing'));}},100);});
  assert.equal(JSON.parse(await fs.readFile(result,'utf8')).state,'complete');
  console.log('Packaged Windows helper window stays visible through parent shutdown and automatically restarts the replacement');
 }finally{
  if(parent&&!parent.killed)parent.kill();if(app&&app.process().exitCode===null)await app.close().catch(()=>{});
  for(let n=0;n<10;n++){try{await fs.rm(folder,{recursive:true,force:true});break;}catch(e){if(n===9)throw e;await new Promise(r=>setTimeout(r,200));}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
