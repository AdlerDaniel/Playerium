import {icons} from './design-icons.js';
const avatarKey='playerium_custom_avatar';
export function customAvatar(){try{const value=localStorage.getItem(avatarKey)||'';return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<700000?value:'';}catch{return '';}}

export function updateProfileAvatar(){
 if(!globalThis.document?.querySelectorAll)return;
 for(const host of document.querySelectorAll('.profile-avatar,.account-avatar')){
  const url=customAvatar();
  if(host.dataset.photoUrl===url&&host.childElementCount)continue;
  host.dataset.photoUrl=url;host.innerHTML=icons.artist;
  if(url){const image=document.createElement('img');image.alt='';image.referrerPolicy='no-referrer';image.src=url;
   image.onerror=()=>{if(host.dataset.photoUrl===url)host.innerHTML=icons.artist;};host.replaceChildren(image);}
 }
}
export function renderProfileSettings(ui,container){
 const section=document.createElement('section');section.className='settings-section account-settings';
 section.innerHTML='<h2 class="settings-section-title">Профиль</h2><div class="settings-card account-card"><div class="account-avatar" aria-hidden="true"></div></div>';
 container.querySelector('.settings-header')?.after(section);const card=section.querySelector('.account-card');
 const row=document.createElement('div');row.className='profile-image-settings';
 row.innerHTML='<span class="settings-label">Иконка профиля</span><div><button class="settings-btn-secondary" data-avatar-upload>Выбрать изображение</button><button class="settings-btn-secondary" data-avatar-reset>Сбросить иконку</button></div><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Изображение профиля" hidden>';
 card.append(row);const input=row.querySelector('input'),upload=row.querySelector('[data-avatar-upload]'),reset=row.querySelector('[data-avatar-reset]');
 reset.disabled=!customAvatar();upload.onclick=()=>input.click();reset.onclick=()=>{try{localStorage.removeItem(avatarKey);updateProfileAvatar();reset.disabled=true;}catch{ui.showToast('Не удалось сохранить настройку профиля.','error');}};
 input.onchange=async()=>{const file=input.files?.[0];if(!file)return;upload.disabled=true;upload.setAttribute('aria-busy','true');let image,url;
  try{
   if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>20*1024*1024)throw Error('Выберите PNG, JPEG или WebP размером до 20 МБ.');
   url=URL.createObjectURL(file);image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Изображение слишком большое.');
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const size=Math.min(image.naturalWidth,image.naturalHeight);canvas.getContext('2d').drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,256,256);
   localStorage.setItem(avatarKey,canvas.toDataURL('image/png'));updateProfileAvatar();reset.disabled=false;ui.showToast('Иконка профиля сохранена.');
  }catch(e){ui.showToast(e.message||'Не удалось загрузить изображение.','error');}finally{if(url)URL.revokeObjectURL(url);input.value='';upload.disabled=false;upload.setAttribute('aria-busy','false');}
 };
 updateProfileAvatar();
}
