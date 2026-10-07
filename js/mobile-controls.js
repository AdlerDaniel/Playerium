import {showSurfaceMenu} from './surface-menu.js';
import {icons} from './design-icons.js';
import {showTrackMenu} from './track-menu.js';
export function bindMobileEvents() {
    // 1. Mobile Navigation Bar Tabs
    const navHome = document.getElementById("mobileNavHome");
    const navSearch = document.getElementById("mobileNavSearch");
    const navLibrary = document.getElementById("mobileNavLibrary");

    if (navHome) {
      navHome.addEventListener("click", () => {
        this.searchQuery = "";
        document.getElementById("mainSearchInput").value = "";
        document.getElementById("searchClearBtn").classList.remove("visible");
        this.updateMobileNavActive("home");
        this.navigateTo({ type: "home", title: "Главная" });
      });
    }
    if (navSearch) {
      navSearch.addEventListener("click", () => {
        this.updateMobileNavActive("search");
        this.navigateTo({ type: "search", title: "Поиск" });
        setTimeout(() => document.querySelector(".mobile-search-input")?.focus(), 100);
      });
    }
    if (navLibrary) {
      navLibrary.addEventListener("click", () => {
        this.updateMobileNavActive("library");
        this.navigateTo({ type: "library", title: "Моя медиатека" });
      });
    }

    document.getElementById('mobileNavCreate').onclick=()=>this.showMobileAddSheet();
    // 2. Mobile Mini-Player (Tap to expand fullscreen)
    const miniPlayer = document.getElementById("mobileMiniPlayer");
    const fsPlayer = document.getElementById("mobileFullscreenPlayer");
    const syncFullscreen=()=>{const active=fsPlayer.classList.contains('active');fsPlayer.inert=!active;fsPlayer.setAttribute('aria-hidden',String(!active));if(active)document.getElementById('btnMobileFsClose').focus({preventScroll:true});else if(fsPlayer.contains(document.activeElement))miniPlayer?.focus({preventScroll:true});};
    new MutationObserver(syncFullscreen).observe(fsPlayer,{attributes:true,attributeFilter:['class']});syncFullscreen();
    if (miniPlayer) {
      miniPlayer.addEventListener("click", (e) => {
        if (e.target.closest("#mobileMiniLike") || e.target.closest("#mobileMiniPlayPause")) return;
        if (this.player.currentTrack && fsPlayer) {
          fsPlayer.classList.add("active");fsPlayer.scrollTop=0;
          document.getElementById('btnMobileFsClose').focus({preventScroll:true});
        }
      });
    }

    // Mini-player buttons
    document.getElementById("mobileMiniPlayPause")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.player.togglePlay();
    });

    document.getElementById("mobileMiniLike")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (this.player.currentTrack) {
        const liked = await this.library.toggleLike(this.player.currentTrack.id);
        this.updateLikeButtons(this.player.currentTrack.id, liked);
        this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      }
    });

    // 3. Mobile Fullscreen Player Controls
    document.getElementById("btnMobileFsClose")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
    });

    document.getElementById("btnMobileFsPlayPause")?.addEventListener("click", () => {
      this.player.togglePlay();
    });

    document.getElementById("btnMobileFsNext")?.addEventListener("click", () => {
      this.player.next();
    });

    document.getElementById("btnMobileFsPrev")?.addEventListener("click", () => {
      this.player.prev();
    });

    document.getElementById("btnMobileFsShuffle")?.addEventListener("click", () => {
      this.player.toggleShuffle();
    });

    document.getElementById("btnMobileFsRepeat")?.addEventListener("click", () => {
      this.player.toggleRepeat();
    });

    document.getElementById("btnMobileFsLike")?.addEventListener("click", async () => {
      if (this.player.currentTrack) {
        const liked = await this.library.toggleLike(this.player.currentTrack.id);
        this.updateLikeButtons(this.player.currentTrack.id, liked);
        this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      }
    });

    // Fullscreen Scrubber slider
    const fsSlider = document.getElementById("mobileFsSlider");
    if (fsSlider) {
      fsSlider.setAttribute('aria-label', 'Позиция воспроизведения');
      fsSlider.addEventListener('pointerdown', () => { fsSlider.dataset.dragging = 'true'; });
      fsSlider.addEventListener('keydown', e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) fsSlider.dataset.dragging = 'true'; });
      const finishSeek = () => { delete fsSlider.dataset.dragging; };
      fsSlider.addEventListener('pointercancel', finishSeek);
      fsSlider.addEventListener('blur', finishSeek);
      fsSlider.addEventListener('pointerup', finishSeek);
      fsSlider.addEventListener('keyup', finishSeek);
      fsSlider.addEventListener("input", (e) => {
        fsSlider.style.setProperty('--seek-progress', e.target.value + '%');
        const dur = this.player.getDuration();
        if (dur > 0) {
          const seekTime = (parseFloat(e.target.value) / 100) * dur;
          document.getElementById("mobileFsTimeCurrent").textContent = this.formatTime(seekTime);
        }
      });
      fsSlider.addEventListener("change", (e) => {
        const dur = this.player.getDuration();
        if (dur > 0) {
          const seekTime = (parseFloat(e.target.value) / 100) * dur;
          this.player.seekToTime(seekTime);
          finishSeek();
        }
      });
    }

    // Fullscreen Equalizer & Queue
    document.getElementById("btnMobileFsEq")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
      this.navigateTo({ type: "settings", title: "Настройки" });
    });

    document.getElementById("btnMobileFsQueue")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
      this.toggleRightPanel("queue");
    });

    document.getElementById('btnMobileFsShare').onclick=()=>{if(this.player.currentTrack){showTrackMenu(this,this.player.currentTrack,{mobile:true});document.getElementById('sheetOptShare')?.click();}};
    for(const [id,kind] of [['btnMobileFsAlbum','album'],['btnMobileFsArtist','artist']])document.getElementById(id).onclick=()=>{const t=this.player.currentTrack;if(!t)return;fsPlayer.classList.remove('active');this.navigateTo(kind==='album'&&t.album?{type:'album',id:t.album,extra:t.artist,title:t.album}:kind==='artist'?{type:'artist',id:t.artist,title:t.artist}:{type:'allTracks',title:'Добавленные'});};
    let swipeStart=null,delta=0;
    const header=fsPlayer.querySelector('.mobile-fs-header');header.onpointerdown=e=>{if(e.target.closest('button'))return;swipeStart=e.clientY;delta=0;header.setPointerCapture(e.pointerId);};
    header.onpointermove=e=>{if(swipeStart===null)return;delta=Math.max(0,e.clientY-swipeStart);fsPlayer.style.transform=`translateY(${delta}px)`;};
    const finishSwipe=commit=>{if(swipeStart===null)return;swipeStart=null;fsPlayer.style.transform='';if(commit&&delta>80){fsPlayer.classList.remove('active');miniPlayer.focus();}};header.onpointerup=()=>finishSwipe(true);header.onpointercancel=()=>finishSwipe(false);
    miniPlayer.tabIndex=0;miniPlayer.setAttribute('role','button');miniPlayer.setAttribute('aria-label','Открыть плеер');miniPlayer.onkeydown=e=>{if(e.target===miniPlayer&&['Enter',' '].includes(e.key)){e.preventDefault();miniPlayer.click();}};
    fsPlayer.onkeydown=e=>{if(e.key==='Tab'){const targets=[...fsPlayer.querySelectorAll('button,input')],i=targets.indexOf(document.activeElement);e.preventDefault();targets[(i+(e.shiftKey?-1:1)+targets.length)%targets.length]?.focus();}};
    // Fullscreen Options Button
    document.getElementById("btnMobileFsOptions")?.addEventListener("click", () => {
      if (this.player.currentTrack) {
        this.showMobileTrackOptionsSheet(this.player.currentTrack, this.player.queueIndex, this.player.queue, null);
      }
    });

    // File-picker imports are bound once by App.

}

export function updateMobileNavActive(tab) {
    document.querySelectorAll(".mobile-nav-item").forEach((btn) => btn.classList.remove("active"));
    if (tab === "home") document.getElementById("mobileNavHome")?.classList.add("active");
    if (tab === "search") document.getElementById("mobileNavSearch")?.classList.add("active");
    if (tab === "library") document.getElementById("mobileNavLibrary")?.classList.add("active");
}

export function showMobileTrackOptionsSheet(track, index, tracks, playlistContext = null) {
    return showTrackMenu(this,track,{mobile:true,playlistContext});
}

export function showMobileAddSheet() {
  return showSurfaceMenu(this,{title:'Создать и добавить',items:[
    {label:'Плейлист',icon:icons.music,action:()=>this.showCreatePlaylistModal()},
    {label:'Выбрать аудиофайлы',icon:icons.plus,action:()=>this.triggerMobileFileImport()},
    {label:'Добавить папку с музыкой',icon:icons.music,action:()=>this.triggerFolderPicker()},
  ]});
}

export function triggerMobileFileImport() {
    const audioPicker = document.getElementById("hiddenAudioFilesPicker");
    if (audioPicker) {
      audioPicker.click();
    } else {
      this.triggerFolderPicker();
    }
}
