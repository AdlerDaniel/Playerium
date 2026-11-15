import {icons} from './design-icons.js';
import {mountCover} from './artwork.js';
import {trackVolume} from './track-edits.js';

async function readArtwork(file){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>20*1024*1024)throw Error('Выберите PNG, JPEG или WebP размером до 20 МБ.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Изображение слишком большое.');
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob||blob.size>4*1024*1024)throw Error('Не удалось сохранить обложку. Выберите другое изображение.');return blob;
 }finally{URL.revokeObjectURL(url);}
}

export function openTrackEditor(ui,track){
 ui.dismissTrackMenu?.();ui.dismissSurface?.();ui.closeContextMenu();
 const opener=document.activeElement,root=document.createElement('div');root.className='modal-overlay active form-dialog track-editor';
 root.innerHTML='<form class="modal-card" role="dialog" aria-modal="true" aria-label="Редактировать трек" tabindex="-1"><div class="modal-header"><h2>Редактировать трек</h2><button type="button" class="track-editor-close" aria-label="Закрыть редактор"></button></div><div class="modal-body"><div class="track-editor-artwork"><div class="track-editor-cover"></div><div><button type="button" class="settings-btn-secondary" data-edit-cover>Изменить обложку</button><span>PNG, JPEG или WebP</span></div><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Обложка песни" hidden></div><label class="dialog-field"><span>Название песни</span><input class="search-input" name="title" maxlength="200" required autocomplete="off"></label><label class="dialog-field"><span>Исполнитель</span><input class="search-input" name="artist" maxlength="200" required autocomplete="off"></label><label class="dialog-field"><span>Альбом</span><input class="search-input" name="album" maxlength="200" autocomplete="off"></label><div class="track-editor-volume"><label for="trackEditorVolume">Громкость песни <output for="trackEditorVolume"></output></label><input id="trackEditorVolume" name="volume" type="range" min="0" max="200" step="1" aria-label="Громкость песни"><div><span>Только для этой песни в приложении</span><button type="button" data-reset-volume>Сбросить</button></div></div><p class="track-editor-error" role="alert" hidden></p><p class="track-editor-note">Изменения сохраняются в Playerium. Исходный аудиофайл остаётся без изменений.</p></div><div class="modal-footer"><button type="button" class="settings-btn-secondary dialog-cancel">Отмена</button><button type="submit" class="settings-btn-primary">Сохранить</button></div></form>';
 const form=root.firstElementChild,cover=root.querySelector('.track-editor-cover'),picker=form.querySelector('input[type=file]'),upload=form.querySelector('[data-edit-cover]'),range=form.elements.volume,output=form.querySelector('output'),error=form.querySelector('[role=alert]'),save=form.querySelector('[type=submit]');
 form.querySelector('.track-editor-close').innerHTML=icons.close;
 for(const field of ['title','artist','album'])form.elements[field].value=track[field]||'';
 range.value=Math.round(trackVolume(track)*100);output.value=range.value+'%';mountCover(cover,track,true);
 let busy=false,reading=false,done=false,selectedCover=null,previewUrl=null,generation=0;
 document.body.append(root);const states=[...document.body.children].filter(node=>node!==root&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>[node,node.inert]);for(const [node] of states)node.inert=true;
 const showError=message=>{error.textContent=message||'';error.hidden=!message;};
 const close=()=>{if(busy||done)return;done=true;generation++;ui.player.previewTrackVolume(null);if(previewUrl)URL.revokeObjectURL(previewUrl);root.remove();for(const [node,inert] of states)if(node.isConnected)node.inert=inert;if(ui.dismissSurface===close)ui.dismissSurface=null;opener?.isConnected&&opener.focus({preventScroll:true});};ui.dismissSurface=close;
 const volume=()=>{output.value=range.value+'%';ui.player.previewTrackVolume(track.id,Number(range.value));};range.oninput=volume;form.querySelector('[data-reset-volume]').onclick=()=>{range.value=100;volume();};
 upload.onclick=()=>{if(!busy)picker.click();};picker.onchange=async()=>{const file=picker.files?.[0];if(!file||busy)return;const current=++generation;reading=true;upload.disabled=true;save.disabled=true;upload.setAttribute('aria-busy','true');showError('');
  try{const blob=await readArtwork(file);if(done||current!==generation)return;selectedCover=blob;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);mountCover(cover,{...track,pictureUrl:previewUrl,pictureUrls:[]},true);}catch(e){if(!done)showError(e.message||'Не удалось открыть обложку.');}finally{if(!done&&current===generation){reading=false;upload.disabled=false;save.disabled=false;upload.setAttribute('aria-busy','false');picker.value='';}}
 };
 form.onsubmit=async event=>{event.preventDefault();if(busy||reading||done)return;busy=true;showError('');save.disabled=true;save.classList.add('is-loading');save.setAttribute('aria-busy','true');
  try{const changes={title:form.elements.title.value,artist:form.elements.artist.value,album:form.elements.album.value,volume:Number(range.value),...(selectedCover?{coverBlob:selectedCover}:{})};const saved=await ui.library.editTrack(track.id,changes);ui.player.refreshEditedTrack(saved);busy=false;close();ui.showToast('Изменения песни сохранены.','success');}catch(e){showError(e.message||'Не удалось сохранить изменения.');}finally{busy=false;save.disabled=false;save.classList.remove('is-loading');save.setAttribute('aria-busy','false');}
 };
 form.querySelector('.dialog-cancel').onclick=close;form.querySelector('.track-editor-close').onclick=close;root.onclick=event=>{if(event.target===root)close();};root.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab'){const targets=[...form.querySelectorAll('input,button')].filter(node=>!node.disabled&&node.offsetParent!==null),index=targets.indexOf(document.activeElement);if(!targets.length)return;event.preventDefault();targets[(index+(event.shiftKey?-1:1)+targets.length)%targets.length]?.focus();}};
 if(ui.isMobile)form.focus({preventScroll:true});else{form.elements.title.focus();form.elements.title.select();}
 return close;
}
