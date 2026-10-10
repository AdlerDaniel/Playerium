export function viewportBounds(){const v=window.visualViewport;return {left:(v?.offsetLeft||0)+8,top:(v?.offsetTop||0)+8,right:(v?.offsetLeft||0)+(v?.width||innerWidth)-8,bottom:(v?.offsetTop||0)+(v?.height||innerHeight)-8};}
export function positionFloating(panel,{x,y,anchor,prefer='below'}={}){
 const b=viewportBounds(),a=anchor?.getBoundingClientRect?.();
 panel.style.maxWidth=Math.max(0,b.right-b.left)+'px';panel.style.maxHeight=Math.max(0,b.bottom-b.top)+'px';
 const width=panel.offsetWidth,height=panel.offsetHeight;
 let left=a?a.left:x??b.left,top=a?(prefer==='above'?a.top-height-8:a.bottom+8):y??b.top;
 if(a&&top+height>b.bottom&&a.top-height-8>=b.top)top=a.top-height-8;
 if(a&&top<b.top&&a.bottom+height+8<=b.bottom)top=a.bottom+8;
 panel.style.left=Math.max(b.left,Math.min(left,b.right-width))+'px';panel.style.top=Math.max(b.top,Math.min(top,b.bottom-height))+'px';
}
export function watchFloating(panel,options){const place=()=>positionFloating(panel,options);place();window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);return()=>{window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);};}
export function installTooltips(){
 const tip=document.createElement('div');tip.className='app-tooltip';tip.id='playerium-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
 let target,timer;
 const hide=()=>{clearTimeout(timer);if(target){const descriptions=(target.getAttribute('aria-describedby')||'').split(' ').filter(id=>id!==tip.id);if(descriptions.length)target.setAttribute('aria-describedby',descriptions.join(' '));else target.removeAttribute('aria-describedby');}target=null;tip.hidden=true;};
 const show=element=>{if(element===target)return;hide();if(!element?.dataset.tooltip||element.disabled)return;target=element;timer=setTimeout(()=>{if(!target?.isConnected)return hide();tip.textContent=target.dataset.tooltip;tip.hidden=false;target.setAttribute('aria-describedby',[(target.getAttribute('aria-describedby')||''),tip.id].filter(Boolean).join(' '));positionFloating(tip,{anchor:target,prefer:'above'});},300);};
 document.addEventListener('pointerover',e=>{if(e.pointerType==='mouse'&&matchMedia('(hover:hover)').matches)show(e.target.closest('[data-tooltip]'));});
 document.addEventListener('pointerout',e=>{if(target&&!target.contains(e.relatedTarget))hide();});
 document.addEventListener('focusin',e=>{if(e.target.matches(':focus-visible'))show(e.target.closest('[data-tooltip]'));});
 document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide);document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);window.addEventListener('blur',hide);
 return hide;
}
