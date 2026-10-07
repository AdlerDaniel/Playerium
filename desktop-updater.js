const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const REPO = 'AdlerDaniel/Playerium';
function versionParts(value) { return /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null; }
function newer(a,b) {
  const x=versionParts(a),y=versionParts(b);if(!x||!y)return false;
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;
}
function safeURL(value, api = false) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Недопустимый адрес обновления');
  const valid=api ? u.hostname==='api.github.com' && u.pathname.startsWith(`/repos/${REPO}/releases/`)
    : (u.hostname==='github.com' && u.pathname.startsWith(`/${REPO}/releases/download/`))
      || ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname);
  if(!valid)throw Error('Недопустимый источник обновления');return u.href;
}
async function request(fetcher,url,api=false) {
  for(let i=0;i<6;i++) {
    safeURL(url,api);
    const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(api?30000:600000),headers:api?{Accept:'application/vnd.github+json'}:{}});
    if([301,302,303,307,308].includes(response.status)) {
      const next=new URL(response.headers.get('location'),url).href;await response.body?.cancel();url=next;continue;
    }
    if(!response.ok)throw Error('Не удалось скачать обновление. Попробуйте снова.');return response;
  }
  throw Error('Слишком много перенаправлений загрузки');
}
const ps = value => `'${String(value).replace(/'/g,"''")}'`;
function helperScript({parentId,source,target,portable,result,digest}) {
  return `$ErrorActionPreference='Stop'
$source=${ps(source)}; $target=${ps(target)}; $result=${ps(result)}
function Report($state,$message) { @{state=$state;message=$message} | ConvertTo-Json -Compress | Set-Content -LiteralPath $result -Encoding UTF8 }
function FileHash($file) {
  $stream=[IO.File]::OpenRead($file); $sha=[Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
try {
  Wait-Process -Id ${Number(parentId)} -Timeout 120 -ErrorAction SilentlyContinue
  if(Get-Process -Id ${Number(parentId)} -ErrorAction SilentlyContinue) { throw 'Не удалось закрыть Playerium' }
  if((FileHash $source) -ne ${ps(digest)}) { throw 'Файл обновления повреждён' }
  ${portable ? `
  $next=$target+'.new-'+[guid]::NewGuid().ToString('N'); $backup=$target+'.previous'
  Copy-Item -LiteralPath $source -Destination $next
  if((FileHash $next) -ne ${ps(digest)}) { throw 'Не удалось скопировать обновление' }
  if(Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup }
  for($attempt=0;;$attempt++) {
    try { [IO.File]::Replace($next,$target,$backup); break }
    catch { if($attempt -ge 60) { throw }; Start-Sleep -Milliseconds 500 }
  }
  Report 'complete' ''
  Start-Process -FilePath $target -WindowStyle Hidden
  Remove-Item -LiteralPath $backup -ErrorAction SilentlyContinue
  ` : `
  $installerArgs=@('/S','--updated','--force-run',${ps('"/D='+path.dirname(target)+'"')})
  $installer=Start-Process -FilePath $source -ArgumentList $installerArgs -Wait -PassThru -WindowStyle Hidden
  if($installer.ExitCode -ne 0) { throw 'Установка обновления не завершена' }
  Report 'complete' ''
  `}
  Remove-Item -LiteralPath $source -ErrorAction SilentlyContinue
} catch {
  Report 'failed' $_.Exception.Message
  if(Test-Path -LiteralPath $target) { Start-Process -FilePath $target -WindowStyle Hidden }
}`;
}

class DesktopUpdater {
  constructor({app,fetcher=fetch,launcher=spawn,onState=()=>{},env=process.env}) {
    Object.assign(this,{app,fetcher,launcher,onState,env});this.busy=false;
  }
  async getStatus() {
    try {
      const file=path.join(this.app.getPath('userData'),'update-result.json');
      const status=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
      await fs.rm(file,{force:true});return status;
    }catch{return null;}
  }
  async install({latestVersion,repo=REPO}={}) {
    if(this.busy)return {started:true};
    if(repo!==REPO||!newer(latestVersion,this.app.getVersion()))throw Error('Это обновление недоступно');
    if(!this.app.isPackaged||process.platform!=='win32')throw Error('Обновление доступно в установленной версии Playerium для Windows');
    this.busy=true;let source;
    try {
      this.onState({state:'downloading',percent:0});
      const release=await (await request(this.fetcher,`https://api.github.com/repos/${REPO}/releases/tags/v${latestVersion}`,true)).json();
      if(release.draft||release.prerelease||release.tag_name!==`v${latestVersion}`)throw Error('Обновление ещё не опубликовано');
      const portable=Boolean(this.env.PORTABLE_EXECUTABLE_FILE);
      const asset=release.assets?.find(a=>a.name.toLowerCase().endsWith('.exe') && (/setup/i.test(a.name)!==portable));
      if(!asset||asset.size<=0||asset.size>1024*1024*1024||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw Error('Файл обновления не найден или не прошёл проверку');
      const digest=asset.digest.slice(7).toLowerCase();
      const folder=await fs.mkdtemp(path.join(this.app.getPath('temp'),'playerium-update-'));
      source=path.join(folder,'Playerium-update.exe');
      const response=await request(this.fetcher,asset.browser_download_url);
      const file=await fs.open(source,'wx');let size=0,last=-1;const hash=createHash('sha256');
      try {
        for await(const chunk of response.body) {
          size+=chunk.length;if(size>asset.size)throw Error('Некорректный размер обновления');
          hash.update(chunk);await file.writeFile(chunk);
          const percent=Math.floor(size*100/asset.size);
          if(percent!==last){last=percent;this.onState({state:'downloading',percent});}
        }
      }finally{await file.close();}
      if(size!==asset.size||hash.digest('hex')!==digest)throw Error('Файл обновления повреждён. Попробуйте снова.');
      const result=path.join(this.app.getPath('userData'),'update-result.json');
      const target=portable?this.env.PORTABLE_EXECUTABLE_FILE:this.app.getPath('exe');
      const script=helperScript({parentId:process.pid,source,target,portable,result,digest});
      const child=this.launcher(path.join(this.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
        ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
        {detached:true,stdio:'ignore',windowsHide:true});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      child.unref();this.onState({state:'installing'});
      setTimeout(()=>this.app.quit(),200);
      return {started:true};
    }catch(error){this.busy=false;if(source)await fs.rm(source,{force:true}).catch(()=>{});this.onState({state:'failed',message:error.message});throw error;}
  }
}
module.exports={DesktopUpdater,helperScript,safeURL,newer,request};
