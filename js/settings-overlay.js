import {icons} from './design-icons.js';
export function openSettings(ui){
 if(ui.settingsOverlay?.isConnected){ui.settingsOverlay.querySelector('.settings-close').focus();return;}
 ui.voiceSearch?.cancel();ui.dismissTrackMenu?.();ui.dismissSurface?.();ui.closeContextMenu();
 const opener=document.activeElement,root=document.createElement('div');root.className='settings-overlay';
 root.innerHTML=`<section class="settings-dialog" role="dialog" aria-modal="true" aria-label="Настройки" tabindex="-1"><div class="settings-dialog-top"><span>Настройки</span><button class="settings-close" aria-label="Закрыть настройки">${icons.close}</button></div><div class="settings-dialog-content"></div></section>`;
 document.body.append(root);ui.settingsOverlay=root;document.body.classList.add('settings-open');
 // Preserve existing windows and their state while keeping background controls inert.
 const blocked=[...document.body.children].filter(n=>n!==root&&n.tagName!=='SCRIPT'&&n.id!=='toastContainer'),states=blocked.map(n=>[n,n.inert]);
 for(const [n] of states)n.inert=true;
 const close=()=>{ui.dismissSurface?.();ui.dismissTrackMenu?.();root.remove();document.body.classList.remove('settings-open');ui.settingsOverlay=null;for(const [n,inert] of states)if(n.isConnected)n.inert=inert;opener?.isConnected&&opener.focus({preventScroll:true});};ui.closeSettings=close;
 root.querySelector('.settings-close').onclick=close;root.onclick=e=>{if(e.target===root)close();};
 root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab'){
  const targets=[...root.querySelectorAll('button,a,input,select,textarea,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length),at=targets.indexOf(document.activeElement);
  if(e.shiftKey&&at<=0||!e.shiftKey&&(at<0||at===targets.length-1)){e.preventDefault();targets[e.shiftKey?targets.length-1:0]?.focus();}
 }};
 ui.renderSettingsView(root.querySelector('.settings-dialog-content'));root.querySelector('.settings-close').focus({preventScroll:true});return close;
}
