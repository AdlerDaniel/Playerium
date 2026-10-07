const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {constants}=require('node:fs');
const {isInside}=require('./desktop-files');
const PROVIDERS=new Set(['youtubeMusic','youtubeAudio','soundcloud']);
function sourceURL(value) {
  const u=new URL(value);
  const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port || !(h==='www.youtube.com'||h==='music.youtube.com'||h==='youtube.com'||h==='youtu.be'||h==='soundcloud.com'||h.endsWith('.bandcamp.com')||h==='audius.co'||h==='archive.org'))throw Error('Недопустимая запись');
  return u.href;
}
function catalogURL(provider,query) {
  const q=encodeURIComponent(query);
  switch(provider) {
    case 'itunes':return `https://itunes.apple.com/search?term=${q}&entity=song&limit=35&country=US`;
    case 'itunesUA':return `https://itunes.apple.com/search?term=${q}&entity=song&limit=35&country=UA`;
    case 'deezer':return `https://api.deezer.com/search?q=${q}&limit=35`;
    case 'musicbrainz':return `https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=20`;
    case 'audius':return `https://discoveryprovider.audius.co/v1/tracks/search?query=${q}&limit=20&app_name=Playerium`;
    case 'bandcamp':return `https://bandcamp.com/search?q=${q}&item_type=t`;
    default:throw Error('Недопустимый запрос');
  }
}
function downloadError(error) {
  const message=String(error?.message||'');
  if(/^(Не удалось|Полная версия|Полная запись|Аудиосервис|Недостаточно|Нет доступа|Не найден)/.test(message))return message;
  if(/ENOSPC|no space/i.test(message))return 'Недостаточно места для сохранения трека.';
  if(/EACCES|EPERM|permission denied/i.test(message))return 'Нет доступа к папке музыки. Выберите её ещё раз.';
  if(/DRM|protected|premium|subscription|only.*preview/i.test(message))return 'Полная запись защищена от скачивания. Другую доступную запись найти не удалось.';
  if(/403|429|451|geo.?restrict|not available in your|sign in|captcha|blocked/i.test(message))return 'Аудиосервис ограничил доступ к этой записи. Попробуйте другую сеть или VPN.';
  if(/timeout|timed out|network|connection|resolve|certificate|tunnel|SSL/i.test(message))return 'Не удалось соединиться с аудиосервисом. Проверьте сеть и настройки VPN.';
  if(/ENOENT|ffmpeg.*not found/i.test(message))return 'Не найден компонент загрузки. Обновите Playerium.';
  return 'Полная версия этой записи недоступна для скачивания. Попробуйте позже.';
}
class DesktopMusic {
  constructor({app,fetcher=fetch,authorize,onRoot=async()=>{},onProgress=()=>{}}) {
    Object.assign(this,{app,fetcher,authorize,onRoot,onProgress});this.active=new Map();this.pending=new Map();this.requests=new Map();
    this.tools=app.isPackaged?path.join(process.resourcesPath,'music-tools'):path.join(__dirname,'build/music-tools');
    this.manifestFile=path.join(app.getPath('userData'),'music-downloads.json');this.manifest=null;this.storeChain=Promise.resolve();
  }
  async records(){if(!this.loadingRecords)this.loadingRecords=(async()=>{try{this.manifest=JSON.parse(await fs.readFile(this.manifestFile,'utf8'));}catch{this.manifest={};}return this.manifest;})();return this.loadingRecords;}
  async saveRecords(){this.storeChain=this.storeChain.catch(()=>{}).then(async()=>{const temp=this.manifestFile+'.new';await fs.writeFile(temp,JSON.stringify(this.manifest));await fs.rename(temp,this.manifestFile);});return this.storeChain;}
  run(args,id,timeout=45000) {
    return new Promise((resolve,reject)=>{
      const child=spawn(path.join(this.tools,'yt-dlp.exe'),['--ignore-config','--no-warnings','--impersonate','chrome','--socket-timeout','15','--retries','1','--js-runtimes',`node:${process.execPath}`,'--ffmpeg-location',this.tools,...args],
        {windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe']});
      this.active.set(id,child);let out='',error='';const timer=setTimeout(()=>{this.cancel(id);reject(Error('Не удалось соединиться с аудиосервисом. Время ожидания истекло.'));},timeout);
      child.stdout.on('data',data=>{out+=data;if(out.length>12*1024*1024){out=out.slice(0,12*1024*1024);this.cancel(id);}});
      child.stderr.on('data',data=>{error=(error+data).slice(-3000);});
      const done=()=>{clearTimeout(timer);if(this.active.get(id)===child)this.active.delete(id);};
      child.on('error',e=>{done();reject(e);});
      child.on('close',code=>{done();if(code===0 || (args.includes('--ignore-errors')&&out.trim()))resolve(out.trim());else reject(Error(error || 'Не удалось получить запись'));});
    });
  }
  cancel(id){this.requests.get(id)?.abort();const child=this.active.get(id);if(!child)return;
    if(process.platform==='win32')spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else child.kill();
  }
  async request(operation,payload,id) {
    if(!/^[\w-]{1,100}$/.test(id))throw Error('Недопустимый запрос');
    if(operation==='catalog') {
      const query=String(payload.query||'').trim().slice(0,200);if(query.length<2)return null;
      const controller=new AbortController();this.requests.set(id,controller);const timer=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await this.fetcher(catalogURL(payload.provider,query),{signal:controller.signal,headers:{'User-Agent':'Playerium/1.6.0 (https://github.com/AdlerDaniel/Playerium)'}});
        if(!response.ok)throw Error('Не удалось получить результаты');
        const text=await response.text();if(text.length>4*1024*1024)throw Error('Некорректный ответ');
        return payload.provider==='bandcamp'?text:JSON.parse(text);
      }finally{clearTimeout(timer);this.requests.delete(id);}
    }
    if(operation==='search') {
      if(!PROVIDERS.has(payload.provider))throw Error('Недопустимый запрос');
      const query=String(payload.query||'').trim().slice(0,200);if(query.length<2)return {entries:[]};
      if(payload.provider==='youtubeMusic') {
        const controller=new AbortController();this.requests.set(id,controller);const timer=setTimeout(()=>controller.abort(),20000);
        try {
          if(!this.musicClientVersion) {
            const home=await this.fetcher('https://music.youtube.com/',{signal:controller.signal});
            if(!home.ok)throw Error('HTTP '+home.status);
            this.musicClientVersion=(await home.text()).match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1];
          }
          if(!this.musicClientVersion)throw Error('Не удалось получить результаты поиска.');
          const response=await this.fetcher('https://music.youtube.com/youtubei/v1/search?prettyPrint=false',{
            method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Origin':'https://music.youtube.com'},
            body:JSON.stringify({context:{client:{clientName:'WEB_REMIX',clientVersion:this.musicClientVersion,hl:'en'}},query,params:'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'})});
          if(!response.ok)throw Error('HTTP '+response.status);
          const text=await response.text();if(text.length>4*1024*1024)throw Error('Некорректный ответ');return JSON.parse(text);
        }catch(error){this.musicClientVersion=null;throw Error(downloadError(error));}
        finally{clearTimeout(timer);this.requests.delete(id);}
      }
      const url=payload.provider==='youtubeMusic'?`https://music.youtube.com/search?q=${encodeURIComponent(query)}#songs`:payload.provider==='soundcloud'?`scsearch12:${query}`:`ytsearch12:${query} official audio`;
      return JSON.parse(await this.run(['--flat-playlist','--dump-single-json','--playlist-end','12','--ignore-errors','--skip-download','--',url],id));
    }
    if(operation==='download') {
      if(!/^song_[\da-f]+$/.test(payload.track?.id||''))throw Error('Недопустимая запись');
      if(this.pending.has(payload.track.id))return this.pending.get(payload.track.id);
      const task=this.download(payload,id);this.pending.set(payload.track.id,task);
      try{return await task;}catch(error){throw Error(downloadError(error));}finally{this.pending.delete(payload.track.id);}
    }
    if(operation==='delete') {
      const records=await this.records(),record=records[payload.downloadId];if(!record)return true;
      const root=await this.authorize(record.folderSource).catch(()=>null);
      if(root!==record.folderSource || path.dirname(record.fullPath)!==root)throw Error('Не удалось удалить файл. Выберите папку музыки ещё раз.');
      const real=await this.authorize(record.fullPath).catch(()=>null);
      if(real!==record.fullPath && await fs.lstat(record.fullPath).catch(()=>null))throw Error('Не удалось удалить файл. Выберите папку музыки ещё раз.');
      await fs.rm(record.fullPath,{force:true});
      for(const suffix of ['.playerium.json','.jpg']){
        const sidecar=await this.authorize(record.fullPath+suffix).catch(()=>null);
        if(sidecar===record.fullPath+suffix)await fs.rm(sidecar,{force:true});
      }
      delete records[payload.downloadId];await this.saveRecords();return true;
    }
    if(operation==='restore') {
      const result=[];for(const record of Object.values(await this.records()))if(await fs.stat(record.fullPath).catch(()=>null)){await this.onRoot(record.folderSource);result.push(record);}
      return result;
    }
    throw Error('Недопустимая операция');
  }
  async descriptor(record) {
    const stat=await fs.stat(record.fullPath);
    return {...record,name:path.basename(record.fullPath),size:stat.size,lastModified:stat.mtimeMs};
  }
  async download({track,folderSource},id) {
    const records=await this.records();
    if(records[track.id] && await fs.stat(records[track.id].fullPath).catch(()=>null)){await this.onRoot(records[track.id].folderSource);return this.descriptor(records[track.id]);}
    const root=folderSource?await this.authorize(folderSource):path.join(this.app.getPath('music'),'Playerium');
    await fs.mkdir(root,{recursive:true});await this.onRoot(root);
    const staging=await fs.mkdtemp(path.join(this.app.getPath('temp'),'playerium-song-'));
    let committed,lastError;
    try {
      const {audioCandidate,sameRecording,isVariant}=await import('./js/music-match.js');
      for(const source of (track.sources||[]).slice(0,8)) {
        try {
          for(const file of await fs.readdir(staging))await fs.rm(path.join(staging,file),{recursive:true,force:true});
          this.onProgress({id:track.id,state:'downloading'});
          const url=sourceURL(source.url);
          const info=JSON.parse(await this.run(['--dump-single-json','--skip-download','-f','bestaudio[ext=m4a]/bestaudio/best','--',url],id,60000));
          const actual=audioCandidate(info,source.provider);
          if(!actual || isVariant(info.title) || !sameRecording(track,actual))continue;
          // Metadata chosen from the recording catalog is embedded into the audio.
          for(const key of ['title','artist','album','genre','isrc'])if(track[key]){info[key]=String(track[key]).slice(0,500);info['meta_'+key]=info[key];}
          if(track.artist)info.artists=[info.artist];
          info.track=info.title;if(track.year){info.release_year=track.year;info.meta_date=String(track.year);info.release_date=String(track.year)+'0101';}if(track.trackNo)info.track_number=track.trackNo;
          if(track.pictureUrl && /^https:\/\/(?:[^/]+\.)?(?:mzstatic\.com|dzcdn\.net|ytimg\.com|ggpht\.com|googleusercontent\.com|bcbits\.com|audius\.co|sndcdn\.com)\//i.test(track.pictureUrl)){info.thumbnail=track.pictureUrl;info.thumbnails=[{url:track.pictureUrl,id:'cover'}];}
          const meta=path.join(staging,'recording.json');await fs.writeFile(meta,JSON.stringify(info));
          const audioFormat=['wav','aac'].includes(info.ext)?'m4a':'best';
          const downloadArgs=['--load-info-json',meta,'--no-playlist','--quiet','--no-progress','--max-filesize','256M','-f','bestaudio[ext=m4a]/bestaudio/best','-x','--audio-format',audioFormat,'--audio-quality','0','--embed-metadata','--embed-thumbnail','--convert-thumbnails','jpg','--write-thumbnail','-o',path.join(staging,'audio.%(ext)s'),'--print','after_move:filepath'];
          let output;
          try{output=await this.run(downloadArgs,id,600000);}catch(error){
            if(!/thumbnail|image|cover|convert.*jpg/i.test(error.message))throw error;
            output=await this.run(downloadArgs.filter(arg=>!['--embed-thumbnail','--convert-thumbnails','jpg','--write-thumbnail'].includes(arg)),id,600000);
          }
          const audio=output.split(/\r?\n/).at(-1);if(!isInside(staging,audio)||!/^audio\.(m4a|mp3|opus|ogg|flac|aac|wav)$/i.test(path.basename(audio)))throw Error('Некорректный файл');
          const name=`${track.artist} - ${track.title}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').slice(0,120).trim();
          const fullPath=path.join(root,`${name} [${track.id.slice(5)}]${path.extname(audio)}`);
          await fs.copyFile(audio,fullPath,constants.COPYFILE_EXCL);committed=fullPath;
          const metadata={title:info.title,artist:info.artist,album:info.album||'',year:info.release_year||'',trackNo:info.track_number||0,genre:info.genre||'',isrc:info.isrc||'',duration:info.duration||track.duration};
          await fs.writeFile(fullPath+'.playerium.json',JSON.stringify(metadata));
          const cover=(await fs.readdir(staging)).find(f=>/^audio.*\.jpg$/i.test(f));if(cover)await fs.copyFile(path.join(staging,cover),fullPath+'.jpg',constants.COPYFILE_EXCL);
          records[track.id]={fullPath,folderSource:root,folderName:path.basename(root),downloadId:track.id,metadata};await this.saveRecords();
          return this.descriptor(records[track.id]);
        }catch(error){if(committed)throw error;lastError=error;}
      }
      throw Error(downloadError(lastError));
    }catch(error){if(committed){for(const suffix of ['','.playerium.json','.jpg'])await fs.rm(committed+suffix,{force:true}).catch(()=>{});}throw error;}
    finally{await fs.rm(staging,{recursive:true,force:true});}
  }
}
module.exports={DesktopMusic,sourceURL,catalogURL,downloadError};
