import {THEMES,currentTheme,applyTheme} from './themes.js';
export function renderThemePicker(host){
 if(!host)return;
 const active=currentTheme();
 host.innerHTML='<div class="theme-mode" role="group" aria-label="Режим оформления"><button data-scheme="dark">Тёмный</button><button data-scheme="light">Светлый</button></div><div class="theme-picker" aria-label="Цветовая тема"></div>';
 for(const theme of THEMES.filter(t=>t.scheme===active.scheme)){
  const button=document.createElement('button'),p=theme.tokens;
  button.className='theme-choice';button.dataset.themeId=theme.id;button.setAttribute('aria-pressed',String(theme.id===active.id));
  button.style.cssText=`--preview-bg:${p.bg};--preview-panel:${p.panel};--preview-raised:${p.surface};--preview-accent:${p.accent};--preview-text:${p.text};--preview-on-accent:${p.on_accent}`;
  button.innerHTML='<span class="theme-preview" aria-hidden="true"><span class="theme-preview-sidebar"></span><span class="theme-preview-main"><span></span><span></span></span><span class="theme-preview-player"></span></span><span class="theme-choice-name"></span>';
  button.lastElementChild.textContent=theme.name;button.onclick=()=>{applyTheme(theme.id);renderThemePicker(host);host.querySelector(`[data-theme-id="${theme.id}"]`)?.focus({preventScroll:true});};host.querySelector('.theme-picker').append(button);
 }
 for(const button of host.querySelectorAll('[data-scheme]')){button.setAttribute('aria-pressed',String(active.scheme===button.dataset.scheme));button.onclick=()=>{applyTheme(active.accent+'-'+button.dataset.scheme);renderThemePicker(host);host.querySelector(`[data-scheme="${button.dataset.scheme}"]`)?.focus({preventScroll:true});};}
}
