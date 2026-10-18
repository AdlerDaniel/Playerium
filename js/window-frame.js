export async function initWindowFrame(){
 const api=window.electronAPI;if(!api?.getWindowState)return;
 const state=await api.getWindowState();if(!state.custom)return;
 const bar=document.createElement('header');bar.className='window-frame';
 bar.innerHTML='<div class="window-brand"><img src="assets/icon.png" alt=""><span>Playerium</span></div><div class="window-controls"><button data-action="minimize" aria-label="Свернуть"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><button data-action="maximize" aria-label="Развернуть"><svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9"/></svg></button><button data-action="close" aria-label="Закрыть в трей"><svg viewBox="0 0 16 16"><path d="m4 4 8 8m0-8-8 8"/></svg></button></div>';
 bar.querySelector('.window-brand span').setAttribute('data-app-name','');
 bar.querySelector('.window-brand span').textContent=state.appName||window.PlayeriumBranding?.getName()||'Playerium';
 document.body.prepend(bar);document.body.classList.add('custom-window');
 const update=s=>{bar.hidden=!!s.fullscreen;document.body.classList.toggle('window-fullscreen',!!s.fullscreen);const button=bar.querySelector('[data-action="maximize"]');button.setAttribute('aria-label',s.maximized?'Восстановить окно':'Развернуть');button.innerHTML=s.maximized?'<svg viewBox="0 0 16 16"><path d="M6 3h7v7M3 6h7v7H3z"/></svg>':'<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9"/></svg>';};
 bar.querySelectorAll('button').forEach(button=>button.onclick=()=>api.windowControl(button.dataset.action));
 api.onWindowState(update);update(state);
}
