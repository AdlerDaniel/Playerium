import {icons} from './design-icons.js';
import {mountCover} from './artwork.js';
export function renderRightQueue() {
  const ui=this,container=document.getElementById('rightPanelContent');container.replaceChildren();
  const first=this.player.queueIndex+1,upcoming=this.player.queue.slice(first);
  const selected=new Set();
  const currentHeading=document.createElement('h3');currentHeading.className='queue-section-title';currentHeading.textContent='Сейчас играет';container.append(currentHeading);
  let controls;
  const updateSelection=()=>{const b=controls.querySelector('.queue-remove-selected');b.hidden=!selected.size;b.textContent=`Удалить выбранные (${selected.size})`;};
  const row=(track,index,current=false)=>{
    const item=document.createElement('div');item.className='queue-item'+(current?' current':'');if(!current)item.dataset.queueIdx=index;
    item.tabIndex=0;item.setAttribute('role','button');
    item.innerHTML=`${current?'':`<input class="queue-select" type="checkbox" aria-label="Выбрать ${ui.escapeHTML(track.title)}">`}<div class="queue-item-thumb"></div><div class="queue-item-info"><div class="queue-item-title">${ui.escapeHTML(track.title)}</div><div class="queue-item-artist">${ui.escapeHTML(track.artist)}</div></div>${current?`<button class="queue-current-toggle" aria-label="${ui.player.isPlaying?'Пауза':'Воспроизвести'}">${ui.player.isPlaying?icons.pause:icons.play}</button>`:`<button class="queue-item-remove" aria-label="Удалить из очереди ${ui.escapeHTML(track.title)}">×</button><button class="queue-drag" aria-label="Переместить ${ui.escapeHTML(track.title)}. Используйте стрелки вверх и вниз">${icons.list}</button>`}`;
    mountCover(item.querySelector('.queue-item-thumb'),track);
    const activate=()=>{if(current){if(!ui.player.isPlaying)ui.player.play();}else{ui.player.queueIndex=index;ui.player.playTrack(ui.player.queue[index],index);}};
    item.onclick=e=>{if(!e.target.closest('button,input'))activate();};item.onkeydown=e=>{if(e.target===item&&['Enter',' '].includes(e.key)){e.preventDefault();activate();}};
    if(current)item.querySelector('button').onclick=()=>ui.player.togglePlay();
    else {
      item.querySelector('.queue-item-remove').onclick=()=>ui.player.removeFromQueue(index);
      item.querySelector('.queue-select').onchange=e=>{e.target.checked?selected.add(index):selected.delete(index);item.classList.toggle('selected',e.target.checked);updateSelection();};
      const handle=item.querySelector('.queue-drag');
      handle.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const to=index+(e.key==='ArrowUp'?-1:1);ui.player.moveUpcomingTrack(index,to);container.querySelector(`[data-queue-idx="${to}"] .queue-drag`)?.focus();}};
      let target=index,start=null;
      handle.onpointerdown=e=>{start=e.clientY;target=index;handle.setPointerCapture(e.pointerId);item.classList.add('dragging');};
      handle.onpointermove=e=>{if(start===null)return;item.style.transform=`translateY(${e.clientY-start}px)`;for(const r of container.querySelectorAll('.queue-item:not(.current)')){const b=r.getBoundingClientRect();if(r!==item&&e.clientY>=b.top&&e.clientY<=b.bottom)target=Number(r.dataset.queueIdx);r.classList.toggle('drop-target',Number(r.dataset.queueIdx)===target&&r!==item);}};
      const finish=commit=>{if(start===null)return;start=null;item.classList.remove('dragging');item.style.transform='';container.querySelectorAll('.drop-target').forEach(r=>r.classList.remove('drop-target'));if(commit)ui.player.moveUpcomingTrack(index,target);};
      handle.onpointerup=()=>finish(true);handle.onpointercancel=()=>finish(false);
    }
    return item;
  };
  if(this.player.currentTrack)container.append(row(this.player.currentTrack,this.player.queueIndex,true));
  const heading=document.createElement('div');heading.className='queue-heading';heading.innerHTML=`<h3 class="queue-section-title">Следующие в очереди (${upcoming.length})</h3>${upcoming.length?'<button id="btnClearQueueBtn">Очистить</button>':''}`;container.append(heading);
  heading.querySelector('button')?.addEventListener('click',()=>this.player.clearUpcomingQueue());
  const list=document.createElement('div');list.className='queue-list';upcoming.forEach((t,i)=>list.append(row(t,first+i)));container.append(list);
  if(!upcoming.length){const empty=document.createElement('p');empty.className='queue-empty';empty.textContent='Очередь пуста. Добавьте треки через меню ⋯.';list.append(empty);}
  controls=document.createElement('div');controls.className='queue-controls';controls.innerHTML=`<button class="queue-shuffle" aria-pressed="${this.player.isShuffle}">${icons.shuffle}<span>Перемешать</span></button><button class="queue-repeat" aria-label="Повтор" data-repeat="${this.player.repeatMode}" aria-pressed="${this.player.repeatMode!=='off'}">${icons.repeat}<span>Повтор</span></button><button class="queue-remove-selected" hidden>Удалить выбранные</button>`;
  controls.querySelector('.queue-shuffle').onclick=()=>{this.player.toggleShuffle();this.renderRightQueue();};controls.querySelector('.queue-repeat').onclick=()=>{this.player.toggleRepeat();this.renderRightQueue();};
  controls.querySelector('.queue-remove-selected').onclick=()=>{for(const i of [...selected].sort((a,b)=>b-a))this.player.removeFromQueue(i);};container.append(controls);
}
