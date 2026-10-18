// Preparing durable audio copies is independent of navigation and playback.
export function installAudioPreparation(app){
 const {library,ui}=app;let timer,statusTimer,running=false,again=false,nativeSignature='',checking=null;const done=new Set(),listeners=new Set();
 const state={supported:!!(window.AndroidBridge?.musicRequest||window.electronAPI?.prepareAudio),total:0,ready:0,failed:0,pending:0,active:false,checked:false,error:null};
 const tracks=()=>library.getTracks().filter(t=>!t.catalog);
 const notify=()=>listeners.forEach(listener=>listener({...state,running}));
 async function refresh(){
  if(checking)return checking;
  checking=(async()=>{try{
   let result;if(window.AndroidBridge?.musicRequest)result=await app.music.request('normalizationStatus',{uris:[...new Set(tracks().map(t=>t.nativeUri).filter(Boolean))]});
   else if(window.electronAPI?.audioPreparationStatus)result=await window.electronAPI.audioPreparationStatus([...new Set(tracks().map(t=>t.filePath).filter(Boolean))]);
   let changed=false;
   if(window.AndroidBridge&&result?.records){const byUri=new Map(tracks().map(t=>[t.nativeUri,t]));for(const record of result.records){
    const track=byUri.get(record.uri);if(!track||!record.audioKey||!record.normalization?.profile)continue;
    const signature=JSON.stringify([record.audioKey,record.normalization,record.size,record.lastModified]);if(track.normalizationStamp===signature&&track.fileSize===record.size&&track.lastModified===record.lastModified&&track.audioKey===record.audioKey)continue;
    Object.assign(track,{audioKey:record.audioKey,normalization:record.normalization,fileSize:record.size,lastModified:record.lastModified,normalizationStamp:signature});delete track.normalizationGain;delete track.normalizationKey;
    await library.putInStore('tracks',track);changed=true;
   }}
   Object.assign(state,result||{},{checked:true,error:null});if(changed)library.onLibraryChanged?.();
   clearTimeout(statusTimer);if(window.AndroidBridge&&(state.pending||state.active)&&!document.hidden)statusTimer=setTimeout(refresh,3000);
  }catch(error){state.error='Не удалось проверить готовность музыки. Попробуйте ещё раз.';}finally{notify();checking=null;}})();
  return checking;
 }
 async function scan(manual=false){
  if(manual){done.clear();nativeSignature='';}
  if(running){again=true;return;}running=true;notify();
  try{
   const available=tracks().filter(t=>!t.unavailable);
   if(window.AndroidBridge?.musicRequest){
    const uris=[...new Set(available.map(t=>t.nativeUri).filter(Boolean))].sort();const signature=JSON.stringify(available.filter(t=>t.nativeUri).map(t=>[t.nativeUri,t.fileSize,t.lastModified]).sort());
    if(signature!==nativeSignature&&uris.length){await app.music.request('prepareLibrary',{uris,retryNow:manual});nativeSignature=signature;}
   }else if(window.electronAPI?.prepareAudio){
    const files=available.filter(t=>t.filePath);let failed=0;
    for(const track of files){
     const key=`${track.filePath}|${track.fileSize}|${track.lastModified}`;if(done.has(key))continue;
     try{await window.electronAPI.prepareAudio(track.filePath);done.add(key);}catch(error){failed++;console.warn('Audio preparation failed',track.id,error);}
     await new Promise(resolve=>setTimeout(resolve,30));
    }
    if(failed)ui.showToast(`Не удалось подготовить громкость ${failed} треков. Проверьте свободное место и доступ к файлам.`,'error');
   }
  }catch(error){state.error='Не удалось запустить нормализацию. Проверьте доступ к файлам и свободное место.';console.warn('Audio preparation',error);}finally{running=false;await refresh();if(again){again=false;schedule();}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(scan,1500);}
 const previous=library.onLibraryChanged;library.onLibraryChanged=(...args)=>{previous?.(...args);schedule();};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 schedule();return {scan,schedule,refresh,state,subscribe(listener){listeners.add(listener);listener({...state,running});return ()=>listeners.delete(listener);}};
}
