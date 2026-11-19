import {icons} from './design-icons.js';
import {mountCover,retainArtwork} from './artwork.js';

export function renderQueueList(ui,host,upcoming){
 const list=document.createElement('div');
 list.className='queue-list';
 for(const {track,index} of upcoming)list.append(queueRow(ui,track,index,list));
 if(!upcoming.length){
  const empty=document.createElement('p');empty.className='queue-empty';empty.textContent='Очередь пуста. Добавьте треки через меню ⋯.';list.append(empty);
 }
 host.append(list);
 return list;
}

function queueRow(ui,track,index,list){
 const player=ui.player,current=!list,item=document.createElement('div');
 item.className='queue-item'+(current?' current':'');
 if(!current)item.dataset.queueIdx=index;
 item.innerHTML=`<div class="queue-item-thumb"></div><button type="button" class="queue-item-info" aria-label="${current?'Сейчас играет: ':'Воспроизвести: '}${ui.escapeHTML(track.title)}"><span class="queue-item-title">${ui.escapeHTML(track.title)}</span><span class="queue-item-artist">${ui.escapeHTML(track.artist)}</span></button>${current?'<button class="queue-current-toggle"></button>':`<button class="queue-item-remove" aria-label="Удалить из очереди ${ui.escapeHTML(track.title)}">×</button><button class="queue-drag" title="Перетащить" aria-label="Переместить ${ui.escapeHTML(track.title)}. Используйте стрелки вверх и вниз">${icons.drag}</button>`}`;
 mountCover(item.querySelector('.queue-item-thumb'),track,true);
 item.querySelector('.queue-item-info').onclick=()=>current?player.togglePlay():player.playTrack(track,index);
 item.onclick=e=>{if(!e.target.closest('button'))item.querySelector('.queue-item-info').click();};
 if(current)item.querySelector('.queue-current-toggle').onclick=()=>player.togglePlay();
 else {
  item.querySelector('.queue-item-remove').onclick=()=>player.removeFromQueue(index);
  bindDrag(list,item,item.querySelector('.queue-drag'),(to,keyboard)=>{
   const host=list.parentElement;
   player.moveUpcomingTrack(index,to);
   if(keyboard&&host)host.querySelector(`[data-queue-idx="${to}"] .queue-drag`)?.focus({preventScroll:true});
  });
 }
 return item;
}

function bindDrag(list,item,handle,commit){
 let drag=null;
 const rows=()=>[...list.children];
 const animate=(before,row)=>{
  row.reorderAnimation?.cancel();
  const dy=before-row.getBoundingClientRect().top;
  if(dy&&row.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const easing=getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim()||'cubic-bezier(.23,1,.32,1)';
   row.reorderAnimation=row.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:160,easing});
  }
 };
 const reorder=destination=>{
  const old=rows(),at=old.indexOf(item);
  if(at===destination)return;
  const siblings=old.filter(r=>r!==item),before=siblings.map(r=>r.getBoundingClientRect().top);
  // Move the siblings to keep pointer capture on the dragged row.
  if(destination>at)for(const r of old.slice(at+1,destination+1))list.insertBefore(r,item);
  else for(const r of old.slice(destination,at).reverse())list.insertBefore(r,item.nextSibling);
  siblings.forEach((r,i)=>animate(before[i],r));
 };
 const move=y=>{
  const top=list.getBoundingClientRect().top,center=y-drag.offset+item.offsetHeight/2;
  const destination=rows().filter(r=>r!==item&&center>top+r.offsetTop+r.offsetHeight/2).length;
  reorder(destination);
  item.style.transform=`translateY(${y-drag.offset-top-item.offsetTop}px)`;
 };
 handle.onpointerdown=e=>{
  if(e.button!==0||drag)return;
  e.preventDefault();handle.focus({preventScroll:true});
  const order=rows();
  drag={pointer:e.pointerId,order,offset:e.clientY-item.getBoundingClientRect().top,y:e.clientY};
  handle.setPointerCapture(e.pointerId);item.classList.add('dragging');list.classList.add('reordering');
  let scroller=list.parentElement;
  while(scroller&&scroller.scrollHeight<=scroller.clientHeight)scroller=scroller.parentElement;
  drag.scroller=scroller;
  const scroll=()=>{
   if(!drag||!scroller?.isConnected)return;
   const rect=scroller.getBoundingClientRect(),edge=44;
   const speed=drag.y<rect.top+edge?-6:drag.y>rect.bottom-edge?6:0;
   if(speed){const previous=scroller.scrollTop;scroller.scrollTop+=speed;if(previous!==scroller.scrollTop)move(drag.y);}
   drag.frame=requestAnimationFrame(scroll);
  };
  if(scroller)drag.frame=requestAnimationFrame(scroll);
 };
 handle.onpointermove=e=>{if(e.pointerId===drag?.pointer){drag.y=e.clientY;move(e.clientY);}};
 const finish=apply=>{
  if(!drag)return;
  const {order,pointer,frame}=drag;drag=null;cancelAnimationFrame(frame);
  const destination=rows().indexOf(item),original=order.indexOf(item),target=Number(order[destination]?.dataset.queueIdx);
  if(handle.hasPointerCapture(pointer))handle.releasePointerCapture(pointer);
  item.classList.remove('dragging');list.classList.remove('reordering');item.style.transform='';
  if(destination!==original)reorder(original);
  if(apply&&destination!==original)commit(target,false);
 };
 handle.onpointerup=e=>{if(e.pointerId===drag?.pointer)finish(true);};
 handle.onpointercancel=handle.onlostpointercapture=()=>finish(false);
 handle.onkeydown=e=>{
  if(e.key==='Escape'&&drag){e.preventDefault();e.stopPropagation();finish(false);return;}
  if(!['ArrowUp','ArrowDown'].includes(e.key)||drag)return;
  e.preventDefault();
  const r=rows(),other=r[r.indexOf(item)+(e.key==='ArrowUp'?-1:1)];
  if(other)commit(Number(other.dataset.queueIdx),true);
 };
}

export function renderRightQueue(){
 const player=this.player,container=document.getElementById('rightPanelContent');
 delete container.dataset.nowPlayingSignature;
 const upcoming=player.getUpcomingQueue();
 const signature=JSON.stringify([player.currentTrack?.id,player.currentTrack?.title,player.currentTrack?.artist,player.currentTrack?.pictureUrl,player.queueIndex,upcoming.map(({track,index})=>[index,track.id,track.queueEntry,track.title,track.artist,track.pictureUrl])]);
 if(container.dataset.queueSignature!==signature||!container.querySelector('.queue-list')){
  container.dataset.queueSignature=signature;
  const scroll=container.scrollTop;retainArtwork(container);container.replaceChildren();
  if(player.currentTrack){
   const heading=document.createElement('h3');heading.className='queue-section-title';heading.textContent='Сейчас играет';container.append(heading,queueRow(this,player.currentTrack,player.queueIndex));
  }
  renderQueueList(this,container,upcoming);
  const controls=document.createElement('div');controls.className='queue-controls';controls.innerHTML=`<button class="queue-shuffle">${icons.shuffle}<span>Перемешать</span></button><button class="queue-repeat" aria-label="Повтор">${icons.repeat}<span>Повтор</span></button>`;
  controls.querySelector('.queue-shuffle').onclick=()=>{player.toggleShuffle();this.renderRightQueue();};
  controls.querySelector('.queue-repeat').onclick=()=>{player.toggleRepeat();this.renderRightQueue();};
  container.append(controls);container.scrollTop=scroll;
 }
 const toggle=container.querySelector('.queue-current-toggle');
 if(toggle){const playing=String(player.isPlaying);if(toggle.dataset.playing!==playing)toggle.innerHTML=player.isPlaying?icons.pause:icons.play;toggle.dataset.playing=playing;toggle.setAttribute('aria-label',player.isPlaying?'Пауза':'Воспроизвести');}
 container.querySelector('.queue-shuffle').setAttribute('aria-pressed',String(player.isShuffle));
 const repeat=container.querySelector('.queue-repeat');repeat.dataset.repeat=player.repeatMode;repeat.setAttribute('aria-pressed',String(player.repeatMode!=='off'));
}
