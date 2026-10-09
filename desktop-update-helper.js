const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function digest(file) { const hash=createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))hash.update(chunk);return hash.digest('hex'); }
function launch(exe,args=[],wait=false) {
  return new Promise((resolve,reject)=>{
    // NSIS requires the final /D= directory to remain unquoted, including spaces.
    const child=spawn(exe,args,{detached:!wait,stdio:'ignore',windowsHide:true,windowsVerbatimArguments:wait});
    child.once('error',reject);
    if(wait)child.once('exit',code=>code===0?resolve():reject(Error(`Установщик завершился с кодом ${code}`)));
    else child.once('spawn',()=>{child.unref();resolve();});
  });
}
async function prepareHelper(folder,exe,appPath) {
  // A separate runtime keeps the status window alive while NSIS replaces the app.
  const runtime=path.join(folder,'helper');await fs.mkdir(runtime,{recursive:true});
  const base=path.dirname(exe),helperExe=path.join(runtime,'Playerium Update.exe');
  for(const entry of await fs.readdir(base,{withFileTypes:true})){
    if(entry.isFile()&&/\.(dll|bin|dat|pak|json)$/i.test(entry.name))await fs.copyFile(path.join(base,entry.name),path.join(runtime,entry.name));
  }
  await fs.copyFile(exe,helperExe);
  await fs.cp(path.join(base,'locales'),path.join(runtime,'locales'),{recursive:true});
  await fs.mkdir(path.join(runtime,'resources'),{recursive:true});
  // Electron treats ASAR paths as virtual directories; copy the archive's raw bytes.
  let archiveFS=fs;try{archiveFS=require('original-fs').promises;}catch{}
  await archiveFS.copyFile(appPath,path.join(runtime,'resources','app.asar'));
  const unpacked=appPath+'.unpacked';if(await fs.stat(unpacked).catch(()=>null))await fs.cp(unpacked,path.join(runtime,'resources','app.asar.unpacked'),{recursive:true});
  return helperExe;
}
async function runUpdate(config,{report=async()=>{},launchProcess=launch,parentAlive=id=>{try{process.kill(id,0);return true;}catch{return false;}}}={}) {
  const {source,target,portable,parentId,result}=config;
  const write=async(state,message='')=>{await fs.writeFile(result,JSON.stringify({state,message,cacheFolder:path.dirname(source)}));await report(state,message);};
  let backup;
  try {
    await report('installing','Завершение работы Playerium');
    for(let n=0;parentAlive(parentId);n++){if(n>=240)throw Error('Не удалось закрыть Playerium');await delay(500);}
    if(await digest(source)!==config.digest)throw Error('Файл обновления повреждён');
    await report('installing','Установка обновления');
    if(portable){
      const next=target+'.new-'+require('node:crypto').randomUUID();backup=target+'.previous-'+require('node:crypto').randomUUID();
      await fs.copyFile(source,next);if(await digest(next)!==config.digest)throw Error('Не удалось скопировать обновление');
      try{await fs.rename(target,backup);await fs.rename(next,target);}catch(e){await fs.rm(next,{force:true});if(await fs.stat(backup).catch(()=>null))await fs.rename(backup,target).catch(()=>{});throw e;}
    }else await launchProcess(source,['/S','--updated','/D='+path.dirname(target)],true);
    if(!(await fs.stat(target).catch(()=>null)))throw Error('Установленное приложение не найдено');
    await report('installing','Запуск Playerium');
    await launchProcess(target,[],false);
    await write('complete');
    if(backup)await fs.rm(backup,{force:true});
    await fs.rm(source,{force:true});
  }catch(error){
    if(backup&&await fs.stat(backup).catch(()=>null)){
      await fs.rm(target,{force:true}).catch(()=>{});await fs.rename(backup,target).catch(()=>{});
    }
    await write('failed','Не удалось завершить обновление: '+error.message);
    await launchProcess(target,[],false).catch(()=>{});
    throw error;
  }
}
async function startHelper(configPath) {
  const {app,BrowserWindow,dialog}=require('electron');
  await app.whenReady();
  const config=JSON.parse(await fs.readFile(configPath,'utf8'));
  if(!Number.isInteger(config.parentId)||config.parentId<=0||!/^[a-f0-9]{64}$/.test(config.digest)||!path.isAbsolute(config.target))throw Error('Некорректное обновление');
  const window=new BrowserWindow({width:450,height:220,resizable:false,minimizable:false,maximizable:false,autoHideMenuBar:true,backgroundColor:'#121212',title:'Обновление Playerium',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  let finished=false;window.on('close',event=>{if(!finished)event.preventDefault();});
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{background:#121212;color:#fff;font:16px system-ui;margin:32px}h1{font-size:22px}.bar{height:5px;background:#333;border-radius:4px;overflow:hidden}.bar:after{content:'';display:block;width:40%;height:100%;background:#1ed760;animation:move 1.5s ease-in-out infinite}@keyframes move{to{transform:translateX(250%)}}@media(prefers-reduced-motion:reduce){.bar:after{animation:none;width:100%}}</style><h1>Обновление Playerium</h1><p id="state" role="status" aria-live="polite">Подготовка установки</p><div class="bar" role="progressbar" aria-label="Установка обновления"></div></html>`));
  await fs.writeFile(configPath+'.ready','ready');
  try{await runUpdate(config,{report:async(state,message)=>window.webContents.executeJavaScript(`document.getElementById('state').textContent=${JSON.stringify(message||'Обновление установлено')}`)});await delay(1200);}
  catch(error){await dialog.showMessageBox(window,{type:'error',title:'Обновление Playerium',message:'Не удалось завершить обновление',detail:error.message,buttons:['Закрыть']});}
  finally{finished=true;app.quit();}
}
module.exports={prepareHelper,runUpdate,startHelper,digest};
