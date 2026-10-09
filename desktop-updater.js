const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const {prepareHelper}=require('./desktop-update-helper');

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

class DesktopUpdater {
  constructor({app,fetcher=fetch,launcher=spawn,onState=()=>{},env=process.env,prepare=prepareHelper,waitReady}) {
    Object.assign(this,{app,fetcher,launcher,onState,env,prepare});this.busy=false;this.state=null;
    this.waitReady=waitReady|| (async file=>{for(let n=0;n<150;n++){if(await fs.stat(file+'.ready').catch(()=>null))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Не удалось запустить окно установки. Приложение осталось открыто.');});
  }
  publish(state){this.state=state;this.onState(state);}
  async getStatus() {
    if(this.busy)return this.state;
    try {
      const file=path.join(this.app.getPath('userData'),'update-result.json');
      const status=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
      if(status.state==='complete'&&typeof status.cacheFolder==='string'){
        const cleanup=path.resolve(status.cacheFolder),temp=path.resolve(this.app.getPath('temp'));
        if(path.dirname(cleanup)===temp&&/^playerium-update-[\w-]+$/.test(path.basename(cleanup)))
          fs.rm(cleanup,{recursive:true,force:true,maxRetries:8,retryDelay:500}).catch(()=>{});
      }
      await fs.rm(file,{force:true});return status;
    }catch{return null;}
  }
  async install({latestVersion,repo=REPO}={}) {
    if(this.busy)return {started:true};
    if(repo!==REPO||!newer(latestVersion,this.app.getVersion()))throw Error('Это обновление недоступно');
    if(!this.app.isPackaged||process.platform!=='win32')throw Error('Обновление доступно в установленной версии Playerium для Windows');
    this.busy=true;let source;
    try {
      this.publish({state:'downloading',percent:0});
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
          if(percent!==last){last=percent;this.publish({state:'downloading',percent});}
        }
      }finally{await file.close();}
      if(size!==asset.size||hash.digest('hex')!==digest)throw Error('Файл обновления повреждён. Попробуйте снова.');
      const result=path.join(this.app.getPath('userData'),'update-result.json');
      const target=portable?this.env.PORTABLE_EXECUTABLE_FILE:this.app.getPath('exe');
      this.publish({state:'verifying',message:'Подготовка установки'});
      const helper=await this.prepare(folder,this.app.getPath('exe'),this.app.getAppPath());
      const config=path.join(folder,'update.json');
      await fs.writeFile(config,JSON.stringify({parentId:process.pid,source,target,portable,result,digest}));
      const child=this.launcher(helper,
        ['--playerium-update-helper',config],
        {detached:true,stdio:'ignore',windowsHide:true});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      child.unref();await this.waitReady(config);this.publish({state:'installing'});
      setTimeout(()=>this.app.quit(),200);
      return {started:true};
    }catch(error){this.busy=false;if(source)await fs.rm(source,{force:true}).catch(()=>{});this.publish({state:'failed',message:error.message});throw error;}
  }
}
module.exports={DesktopUpdater,safeURL,newer,request};
