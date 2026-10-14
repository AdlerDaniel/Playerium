export function initSidebarCollapse(ui){
 const button=document.getElementById('btnLibraryHeader');if(!button)return;
 const apply=collapsed=>{document.body.classList.toggle('library-collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Развернуть медиатеку':'Свернуть медиатеку');};
 apply(localStorage.getItem('playerium_sidebar_collapsed')==='true');button.addEventListener('click',e=>{if(ui.isMobile)return;e.stopPropagation();const collapsed=!document.body.classList.contains('library-collapsed');apply(collapsed);localStorage.setItem('playerium_sidebar_collapsed',String(collapsed));});
 const sidebar=document.querySelector('.sidebar');if(sidebar){const labelItems=()=>{for(const item of sidebar.querySelectorAll('.sidebar-item')){const title=item.querySelector('.item-title')?.textContent||item.querySelector('.item-info')?.textContent?.trim();if(title){item.title=title;item.setAttribute('aria-label',title);}}};new MutationObserver(labelItems).observe(sidebar,{childList:true,subtree:true});labelItems();}
}
