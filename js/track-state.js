import {icons} from './design-icons.js';

export function decorateTrackState(ui,row,track,forceBusy=false){
  let status=row.querySelector('.track-inline-state');if(!status){status=document.createElement('button');status.type='button';status.className='track-inline-state';row.querySelector('.track-col-duration')?.prepend(status);}
  const busy=forceBusy||ui.music?.downloads.has(track.id),error=ui.trackDownloadErrors?.get(track.id),state=busy?'loading':track.unavailable?'unavailable':error?'error':!track.catalog?'saved':'catalog';
  const progress=ui.experience?.progressStates.get(track.id),percent=progress?.total>0?Math.max(0,Math.min(100,Math.round(progress.done/progress.total*100))):null;
  const label=busy?`Сохранение${percent===null?'…':`: ${percent}%`}`:track.unavailable?'Нет доступа. Выбрать папку снова':error?'Не удалось сохранить. Повторить':!track.catalog?'Сохранено на устройстве':'';
  if(status.dataset.state!==state){status.innerHTML=busy?'<span class="inline-spinner" aria-hidden="true"></span>':state==='saved'?'<span aria-hidden="true">✓</span>':state==='error'||state==='unavailable'?'<span aria-hidden="true">!</span>':'';status.dataset.state=state;}
  status.hidden=state==='catalog';status.title=label;status.setAttribute('aria-label',label);status.setAttribute('aria-busy',String(!!busy));status.style.setProperty('--download-percent',`${percent??0}%`);status.disabled=busy||state==='saved';
  status.onclick=e=>{e.stopPropagation();if(state==='unavailable')ui.triggerFolderPicker();else if(state==='error')row.querySelector('.track-download-btn')?.click();};
  const download=row.querySelector('.track-download-btn');if(download){download.disabled=!!busy;download.setAttribute('aria-busy',String(!!busy));download.title=busy?label:error?'Повторить сохранение':'Скачать';}
  if(busy)row.dataset.downloading='true';else delete row.dataset.downloading;
}

export function refreshTrackStates(ui){
  for(const row of document.querySelectorAll('.track-row')){const track=ui.library.getTrackById(row.dataset.trackId)||ui.interfaceTracks?.get(row.dataset.trackId);if(track)decorateTrackState(ui,row,track);}
}
