import {RealtimeSync} from './realtime-sync.js';
import {cloudView,mergeOperations} from './cloud-model.js';
export class CloudSync {
 constructor(library,ui,transport=null){
  this.library=library;this.ui=ui;this.transport=transport;this.realtime=new RealtimeSync(this);this.pending=new Map();this.count=0;this.busy=false;this.status={connected:false};this.events=[];this.outbox=[];this.device=localStorage.getItem('playerium_cloud_device')||crypto.randomUUID();localStorage.setItem('playerium_cloud_device',this.device);
  window.onCloudResponse=message=>{const task=this.pending.get(message.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(message.id);message.error?task.reject(Error(message.error)):task.resolve(message.data);};
 }
 get available(){return !!(this.transport||window.electronAPI?.cloudRequest||window.AndroidBridge?.cloudRequest);}
 request(operation,payload={}) {return operation==='pull'?this.realtime.pullLibrary(payload):this.nativeRequest(operation,payload);}
 nativeRequest(operation,payload={}) {
  if(this.transport)return this.transport(operation,payload);
  if(window.electronAPI?.cloudRequest)return window.electronAPI.cloudRequest(operation,payload);
  if(!window.AndroidBridge?.cloudRequest)return Promise.reject(Error('Синхронизация доступна в приложении для ПК и Android.'));
  const id=`cloud-${Date.now()}-${++this.count}`;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Не удалось завершить синхронизацию. Попробуйте ещё раз.'));},660000);this.pending.set(id,{resolve,reject,timer});window.AndroidBridge.cloudRequest(id,operation,JSON.stringify(payload));});
 }
 async init(){
  const state=await this.library.getFromStore('settings','cloudSync');this.states=state?.value||{};
   const previous=this.library.onLibraryChanged;this.library.onLibraryChanged=()=>{this.captureDeletions();previous?.();if(this.busy)this.resync=true;else this.schedule();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.schedule(0);});window.addEventListener('online',()=>this.schedule(0));
  if(this.available){this.refreshStatus().catch(error=>{this.error=error.message;this.changed?.();});this.schedule(1000);this.interval=setInterval(()=>this.schedule(0),30000);}
 }
 async refreshStatus(){this.status=await this.request('status');if(this.status.connected&&this.status.realtimeAvailable)this.realtime.start(this.status.account).catch(()=>{});else this.realtime.reset();this.changed?.();return this.status;}
 schedule(delay=800){clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync().catch(error=>{this.error=error.message;this.changed?.();}),delay);}
 async save(){this.states[this.account]={events:this.events,outbox:this.outbox,links:this.links,cursor:this.cursor,shadow:this.shadow};await this.library.putInStore('settings',{key:'cloudSync',value:this.states});}
 operation(kind,fields){const clock=[...this.events,...this.outbox].reduce((n,o)=>Math.max(n,o.clock),0)+1;const op={version:1,id:crypto.randomUUID(),device:this.device,clock,kind,...fields};this.outbox.push(op);return op;}
 async connect(){await this.request('connect');await this.refreshStatus();await this.sync();}
 async disconnect(){this.realtime.reset();await this.request('disconnect');this.status={connected:false};this.changed?.();}
 async sync(){
  if(this.busy||!this.available)return;this.busy=true;this.error=null;this.failures=[];this.changed?.();
  try{
   await this.refreshStatus();if(!this.status.connected)return;
   const account=this.status.account;if(!account)throw Error('Не удалось определить аккаунт Google.');
   if(this.account!==account){this.account=account;const state=this.states[account]||{};this.events=state.events||[];this.outbox=state.outbox||[];this.links=state.links||{};this.cursor=state.cursor||null;this.shadow=state.shadow||{};
    if(!this.cursor){const initial=await this.request('pull',{});this.events=mergeOperations(this.events,initial.events||[]);this.cursor=initial.cursor;}
   }
   // Capture edits before applying remote state, so an offline edit is not overwritten.
   await this.capture();
   const pulled=await this.request('pull',{cursor:this.cursor});this.events=mergeOperations(this.events,pulled.events||[]);this.cursor=pulled.cursor;
   this.outbox=this.outbox.filter(op=>!this.events.some(remote=>remote.id===op.id));await this.save();
    let published=false;
    for(const op of [...this.outbox]){
     try{
    const link=this.links[op.key];
    if(op.kind==='track'){
     const track=link&&this.library.getTrackById(link.localId);if(!track){this.outbox=this.outbox.filter(p=>p.id!==op.id);continue;}
     await this.request('publish',{operation:op,source:await this.source(track),cover:await this.cover(track)});
     }else await this.request('publish',{operation:op});
     if(op.kind!=='track')try{await this.realtime.publish([op]);}catch{}
     published=true;
     }catch(error){this.failures.push(error.message);}
   }
    if(this.status.canFlush&&(published||this.status.pending))await this.request('flush');
    const again=await this.request('pull',{cursor:this.cursor});this.events=mergeOperations(this.events,again.events||[]);this.cursor=again.cursor;
   this.outbox=this.outbox.filter(op=>!this.events.some(remote=>remote.id===op.id));await this.save();
   // Preserve edits made while native transfers were running.
   await this.capture();
   await this.apply(cloudView(mergeOperations(this.events,this.outbox.filter(op=>op.kind!=='track'))));
   this.lastSync=Date.now();await this.save();
    if(this.failures.length)throw Error(`Не завершено операций: ${this.failures.length}. ${this.failures[0]}`);
  }finally{this.busy=false;globalThis.document?.querySelectorAll('.loading-rows[data-cloud-loading]').forEach(node=>node.remove());this.changed?.();if(this.resync){this.resync=false;this.schedule(1000);}}
 }
 captureDeletions(){if(!this.account||!this.links||!this.shadow)return;if(!Object.values(this.links).some(link=>link.localId&&!link.removed&&!this.library.getTrackById(link.localId))&&!Object.entries(this.shadow).some(([id,old])=>!old.deleted&&!this.library.getPlaylistById(id)))return;const view=cloudView(mergeOperations(this.events,this.outbox.filter(op=>op.kind!=='track')));let changed=false;
  for(const [key,link] of Object.entries(this.links))if(link.localId&&!this.library.getTrackById(link.localId)&&!link.removed&&!view.tracks.get(key)?.deleted){this.operation('delete',{key});link.removed=true;changed=true;}
  for(const [id,old] of Object.entries(this.shadow))if(!this.library.getPlaylistById(id)&&!old.deleted&&!view.playlists.get(id)?.deleted){this.operation('playlist-delete',{playlist:id});old.deleted=true;changed=true;}
  if(changed)this.save().catch(error=>{this.error=error.message;});
 }
 async cover(track){
  if(!track.pictureBlob||track.pictureBlob.size>4*1024*1024)return null;
  const bytes=new Uint8Array(await track.pictureBlob.arrayBuffer()),parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  return {base64:btoa(parts.join('')),mime:track.pictureBlob.type};
 }
 async source(track){
  if(track.cloudSource)return track.cloudSource;
  if(track.filePath||track.nativeUri)return track.filePath||track.nativeUri;
  const blob=await this.library.getAudioFile(track);if(!blob)throw Error(`Не удалось прочитать «${track.title}» для синхронизации.`);
  const extension=(track.fileName||blob.name||'').match(/\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$/i)?.[0]||'.mp3';
  const session=await this.request('stage',{ext:extension.toLowerCase(),size:blob.size});
  for(let offset=0;offset<blob.size;offset+=512*1024){const data=new Uint8Array(await blob.slice(offset,offset+512*1024).arrayBuffer()),parts=[];for(let i=0;i<data.length;i+=32768)parts.push(String.fromCharCode(...data.subarray(i,i+32768)));await this.request('stageChunk',{id:session.id,offset,base64:btoa(parts.join(''))});}
  const result=await this.request('stageComplete',{id:session.id});track.cloudSource=result.source;await this.library.putInStore('tracks',track);return result.source;
 }
 async capture(){
  const view=cloudView(mergeOperations(this.events,this.outbox.filter(op=>op.kind!=='track')));
  for(const [key,link] of Object.entries(this.links))if(link.localId&&!this.library.getTrackById(link.localId)&&!link.removed){this.operation('delete',{key});link.removed=true;}
  for(const track of this.library.getTracks()){
   try{
   let key=Object.keys(this.links).find(k=>this.links[k].localId===track.id);
   if(!key){
    const fingerprint=await this.request('fingerprint',{source:track.cloudSource||await this.source(track)});key=fingerprint.key;
    if(view.tracks.get(key)?.deleted){this.links[key]={localId:track.id,removed:false};continue;}
    this.links[key]={localId:track.id,removed:false};
    if(!view.tracks.get(key)?.data&&!this.outbox.some(op=>op.key===key&&op.kind==='track')){
      this.operation('track',{key,track:{...this.metadata(track),ext:fingerprint.ext,size:fingerprint.size,audioId:'pending'}});
    }
   }
   const link=this.links[key],data=this.metadata(track),signature=JSON.stringify(data),remote=view.tracks.get(key),coverSignature=await this.coverSignature(track);
   if(remote?.data&&!remote.deleted&&!this.outbox.some(op=>op.key===key&&op.kind==='track')&&((link.metadata!==undefined&&link.metadata!==signature)||(!remote.data.album&&data.album)||(link.coverSignature!==undefined&&link.coverSignature!==coverSignature)||(!remote.data.coverId&&coverSignature))){this.operation('track',{key,track:{...remote.data,...data}});}
   link.coverSignature=coverSignature;
   link.metadata=signature;
   if(link.liked===undefined){if(track.liked)this.operation('like',{key,liked:true});link.liked=!!track.liked;}else if(link.liked!==!!track.liked){this.operation('like',{key,liked:!!track.liked});link.liked=!!track.liked;}
   }catch(error){this.failures?.push(error.message);}
  }
  for(const [id,old] of Object.entries(this.shadow))if(!this.library.getPlaylistById(id)&&!old.deleted){this.operation('playlist-delete',{playlist:id});old.deleted=true;}
  for(const pl of this.library.getPlaylists().filter(p=>!p.isFolderPlaylist)){
   const keys=pl.trackIds.map(id=>Object.keys(this.links).find(key=>this.links[key].localId===id)).filter(Boolean),old=this.shadow[pl.id];
   if(!old||old.name!==pl.name||old.description!==(pl.description||'')||old.coverType!==(pl.coverType||'mosaic')||old.coverUrl!==(pl.coverUrl||null))this.operation('playlist',{playlist:pl.id,name:pl.name,description:pl.description||'',coverType:pl.coverType||'mosaic',coverUrl:pl.coverUrl||null});
   for(const key of new Set([...keys,...(old?.keys||[])]))if(keys.includes(key)!==(old?.keys||[]).includes(key))this.operation('member',{playlist:pl.id,key,present:keys.includes(key)});
   this.shadow[pl.id]={name:pl.name,description:pl.description||'',coverType:pl.coverType||'mosaic',coverUrl:pl.coverUrl||null,keys};
  }
  await this.save();
 }
 metadata(track){return {title:track.title||'Без названия',artist:track.artist||'Неизвестный исполнитель',album:track.album||'',duration:track.duration||0,year:track.year||null,genre:track.genre||null,trackNo:track.trackNo||null,isrc:track.isrc||null};}
 async coverSignature(track){if(!track.pictureBlob)return '';this.coverSignatures||=new WeakMap();if(this.coverSignatures.has(track.pictureBlob))return this.coverSignatures.get(track.pictureBlob);let hash=2166136261;const bytes=new Uint8Array(await track.pictureBlob.arrayBuffer());for(const byte of bytes)hash=Math.imul(hash^byte,16777619);const signature=track.pictureBlob.type+':'+bytes.length+':'+(hash>>>0);this.coverSignatures.set(track.pictureBlob,signature);return signature;}
 async apply(view){
  this.applying=true;
  try{
   const downloads=[...view.tracks].filter(([key,remote])=>remote.data&&!remote.deleted&&!this.library.getTrackById(this.links[key]?.localId));
   this.progress={done:0,total:downloads.length};this.changed?.();
   if(window.AndroidBridge&&downloads.length)await this.request('queueDownloads',{tracks:downloads.map(([key,remote])=>({key,track:remote.data}))});
   for(const [key,remote] of view.tracks){
    try{
     if(this.outbox.some(op=>op.kind==='delete'&&op.key===key))remote.deleted=true;
    let link=this.links[key],track=link&&this.library.getTrackById(link.localId);
    if(remote.deleted){if(track){if(this.ui.player.currentTrack?.id===track.id)this.ui.player.stop();await this.library.removeTrack(track.id);this.ui.player.removeTrack?.(track.id);}await this.request('removeLocal',{key});if(link)link.removed=true;await this.save();continue;}
    if(!remote.data)continue;
    if(!track){
     const file=await this.request('download',{key,track:remote.data});this.library.blockedSources?.delete(file.folderSource);track=await this.library.addDownloaded(file,null);
     if(file.coverBase64){const bytes=Uint8Array.from(atob(file.coverBase64),c=>c.charCodeAt(0));track.pictureBlob=new Blob([bytes],{type:file.coverMime||'image/jpeg'});track.pictureUrl=this.library.coverURL(track.id,track.pictureBlob);track.cloudCoverId=remote.data.coverId;}
     this.links[key]=link={localId:track.id,removed:false};
    }
    if(remote.data.coverId&&track.cloudCoverId!==remote.data.coverId&&!this.outbox.some(op=>op.kind==='track'&&op.key===key)){try{const cover=await this.request('cover',{id:remote.data.coverId});if(cover.base64){const bytes=Uint8Array.from(atob(cover.base64),c=>c.charCodeAt(0));track.pictureBlob=new Blob([bytes],{type:remote.data.coverMime||'image/jpeg'});track.pictureUrl=this.library.coverURL(track.id,track.pictureBlob);track.cloudCoverId=remote.data.coverId;}}catch(error){this.failures?.push(error.message);}}
    const pending=this.outbox.filter(op=>op.kind==='track'&&op.key===key).sort((a,b)=>b.clock-a.clock)[0];
    track.cloudKey=key;Object.assign(track,this.metadata(pending?.track||remote.data));track.liked=remote.liked;link.liked=remote.liked;link.removed=false;link.metadata=JSON.stringify(this.metadata(track));await this.library.putInStore('tracks',track);
    link.coverSignature=await this.coverSignature(track);
    await this.save();
    if(downloads.some(([k])=>k===key)){this.progress.done++;if(this.ui.queueLibraryRefresh)this.ui.queueLibraryRefresh({skipSettings:true});else{this.ui.renderSidebar?.();if(this.ui.currentView?.type!=='settings')this.ui.refreshCurrentView?.();}this.changed?.();}
    }catch(error){this.failures?.push(`${remote.data?.title||key}: ${error.message}`);await this.save();}
   }
   for(const remote of view.playlists.values()){
    if(this.outbox.some(op=>op.kind==='playlist-delete'&&op.playlist===remote.id))remote.deleted=true;
    if(remote.deleted){if(this.library.getPlaylistById(remote.id))await this.library.deletePlaylist(remote.id);this.shadow[remote.id]={deleted:true};continue;}
    if(!remote.meta)continue;
    const keys=[...remote.members].filter(([key,op])=>op.present&&!view.tracks.get(key)?.deleted).map(([key])=>key),trackIds=keys.map(key=>this.links[key]?.localId).filter(id=>id&&this.library.getTrackById(id));
    const pl={id:remote.id,name:remote.name,description:remote.description,coverType:remote.coverType,coverUrl:remote.coverUrl,trackIds,createdAt:Date.now(),updatedAt:Date.now()};this.library.playlists.set(pl.id,pl);await this.library.putInStore('playlists',pl);this.shadow[pl.id]={name:pl.name,description:pl.description,coverType:pl.coverType,coverUrl:pl.coverUrl,keys};
   }
   this.ui.renderSidebar?.();if(this.ui.currentView?.type!=='settings')this.ui.refreshCurrentView?.();this.ui.syncPlayerDisplay?.();
  }finally{this.applying=false;}
 }
 get trash(){return [...cloudView(this.events).tracks.values()].filter(t=>t.deleted&&t.data);}
 async restore(key){const track=cloudView(this.events).tracks.get(key);if(!track?.deleted)return;this.operation('restore',{key,deletes:[...track.deletes]});await this.save();await this.sync();}
}
