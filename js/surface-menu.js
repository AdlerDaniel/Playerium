// Shared keyboard/touch surfaces for collection menus and local file actions.
import {icons} from './design-icons.js';
export function showSurfaceMenu(ui,{title,items,anchor}={}) {
  ui.dismissTrackMenu?.(); ui.dismissSurface?.(); ui.closeContextMenu();
  const opener=document.activeElement, root=document.createElement('div');
  root.className=ui.isMobile?'mobile-bottom-sheet collection-sheet':'surface-overlay';
  root.innerHTML=ui.isMobile?'<div class="mobile-sheet-overlay"></div><div class="mobile-sheet-content surface-panel" role="dialog" aria-modal="true"></div>':'<div class="surface-panel" role="menu"></div>';
  const panel=root.lastElementChild;panel.setAttribute('aria-label',title);
  panel.innerHTML=`${ui.isMobile?'<div class="mobile-sheet-handle"></div>':''}<h3 class="menu-pane-title">${ui.escapeHTML(title)}</h3>`;
  document.body.append(root);
  let closed=false;
  const close=()=>{if(closed)return;closed=true;root.classList.remove('active');root.classList.add('closing');setTimeout(()=>root.remove(),200);if(ui.dismissSurface===close)ui.dismissSurface=null;opener?.isConnected&&opener.focus({preventScroll:true});};
  ui.dismissSurface=close;
  for(const item of items){
    const b=document.createElement('button');b.className=(ui.isMobile?'mobile-sheet-item':'context-menu-item')+(item.danger?' danger':'');
    b.innerHTML=`${item.icon||icons.music}<span>${ui.escapeHTML(item.label)}</span>${item.selected?'<span class="surface-check">✓</span>':''}`;
    if(!ui.isMobile)b.setAttribute('role','menuitem');
    b.onclick=async()=>{close();try{await item.action();}catch(error){ui.showToast(error.message,'error');}};panel.append(b);
  }
  root.addEventListener('click',e=>{if(e.target===root||e.target.classList.contains('mobile-sheet-overlay'))close();});
  panel.onkeydown=e=>{
    const buttons=[...panel.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(['ArrowDown','ArrowUp','Tab','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowUp'||e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}
  };
  if(ui.isMobile){
    let start=null,delta=0;
    panel.onpointerdown=e=>{if(!e.target.closest('.mobile-sheet-handle'))return;start=e.clientY;delta=0;panel.setPointerCapture(e.pointerId);};
    panel.onpointermove=e=>{if(start===null)return;delta=Math.max(0,e.clientY-start);panel.style.transform=`translateY(${delta}px)`;};
    const release=commit=>{if(start===null)return;start=null;panel.style.transform='';if(commit&&delta>72)close();};
    panel.onpointerup=()=>release(true);panel.onpointercancel=()=>release(false);
  }
  if(!ui.isMobile){const rect=anchor?.getBoundingClientRect?.()||{left:innerWidth/2, bottom:innerHeight/2};panel.style.left=Math.max(8,Math.min(rect.left,innerWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,Math.min(rect.bottom,innerHeight-panel.offsetHeight-8))+'px';}
  requestAnimationFrame(()=>root.classList.add('active'));panel.querySelector('button')?.focus({preventScroll:true});
  return close;
}

export function showFormDialog(ui,{title,fields=[],confirm='Сохранить',message='',danger=false}) {
  ui.dismissSurface?.();
  const opener=document.activeElement,root=document.createElement('div');root.className='modal-overlay active form-dialog';
  root.innerHTML=`<form class="modal-card" role="dialog" aria-modal="true" aria-label="${ui.escapeHTML(title)}"><div class="modal-header"><h2>${ui.escapeHTML(title)}</h2></div><div class="modal-body">${message?`<p>${ui.escapeHTML(message)}</p>`:''}</div><div class="modal-footer"><button type="button" class="settings-btn-secondary dialog-cancel">Отмена</button><button type="submit" class="settings-btn-primary ${danger?'danger':''}">${ui.escapeHTML(confirm)}</button></div></form>`;
  const form=root.firstElementChild,body=form.querySelector('.modal-body');
  for(const f of fields){const label=document.createElement('label');label.className='dialog-field';const text=document.createElement('span');text.textContent=f.label;const input=document.createElement(f.multiline?'textarea':'input');input.className='search-input';input.name=f.name;input.value=f.value||'';input.required=!!f.required;input.maxLength=f.multiline?1000:150;label.append(text,input);body.append(label);}
  document.body.append(root);
  return new Promise(resolve=>{
    let done=false;
    const finish=value=>{if(done)return;done=true;root.remove();if(ui.dismissSurface===cancel)ui.dismissSurface=null;opener?.isConnected&&opener.focus({preventScroll:true});resolve(value);};
    const cancel=()=>finish(null);ui.dismissSurface=cancel;
    form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));for(const field of fields){values[field.name]=values[field.name].trim();if(field.required&&!values[field.name]){form.elements[field.name].focus();return;}}finish(values);};
    root.querySelector('.dialog-cancel').onclick=cancel;root.onclick=e=>{if(e.target===root)cancel();};
    root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}else if(e.key==='Tab'){const targets=[...root.querySelectorAll('input,textarea,button')],i=targets.indexOf(document.activeElement);e.preventDefault();targets[(i+(e.shiftKey?-1:1)+targets.length)%targets.length]?.focus();}};
    const first=form.querySelector('input,textarea')||form.querySelector('button');first.focus();first.select?.();
  });
}
