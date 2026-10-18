const fs=require('node:fs/promises'),path=require('node:path');
const {resolveName}=require('./app-branding');
let windowsRegion;
function systemName(app,{platform=process.platform}={}){
  if(platform==='win32'&&windowsRegion===undefined){
    try{
      const output=require('node:child_process').execFileSync('reg.exe',['query','HKCU\\Control Panel\\International\\Geo','/v','Name'],{encoding:'utf8',windowsHide:true,timeout:1500});
      windowsRegion=output.match(/REG_SZ\s+([A-Z]{2})/i)?.[1]||'';
    }catch{windowsRegion='';}
  }
  return resolveName(app.getPreferredSystemLanguages()[0]||app.getSystemLocale(),windowsRegion||app.getLocaleCountryCode());
}
async function localizeShortcuts({app,shell,name}){
  if(process.platform!=='win32'||!app.isPackaged)return;
  const exe=app.getPath('exe'),opposite=name==='Playerium'?'Проигрыватель':'Playerium';
  const folders=[app.getPath('desktop'),path.join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs')];
  if(process.env.ProgramData)folders.push(path.join(process.env.ProgramData,'Microsoft/Windows/Start Menu/Programs'));
  for(const folder of folders){
    const old=path.join(folder,opposite+'.lnk'),target=path.join(folder,name+'.lnk');
    try{
      const shortcut=shell.readShortcutLink(old);
      if(path.resolve(shortcut.target).toLowerCase()!==path.resolve(exe).toLowerCase())continue;
      // Never overwrite a shortcut belonging to another application.
      try{
        await fs.access(target);
        const existing=shell.readShortcutLink(target);
        if(path.resolve(existing.target).toLowerCase()===path.resolve(exe).toLowerCase())await fs.unlink(old);
        continue;
      }catch(error){if(error.code!=='ENOENT')continue;}
      await fs.rename(old,target);
    }catch{/* Read-only/common shortcuts can still be renamed by the installer. */}
  }
}
module.exports={systemName,localizeShortcuts};
