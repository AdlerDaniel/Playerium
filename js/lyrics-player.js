import {icons} from './design-icons.js';
import {mountCover} from './artwork.js';
import {lyricsKey} from './lyrics-service.js';
import {trackRange} from './track-edits.js';

const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'" fill="currentColor"/></svg>';
const previous=svg('M6 5h3v14H6zm13 0v14l-9-7z'),next=svg('M15 5h3v14h-3zM5 5l9 7-9 7z'),volumeIcon=svg('M3 9h4l5-4v14l-5-4H3zm12-3a8 8 0 0 1 0 12l-1-1.6a6 6 0 0 0 0-8.8zm-1 3a4 4 0 0 1 0 6l-1-1.5a2 2 0 0 0 0-3z');
function button(label,icon,action){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=icon;b.onclick=action;return b;}

export class LyricsPlayer{
 constructor(experience){
  this.experience=experience;this.ui=experience.ui;this.player=this.ui.player;this.opener=document.activeElement;this.generation=0;this.following=true;this.active=-1;this.queueLimit=50;
  const root=this.root=document.createElement('div');root.className='cinema-overlay lyrics-player';
  root.innerHTML='<section class="cinema-player lyrics-layout" role="dialog" aria-modal="true" aria-label="Полноэкранный плеер"><div class="lyrics-backdrop" aria-hidden="true"></div><header class="cinema-top"><div class="lyrics-close-slot"></div><span>Сейчас играет</span><div class="lyrics-tabs" role="tablist" aria-label="Содержимое плеера"><button type="button" role="tab" id="lyricsTabText" aria-selected="true" aria-controls="lyricsTextPanel">Текст</button><button type="button" role="tab" id="lyricsTabQueue" aria-selected="false" aria-controls="lyricsQueuePanel" tabindex="-1">Очередь</button></div></header><aside class="lyrics-now"><div class="cinema-art"></div><div class="cinema-meta"><h1></h1><p></p></div><label class="cinema-progress"><span class="resume-time"></span><input class="cinema-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Позиция песни"></label><div class="cinema-controls"></div><div class="cinema-volume"><span></span><input type="range" min="0" max="100" step="1" aria-label="Громкость"></div></aside><main class="lyrics-text-panel" id="lyricsTextPanel" role="tabpanel" aria-labelledby="lyricsTabText"><div class="lyrics-scroll" tabindex="0" aria-label="Текст песни"></div><button type="button" class="lyrics-follow" hidden>К текущей строке</button><footer class="lyrics-source"></footer></main><aside class="lyrics-queue-panel" id="lyricsQueuePanel" role="tabpanel" aria-labelledby="lyricsTabQueue"><div class="lyrics-queue-heading"><h2>Очередь</h2><span></span></div><div class="lyrics-queue-list"></div></aside></section>';
  this.panel=root.firstElementChild;this.scroll=root.querySelector('.lyrics-scroll');this.source=root.querySelector('.lyrics-source');this.queueHost=root.querySelector('.lyrics-queue-list');this.follow=root.querySelector('.lyrics-follow');
  root.querySelector('.lyrics-close-slot').append(button('Закрыть полноэкранный плеер',icons.close,()=>this.close()));
  const controls=root.querySelector('.cinema-controls');this.shuffle=button('Перемешать',icons.shuffle,()=>{this.player.toggleShuffle();this.state();});this.play=button('Воспроизвести',icons.play,()=>this.player.togglePlay());this.play.className='cinema-play';this.repeat=button('Повтор',icons.repeat,()=>{this.player.toggleRepeat();this.state();});
  controls.append(this.shuffle,button('Предыдущий трек',previous,()=>this.player.prev()),this.play,button('Следующий трек',next,()=>this.player.next()),this.repeat);
  root.querySelector('.cinema-volume span').append(button('Выключить звук',volumeIcon,()=>this.player.toggleMute()));
  const slider=root.querySelector('.cinema-volume input');slider.value=Math.round(this.player.volume*100);slider.oninput=()=>this.player.setVolume(Number(slider.value)/100);slider.onpointerdown=()=>slider.dataset.dragging='true';slider.onpointerup=slider.onpointercancel=()=>{delete slider.dataset.dragging;slider.value=Math.round(this.player.volume*100);};
  const seek=root.querySelector('.cinema-seek');seek.oninput=()=>seek.dataset.dragging='true';seek.onchange=()=>{delete seek.dataset.dragging;this.player.seek(Number(seek.value));};seek.onpointercancel=()=>delete seek.dataset.dragging;
  const tabs=[...root.querySelectorAll('[role=tab]')];tabs.forEach((tab,index)=>{tab.onclick=()=>this.tab(index);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?1:tabs.indexOf(tab)===0?1:0;this.tab(index);tabs[index].focus();}};});
  const stopFollowing=()=>{if(this.data?.lines?.length){this.following=false;this.follow.hidden=false;}};this.scroll.addEventListener('wheel',stopFollowing,{passive:true});this.scroll.addEventListener('touchstart',stopFollowing,{passive:true});this.scroll.onkeydown=event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))stopFollowing();};this.follow.onclick=()=>{this.following=true;this.follow.hidden=true;this.scrollActive();};
  root.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}else if(event.key==='Tab'){
   const targets=[...this.panel.querySelectorAll('button,input,[tabindex="0"]')].filter(node=>!node.disabled&&node.offsetParent!==null),index=targets.indexOf(document.activeElement);if(targets.length){event.preventDefault();targets[(index+(event.shiftKey?-1:1)+targets.length)%targets.length].focus();}
  }else if(event.target.closest('button,input'))event.stopPropagation();};
  this.documentKey=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close();}else if(event.key==='Tab'&&!root.contains(document.activeElement)){event.preventDefault();root.querySelector('button').focus();}};document.addEventListener('keydown',this.documentKey,true);
  document.body.append(root);this.inert=[...document.body.children].filter(node=>node!==root&&!node.classList.contains('window-frame')&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>[node,node.inert]);for(const [node]of this.inert)node.inert=true;
  this.track(this.player.currentTrack);this.queue();this.state();root.querySelector('button').focus({preventScroll:true});
 }
 tab(index){this.root.dataset.tab=index?'queue':'text';[...this.root.querySelectorAll('[role=tab]')].forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});if(!index)this.scrollActive();}
 close(){if(this.closed)return;this.closed=true;this.generation++;document.removeEventListener('keydown',this.documentKey,true);this.root.remove();for(const [node,inert]of this.inert)if(node.isConnected)node.inert=inert;this.experience.cinema=null;this.experience.lyricsPlayer=null;this.opener?.isConnected&&this.opener.focus({preventScroll:true});}
 async track(track,{refresh=false}={}){
  if(this.closed)return;mountCover(this.root.querySelector('.cinema-art'),track||{},true);mountCover(this.root.querySelector('.lyrics-backdrop'),track||{},true);this.root.querySelector('h1').textContent=track?.title||'Выберите трек';this.root.querySelector('.cinema-meta p').textContent=track?.artist||'';
   const key=track?lyricsKey(track)+JSON.stringify(track.userEdits?.trim||null):null;if(key===this.key&&!refresh)return;this.key=key;const generation=++this.generation;this.active=-1;this.data=null;this.following=true;this.follow.hidden=true;this.scroll.scrollTop=0;this.source.textContent='';
  if(!track){this.message('Выберите песню','Текст появится здесь, когда начнётся воспроизведение.');return;}
  this.scroll.innerHTML='<div class="lyrics-loading" role="status"><span class="lyrics-loading-label">Ищем текст…</span><i></i><i></i><i></i><i></i></div>';
  let data;try{data=await this.ui.lyrics?.lookup(track,{refresh});}catch{}
  if(this.closed||generation!==this.generation)return;
  this.data=data;this.scroll.replaceChildren();this.scroll.classList.toggle('unsynced',!data?.lines?.length);
  if(!data){this.message('Текст пока не найден','Попробуйте повторить поиск позже.');const retry=button('Повторить поиск текста','',()=>this.track(this.player.currentTrack,{refresh:true}));retry.textContent='Повторить поиск';retry.className='lyrics-retry';this.scroll.firstElementChild.append(retry);return;}
  if(data.instrumental&&!data.plain){this.message('Инструментальная композиция','В этой записи нет текста.');return;}
  const rows=data.lines.length?data.lines:data.plain.split('\n').map(text=>({text,time:null}));this.nodes=[];
   const range=trackRange(track);
   for(const row of rows){
    const seekable=Number.isFinite(row.time)&&(!track.userEdits?.trim||(row.time>=range.start&&row.time<range.end));
    const line=document.createElement(seekable?'button':'p');line.className='lyric-line';line.textContent=row.text||'♪';
    if(seekable){line.type='button';line.title='Перейти к строке';line.onclick=()=>{const position=row.time-range.start;this.player.seekToTime(position);this.following=true;this.follow.hidden=true;this.time(position);};}
    this.scroll.append(line);this.nodes.push(line);
   }
  const providers={'LRCLIB':'https://lrclib.net','Lyrics.ovh':'https://lyrics.ovh','Pisni.in.ua':'https://pisni.in.ua','Tekst-pisni.com':'https://tekst-pisni.com'},label=data.source||'Встроенный текст';let url=providers[label]||(label.startsWith('Lrcmux')?'https://lrcmux.dev':null);
  if(data.sourceUrl&&url)try{const parsed=new URL(data.sourceUrl);if(parsed.origin===url&&!parsed.username&&!parsed.password)url=parsed.href;}catch{}
  const attribution=document.createElement(url?'a':'span');attribution.textContent=label;if(url){attribution.href=url;attribution.onclick=event=>{event.preventDefault();if(window.electronAPI?.openExternal)window.electronAPI.openExternal(url);else if(window.AndroidBridge?.openExternalUrl)window.AndroidBridge.openExternalUrl(url);else window.open(url,'_blank','noopener');};}this.source.append(attribution);if(!data.lines.length)this.source.append(document.createTextNode(' · Без синхронизации'));
  this.time(this.player.getCurrentTime());
 }
 message(title,description){this.scroll.replaceChildren();const state=document.createElement('div');state.className='lyrics-empty';const heading=document.createElement('h2'),detail=document.createElement('p');heading.textContent=title;detail.textContent=description;state.append(heading,detail);this.scroll.append(state);}
 time(seconds){if(!this.data?.lines?.length||!this.nodes)return;const sourceTime=seconds+trackRange(this.player.currentTrack).start;let index=-1;for(let i=0;i<this.data.lines.length;i++){if(this.data.lines[i].time>sourceTime+.05)break;index=i;}if(index===this.active)return;
  if(this.active>=0){this.nodes[this.active]?.classList.remove('current');this.nodes[this.active]?.removeAttribute('aria-current');}this.active=index;if(index>=0){this.nodes[index]?.classList.add('current');this.nodes[index]?.setAttribute('aria-current','true');}if(this.following)this.scrollActive();
 }
 scrollActive(){const line=this.nodes?.[this.active];if(!line||this.scroll.offsetParent===null)return;const top=Math.max(0,line.offsetTop-this.scroll.offsetTop-this.scroll.clientHeight*.4+line.clientHeight/2);this.scroll.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
 state(){const p=this.player;this.play.innerHTML=p.isPlaying?icons.pause:icons.play;this.play.setAttribute('aria-label',p.isPlaying?'Пауза':'Воспроизвести');this.shuffle.setAttribute('aria-pressed',String(p.isShuffle));this.repeat.setAttribute('aria-pressed',String(p.repeatMode!=='off'));this.repeat.dataset.repeat=p.repeatMode;this.repeat.title=p.repeatMode==='one'?'Повтор одной песни':p.repeatMode==='all'?'Повтор очереди':'Включить повтор';this.root.querySelector('.cinema-volume button').setAttribute('aria-label',p.isMuted?'Включить звук':'Выключить звук');}
 queue(){if(this.closed)return;const p=this.player,upcoming=p.getUpcomingQueue(),signature=JSON.stringify([p.queueIndex,p.currentTrack?.id,...upcoming.map(({track,index})=>[index,track.id,track.title,track.artist,track.pictureUrl]),this.queueLimit]);if(signature===this.queueSignature)return;this.queueSignature=signature;const scroll=this.queueHost.scrollTop;this.queueHost.replaceChildren();this.root.querySelector('.lyrics-queue-heading>span').textContent=String(upcoming.length);
  const row=(track,index,current=false)=>{const b=document.createElement('button');b.type='button';b.className='lyrics-queue-row'+(current?' playing':'');b.setAttribute('aria-label',(current?'Сейчас играет: ':'Воспроизвести: ')+track.artist+' — '+track.title);b.innerHTML='<span class="lyrics-queue-art"></span><span class="lyrics-queue-info"><strong></strong><small></small></span>';b.querySelector('strong').textContent=track.title;b.querySelector('small').textContent=track.artist;mountCover(b.firstElementChild,track,true);b.onclick=()=>current?p.togglePlay():p.playTrack(track,index);this.queueHost.append(b);};
  if(p.currentTrack)row(p.currentTrack,p.queueIndex,true);const label=document.createElement('p');label.className='lyrics-queue-label';label.textContent=upcoming.length?'Далее':'В очереди больше нет песен';this.queueHost.append(label);
  for(const {track,index}of upcoming.slice(0,this.queueLimit))row(track,index);
  if(upcoming.length>this.queueLimit){const more=button('Показать ещё песни в очереди','',()=>{this.queueLimit+=50;this.queue();});more.textContent='Показать ещё';more.className='lyrics-queue-more';this.queueHost.append(more);}this.queueHost.scrollTop=scroll;this.state();
 }
}
