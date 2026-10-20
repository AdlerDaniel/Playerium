import {SearchSuggestions} from './search-suggestions.js';
import {enhancePlaylistComposer} from './playlist-composer.js';
import {refreshTrackStates} from './track-state.js';
import {artworkTint,CoverTransition} from './artwork-atmosphere.js';
import {bindSeekRange} from './playback-controls.js';
import {icons} from './design-icons.js';

export const INTERFACE_ITEMS=[1,2,6,7,8,9,10,11,12,13,14,16,17,18,19,20];
const read=()=>{try{return JSON.parse(localStorage.getItem('playerium_interface_sidebar')||'{}');}catch{return {};}};
const makeButton=(label,icon,action)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.innerHTML=icon;b.onclick=action;return b;};
export class InterfaceV2{
  constructor(ui){this.ui=ui;this.suggestions=new SearchSuggestions(ui);this.covers=new CoverTransition();this.sidebar=read();this.viewGeneration=0;this.trackGeneration=0;this.lastMiniAt=0;}
  init(){
    const ui=this.ui;document.body.classList.add('interface-v2');
    const after=(host,name,callback)=>{const original=host[name].bind(host);host[name]=(...args)=>{const result=original(...args);callback(...args);return result;};};
    after(ui,'loadView',()=>this.enhance());after(ui,'openRightPanel',()=>this.saveSidebar());after(ui,'closeRightPanel',()=>this.saveSidebar());after(ui,'switchRightTab',()=>this.saveSidebar());
    for(const name of ['onTrackChange','onPlayStateChange','onQueueChange','onVolumeChange','onTimeUpdate']){const original=ui.player[name];ui.player[name]=(...args)=>{original?.(...args);if(name==='onTrackChange'){this.covers.cancel();this.tintPlaying(args[0]);}this.publishMini();};}
    const ensure=ui.music.ensureTrack.bind(ui.music);ui.trackDownloadErrors=new Map();ui.music.ensureTrack=async track=>{ui.trackDownloadErrors.delete(track.id);const task=ensure(track);refreshTrackStates(ui);try{return await task;}catch(error){ui.trackDownloadErrors.set(track.id,error.message);throw error;}finally{refreshTrackStates(ui);}};
    after(ui.connect,'updateButtons',()=>{this.outputLabel();this.publishMini();});
    after(ui.experience,'openCinema',()=>this.cinema());
    this.mobilePlayer();this.resizableSidebar();this.miniPlayer();this.enhance();this.tintPlaying(ui.player.currentTrack);ui.connect.updateButtons();this.outputLabel();
    if(this.sidebar.open&&!ui.isMobile)ui.openRightPanel(this.sidebar.tab==='queue'?'queue':'nowPlaying');
    this.timer=setInterval(()=>{if(!document.hidden)refreshTrackStates(ui);},1000);
  }
  enhance(){
    const ui=this.ui;this.covers.cancel();if(this.suggestions.input&&!this.suggestions.input.isConnected)this.suggestions.close();
    this.suggestions.bind(document.getElementById('mainSearchInput'));this.suggestions.bind(document.querySelector('.mobile-search-input'));
    const content=document.getElementById('mainViewContent');content.classList.remove('playlist-composing');enhancePlaylistComposer(ui);refreshTrackStates(ui);
    const generation=++this.viewGeneration,track=ui.currentView.type==='playlist'?ui.library.getPlaylistTracks(ui.currentView.id)[0]:ui.currentView.type==='artist'?ui.library.getTracks().find(t=>t.artist===ui.currentView.id):null;
    content.style.removeProperty('--artwork-tint');if(track)artworkTint(track).then(tint=>{if(generation===this.viewGeneration&&tint)content.style.setProperty('--artwork-tint',`rgb(${tint} / .18)`);});
  }
  tintPlaying(track){const generation=++this.trackGeneration;artworkTint(track).then(tint=>{if(generation===this.trackGeneration)document.body.style.setProperty('--playing-artwork-tint',tint?`rgb(${tint} / .24)`:'transparent');});}
  mobilePlayer(){
    const ui=this.ui,mini=document.getElementById('mobileMiniPlayer'),full=document.getElementById('mobileFullscreenPlayer');
    const next=makeButton('Следующий трек',icons.next,e=>{e.stopPropagation();ui.player.next();});next.id='mobileMiniNext';next.className='mobile-mini-btn';mini.querySelector('.mobile-mini-actions').append(next);
    const label=document.createElement('span');label.className='mini-output-label';mini.querySelector('.mobile-mini-info').append(label);
    const output=document.createElement('div');output.className='mobile-output-row';full.querySelector('.mobile-fs-controls').after(output);const devices=document.getElementById('btnMobilePlaybackDevices');if(devices)output.append(devices);output.append(document.getElementById('btnMobileFsQueue'));
    bindSeekRange(ui,document.getElementById('mobileFsSlider'),value=>{document.getElementById('mobileFsTimeCurrent').textContent=ui.formatTime(value/100*ui.player.getDuration());});
    let active=full.classList.contains('active');new MutationObserver(()=>{const open=full.classList.contains('active');if(open===active)return;active=open;this.covers.move(document.getElementById(open?'mobileMiniCover':'mobileFsArtwork'),document.getElementById(open?'mobileFsArtwork':'mobileMiniCover'));}).observe(full,{attributes:true,attributeFilter:['class']});
  }
  cinema(){
    const root=this.ui.experience.cinema;if(!root)return;bindSeekRange(this.ui,root.querySelector('.cinema-seek'));const controls=root.querySelector('.cinema-controls'),device=controls.children[3];if(device){device.classList.add('playback-device-button');const row=document.createElement('div');row.className='cinema-device-row';root.querySelector('.cinema-upcoming').before(row);row.append(device);this.ui.connect.updateButtons();}
    this.covers.move(document.getElementById(this.ui.isMobile?'mobileFsArtwork':'nowPlayingCover'),root.querySelector('.cinema-art'));
  }
  outputLabel(){const connect=this.ui.connect,remote=connect.selected!==connect.id,name=remote?connect.remote?.name||'Другое устройство':window.AndroidBridge?'Этот телефон':'Этот компьютер';for(const host of document.querySelectorAll('.mini-output-label')){host.textContent=name;host.classList.toggle('remote-active',remote);}}
  saveSidebar(){const ui=this.ui;this.sidebar={...this.sidebar,open:ui.isRightPanelOpen,tab:ui.activeRightTab};try{localStorage.setItem('playerium_interface_sidebar',JSON.stringify(this.sidebar));}catch{}}
  resizableSidebar(){
    const panel=document.getElementById('rightPanel'),grip=document.createElement('div');grip.className='right-panel-resize';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-label','Ширина боковой панели');grip.setAttribute('aria-orientation','vertical');panel.prepend(grip);
    const clamp=value=>Math.max(260,Math.min(480,innerWidth-(document.querySelector('.sidebar')?.getBoundingClientRect().width||0)-360,Number.isFinite(value)?value:320));
    const apply=value=>{const width=clamp(value);document.documentElement.style.setProperty('--sp-right-width',width+'px');grip.setAttribute('aria-valuenow',String(Math.round(width)));grip.setAttribute('aria-valuemin','260');grip.setAttribute('aria-valuemax',String(Math.round(clamp(480))));};
    let start=null;
    grip.onpointerdown=e=>{if(this.ui.isMobile)return;e.preventDefault();start={x:e.clientX,width:panel.getBoundingClientRect().width};grip.setPointerCapture(e.pointerId);document.body.classList.add('resizing-task-panel');};
    grip.onpointermove=e=>{if(start)apply(start.width+start.x-e.clientX);};
    const finish=()=>{if(!start)return;start=null;document.body.classList.remove('resizing-task-panel');this.sidebar.width=Number(grip.getAttribute('aria-valuenow'));this.saveSidebar();};grip.onpointerup=finish;grip.onpointercancel=finish;grip.onlostpointercapture=finish;
    grip.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const value=Number(grip.getAttribute('aria-valuenow'))||320;this.sidebar.width=e.key==='Home'?260:e.key==='End'?480:value+(e.key==='ArrowLeft'?10:-10);apply(this.sidebar.width);this.saveSidebar();};
    window.addEventListener('resize',()=>{if(!this.ui.isMobile)apply(this.sidebar.width||320);});apply(this.sidebar.width||320);
  }
  miniPlayer(){
    const api=window.electronAPI;if(!api?.openMiniPlayer)return;const button=makeButton('Открыть мини-плеер',icons.grid,async()=>{try{await api.openMiniPlayer();this.miniActive=true;await this.publishMini(true);}catch(error){this.ui.showToast(error.message,'error');}});button.id='btnMiniWindow';document.querySelector('.player-right').append(button);
    api.onMiniClosed?.(()=>{this.miniActive=false;});
    api.onMiniCommand?.(async({command,value})=>{try{const p=this.ui.player;if(command==='toggle')p.togglePlay();else if(command==='next')p.next();else if(command==='previous')p.prev();else if(command==='seek')p.seekToTime(value);else if(command==='volume')p.setVolume(value);else if(command==='like')await this.ui.toggleCurrentLike();else if(command==='queue')this.ui.openRightPanel('queue');this.publishMini(true);}catch(error){this.ui.showToast(error.message,'error');}});
    new MutationObserver(()=>{this.miniTheme=null;this.publishMini(true);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }
  async publishMini(force=false){
    const api=window.electronAPI;if(!this.miniActive||!api?.publishMiniState||!force&&Date.now()-this.lastMiniAt<250)return;this.lastMiniAt=Date.now();const ui=this.ui,p=ui.player,track=p.currentTrack,remote=ui.connect.selected!==ui.connect.id;
    if(!this.miniTheme){const styles=getComputedStyle(document.documentElement);this.miniTheme=Object.fromEntries(Object.entries({background:'--sp-dark-900',foreground:'--sp-text-primary',muted:'--sp-text-secondary',accent:'--sp-green',control:'--sp-dark-700',onAccent:'--sp-on-accent'}).map(([key,token])=>[key,styles.getPropertyValue(token).trim()]));}
    const state={appName:document.title,title:track?.title,artist:track?.artist,liked:!!track?.liked,playing:p.isPlaying,position:p.getCurrentTime(),duration:p.getDuration(),volume:p.volume,device:remote?ui.connect.remote?.name:window.AndroidBridge?'Этот телефон':'Этот компьютер',remote,theme:this.miniTheme,queue:p.getUpcomingQueue().slice(0,6).map(({track:t})=>({title:t.title,artist:t.artist}))};
    const key=track?.pictureBlob||track?.pictureUrl||null;if(key!==this.miniArtKey){this.miniArtKey=key;state.artwork='';if(track?.pictureBlob&&/image\/(jpeg|png|webp)/.test(track.pictureBlob.type)){const reader=new FileReader();reader.onload=()=>{if(this.miniArtKey===key)api.publishMiniState({artwork:reader.result}).catch(()=>{});};reader.readAsDataURL(track.pictureBlob);}else if(/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/.test(track?.pictureUrl||''))state.artwork=track.pictureUrl;}
    try{await api.publishMiniState(state);}catch{/* Mini window closure must never affect the audio session. */}
  }
}
export function installInterfaceV2(ui){ui.interfaceV2=new InterfaceV2(ui);ui.interfaceV2.init();return ui.interfaceV2;}
