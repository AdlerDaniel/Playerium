import {icons} from './design-icons.js';

export function updateProfileAvatar(status={}){
 if(!globalThis.document?.querySelectorAll)return;
 for(const host of document.querySelectorAll('.profile-avatar,.account-avatar')){
  const url=status.connected&&/^https:\/\//i.test(status.photoUrl||'')?status.photoUrl:'';
  if(host.dataset.photoUrl===url&&host.childElementCount)continue;
  host.dataset.photoUrl=url;host.innerHTML=icons.artist;
  if(url){const image=document.createElement('img');image.alt='';image.referrerPolicy='no-referrer';image.src=url;
   image.onerror=()=>{if(host.dataset.photoUrl===url)host.innerHTML=icons.artist;};host.replaceChildren(image);}
 }
}
