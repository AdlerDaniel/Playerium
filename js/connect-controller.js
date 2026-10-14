import {cloudView} from './cloud-model.js';
import {showSurfaceMenu} from './surface-menu.js';
const deviceIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" d="M3 4h12v11H3zM5 19h8m-4-4v4m8-11h5v13h-5z"/></svg>';
const actions=new Set(['play','pause','next','previous','seek','volume','shuffle','repeat','transfer']);
const queueWindow=(keys,key)=>{const start=Math.max(0,Math.min(keys.indexOf(key)-100,keys.length-200));return keys.slice(start,start+200);};
export class ConnectController {
 constructor(cloud,player,ui){Object.assign(this,{cloud,player,ui});this.id=cloud.device;this.devices=[];this.selected=this.id;this.original={};this.executing=false;this.busy=false;this.commandTail=Promise.resolve();}
 async init(){
  this.info={name:window.AndroidBridge?'Этот телефон':'Этот компьютер',type:window.AndroidBridge?'phone':'desktop'};
  const footer=document.querySelector('.player-right');this.addButton(footer,'btnPlaybackDevices');
  const fs=document.getElementById('mobileFsSlider')?.parentElement;this.addButton(fs,'btnMobilePlaybackDevices');
  this.installControls();document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.tick();});this.interval=setInterval(()=>this.tick(),3000);if(this.cloud.available)await this.cloud.refreshStatus();this.tick();
 }
 addButton(parent,id){if(!parent)return;const button=document.createElement('button');button.id=id;button.className='playback-device-button';button.setAttribute('aria-label','Выбрать устройство воспроизведения');button.innerHTML=deviceIcon;button.onclick=e=>{e.stopPropagation();this.open(button);};parent.prepend(button);}
 model(){return cloudView(this.cloud.events||[]);}
 key(track){return track?.cloudKey||Object.keys(this.cloud.links||{}).find(key=>this.cloud.links[key].localId===track?.id)||'';}
  snapshot(){const p=this.player,keys=p.queue.map(t=>this.key(t)).filter(Boolean),index=keys.indexOf(this.key(p.currentTrack)),start=Math.max(0,Math.min(index-100,keys.length-200));return {track:p.currentTrack?{key:this.key(p.currentTrack),title:p.currentTrack.title,artist:p.currentTrack.artist}:null,queue:keys.slice(start,start+200),playing:!!p.isPlaying,position:p.getCurrentTime(),duration:p.getDuration(),volume:p.volume,shuffle:p.isShuffle,repeat:p.repeatMode};}
 async tick(){if(this.busy||!this.cloud.status.connected||window.AndroidBridge&&document.hidden)return;this.busy=true;
  try{if(!this.named){this.info=await this.cloud.request('connectInfo',{id:this.id});this.named=true;}
   if(window.AndroidBridge&&this.selected===this.id&&this.player.nativePlayback){const keys=this.player.queue.map(t=>this.key(t)).join();if(this.nativeKeys!==keys){this.nativeKeys=keys;this.player.syncNativeQueue?.(this.player.isPlaying,false,this.player.getCurrentTime());}}
   const local=this.selected===this.id?this.snapshot():this.localSnapshot;
   await this.cloud.request('connectPublish',{id:this.id,...this.info,state:local||{playing:false}});
   const data=await this.cloud.request('connectScan',{id:this.id});this.devices=(data.devices||[]).filter(d=>typeof d.id==='string'&&d.id!==this.id&&Date.now()-d.seenAt<45000&&d.seenAt<Date.now()+30000);
   if(data.command)await this.receive(data.command);
   if(this.selected!==this.id){const remote=this.devices.find(d=>d.id===this.selected);if(remote)this.display(remote);}
   this.error=null;
  }catch(error){this.error=error.message;}finally{this.busy=false;this.updateButtons();}
 }
 installControls(){
   const map={play:'play',pause:'pause',next:'next',prev:'previous',seekToTime:'seek',setVolume:'volume',toggleShuffle:'shuffle',toggleRepeat:'repeat',togglePlay:'toggle'};
  for(const [method,action] of Object.entries(map)){if(typeof this.player[method]!=='function')continue;this.original[method]=this.player[method].bind(this.player);this.player[method]=(...args)=>{if(this.executing||this.selected===this.id)return this.original[method](...args);let actual=action,value=args[0];if(action==='toggle')actual=this.remote.state.playing?'pause':'play';if(action==='shuffle')value=!this.remote.state.shuffle;if(action==='repeat')value=['off','all','one'][(['off','all','one'].indexOf(this.remote.state.repeat)+1)%3];this.control(actual,value).catch(e=>this.ui.showToast(e.message,'error'));};}
  this.original.playTrack=this.player.playTrack.bind(this.player);this.player.playTrack=(track,index=0,queue=null,context=null)=>{if(this.executing||this.selected===this.id)return this.original.playTrack(track,index,queue,context);const tracks=queue||[track],state={track:{key:this.key(track)},queue:queueWindow(tracks.map(t=>this.key(t)).filter(Boolean),this.key(track)),position:0,playing:true,volume:this.remote.state.volume,shuffle:this.remote.state.shuffle,repeat:this.remote.state.repeat};return this.control('transfer',null,state);};
  for(const method of ['getCurrentTime','getDuration']){this.original[method]=this.player[method].bind(this.player);this.player[method]=()=>{if(this.selected===this.id||this.executing)return this.original[method]();if(method==='getDuration')return this.remote?.state.duration||0;const state=this.remote?.state||{};return Math.min(state.duration||Infinity,(state.position||0)+(state.playing?Math.max(0,Date.now()-this.remote.seenAt)/1000:0));};}
  this.original.applyNativeState=this.player.applyNativeState.bind(this.player);this.player.applyNativeState=state=>{if(this.selected!==this.id&&!this.executing){this.pendingNative=state;return;}return this.original.applyNativeState(state);};
 }
 async receive(command){if(!actions.has(command.action)||command.target!==this.id||Date.now()-command.issuedAt>90000)return;
  this.restoreLocal();this.executing=true;
   try{if(command.action==='transfer')await this.startTransfer(command.state,command.issuedAt+20000);
   else if(command.action==='shuffle'){if(this.player.isShuffle!==!!command.value)this.original.toggleShuffle();}
    else if(command.action==='repeat'){for(let i=0;i<3&&this.player.repeatMode!==command.value;i++)this.original.toggleRepeat();}
   else{const method={play:'play',pause:'pause',next:'next',previous:'prev',seek:'seekToTime',volume:'setVolume'}[command.action];await this.original[method]?.(command.value);}
   await this.cloud.request('connectAck',{id:this.id,commandId:command.id});
   await this.cloud.request('connectPublish',{id:this.id,...this.info,state:this.snapshot()});
  }finally{this.executing=false;}
 }
 async startTransfer(state,expires=Date.now()+20000){if(!state?.track?.key)throw Error('Трек ещё не синхронизирован.');const deadline=expires,view=this.model(),keys=state.queue?.length?state.queue:[state.track.key],queue=[];
  for(const key of keys){if(Date.now()>deadline)throw Error('Передача заняла слишком много времени. Повторите после синхронизации песен.');let local=this.cloud.links?.[key]&&this.cloud.library.getTrackById(this.cloud.links[key].localId);if(!local){const remote=view.tracks.get(key);if(!remote?.data||remote.deleted)continue;const file=await this.cloud.request('download',{key,track:remote.data});local=await this.cloud.library.addDownloaded(file,null);local.cloudKey=key;this.cloud.links[key]={localId:local.id,removed:false};await this.cloud.save();}queue.push(local);}
  if(Date.now()>deadline)throw Error('Передача заняла слишком много времени. Повторите после синхронизации песен.');const index=queue.findIndex(t=>this.key(t)===state.track.key);if(index<0)throw Error('Песня пока недоступна на устройстве.');await this.original.playTrack(queue[index],index,queue,{type:'playlist',title:'С другого устройства'});this.original.seekToTime(Math.max(0,Number(state.position)||0));this.original.setVolume(Math.max(0,Math.min(1,Number.isFinite(state.volume)?state.volume:.8)));if(this.player.isShuffle!==!!state.shuffle)this.original.toggleShuffle();for(let i=0;i<3&&this.player.repeatMode!==(state.repeat||'off');i++)this.original.toggleRepeat();if(!state.playing)this.original.pause();if(state.playing&&this.player.nativePlayback){const expectedId=queue[index].id,readyUntil=Date.now()+5000;while(Date.now()<readyUntil){const native=JSON.parse(window.AndroidBridge.getPlaybackState()||'{}');this.original.applyNativeState(native);if(native.id===expectedId&&this.player.isPlaying)return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Не удалось запустить песню на устройстве.');}
 }
 async send(target,action,value,state){if(!actions.has(action))throw Error('Неизвестная команда.');const command={id:crypto.randomUUID(),target,issuedAt:Date.now(),action,value,state};if(action==='transfer'){const view=this.model();command.media=(state?.queue||[state?.track?.key]).map(key=>({key,track:view.tracks.get(key)?.data})).filter(entry=>entry.track).slice(0,200);}await this.cloud.request('connectSend',{id:target,command});
  const deadline=Date.now()+25000;while(Date.now()<deadline){const data=await this.cloud.request('connectScan',{id:this.id});const device=(data.devices||[]).find(d=>d.id===target);if(device?.ack===command.id){this.devices=(data.devices||[]).filter(d=>d.id!==this.id);return device;}await new Promise(resolve=>setTimeout(resolve,700));}throw Error('Устройство не ответило. Откройте Playerium на нём и попробуйте снова.');
 }
 control(action,value,state){const target=this.selected;const task=this.commandTail.catch(()=>{}).then(async()=>{const device=await this.send(target,action,value,state);if(this.selected===target)this.display(device);});this.commandTail=task;return task;}
 saveLocal(){if(this.localProperties)return;this.localSnapshot=this.snapshot();this.localProperties={};for(const key of ['currentTrack','queue','queueIndex','originalQueue','isPlaying','volume','isShuffle','repeatMode','playbackContext'])this.localProperties[key]=this.player[key];}
 restoreLocal(){if(this.localProperties){Object.assign(this.player,this.localProperties);this.localProperties=null;}this.selected=this.id;this.remote=null;if(this.pendingNative){this.original.applyNativeState(this.pendingNative);this.pendingNative=null;}}
 display(device){this.remote=device;const state=device.state||{},view=this.model();const local=key=>this.cloud.library.getTracks().find(t=>this.key(t)===key)||{id:'remote_'+key,cloudKey:key,...(view.tracks.get(key)?.data||{})};this.player.queue=(state.queue||[]).map(local);this.player.currentTrack=state.track?.key?local(state.track.key):null;this.player.queueIndex=this.player.queue.findIndex(t=>this.key(t)===state.track?.key);this.player.isPlaying=!!state.playing;this.player.volume=state.volume??.8;this.player.isShuffle=!!state.shuffle;this.player.repeatMode=state.repeat||'off';this.ui.syncPlayerDisplay();this.updateButtons();}
 async select(target){if(target===this.selected)return;const source=this.selected,state=source===this.id?this.snapshot():this.remote?.state;if(!state?.track?.key){if(target!==this.id)throw Error('Сначала включите синхронизированный трек.');this.restoreLocal();this.ui.syncPlayerDisplay();return;}
  if(target===this.id){this.restoreLocal();this.executing=true;try{await this.startTransfer(state);await this.send(source,'pause');}finally{this.executing=false;}this.ui.syncPlayerDisplay();return;}
  const device=await this.send(target,'transfer',null,state);
  if(source===this.id){this.original.pause();this.saveLocal();this.localSnapshot.playing=false;}else await this.send(source,'pause');
  this.selected=target;this.display(device);
 }
 updateButtons(){for(const button of document.querySelectorAll('.playback-device-button')){button.classList.toggle('remote-active',this.selected!==this.id);button.title=this.selected===this.id?'Устройство воспроизведения':`Воспроизводится: ${this.remote?.name||'другое устройство'}`;}}
 open(anchor){const items=[{label:window.AndroidBridge?'Этот телефон':'Этот компьютер',icon:deviceIcon,selected:this.selected===this.id,action:()=>this.select(this.id)}];for(const device of this.devices)items.push({label:`${device.name}${device.state?.playing?' · играет':''}`,icon:deviceIcon,selected:this.selected===device.id,action:()=>this.select(device.id)});if(!this.cloud.status.connected)items.push({label:'Подключить устройства',icon:deviceIcon,action:()=>this.ui.navigateTo({type:'settings',title:'Настройки'})});else if(!this.devices.length)items.push({label:'Обновить список устройств',icon:deviceIcon,action:()=>this.tick()});showSurfaceMenu(this.ui,{title:'Где воспроизводить',items,anchor});}
}
