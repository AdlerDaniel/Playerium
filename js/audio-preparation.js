// Preparing durable audio copies is independent of navigation and playback.
export function installAudioPreparation(app){
 const {library,ui}=app;let timer,running=false,again=false,nativeSignature='';const done=new Set();
 async function scan(){
  if(running){again=true;return;}running=true;
  try{
   const tracks=library.getTracks().filter(t=>!t.unavailable&&!t.catalog);
   if(window.AndroidBridge?.musicRequest){
    const uris=[...new Set(tracks.map(t=>t.nativeUri).filter(Boolean))].sort();const signature=JSON.stringify(tracks.filter(t=>t.nativeUri).map(t=>[t.nativeUri,t.fileSize,t.lastModified]).sort());
    if(signature!==nativeSignature&&uris.length){await app.music.request('prepareLibrary',{uris});nativeSignature=signature;}
   }else if(window.electronAPI?.prepareAudio){
    const files=tracks.filter(t=>t.filePath);let failed=0;
    for(const track of files){
     const key=`${track.filePath}|${track.fileSize}|${track.lastModified}`;if(done.has(key))continue;
     try{await window.electronAPI.prepareAudio(track.filePath);done.add(key);}catch(error){failed++;console.warn('Audio preparation failed',track.id,error);}
     await new Promise(resolve=>setTimeout(resolve,30));
    }
    if(failed)ui.showToast(`Не удалось подготовить громкость ${failed} треков. Проверьте свободное место и доступ к файлам.`,'error');
   }
  }catch(error){console.warn('Audio preparation',error);}finally{running=false;if(again){again=false;schedule();}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(scan,1500);}
 const previous=library.onLibraryChanged;library.onLibraryChanged=(...args)=>{previous?.(...args);schedule();};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 schedule();return {scan,schedule};
}
