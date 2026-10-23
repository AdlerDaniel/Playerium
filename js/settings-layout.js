// Navigation groups existing settings without replacing their controls or state.
export function organizeSettings(container,{mobile=false}={}){
 container.classList.add('settings-redesigned');
 const content=document.createElement('div');content.className='settings-content';
 const groups=[
  ['settings-account','Аккаунт',container.querySelector('.account-settings')],
  ['settings-appearance','Оформление',container.querySelector('.theme-picker')?.closest('.settings-section')],
  ['settings-sound','Звук',container.querySelector('.normalization-settings')],
  ['settings-files','Файлы',container.querySelector('#settingsFolderList')?.closest('.settings-section')],
  ['settings-updates','Обновления',container.querySelector('#btnCheckUpdatesManual')?.closest('.settings-section')],
  ['settings-shortcuts','Горячие клавиши',container.querySelector('.shortcuts-grid')?.closest('.settings-section')]
 ];
 const nav=document.createElement('nav');nav.className='settings-navigation';nav.setAttribute('aria-label','Разделы настроек');
 for(const [id,label,section] of groups){
  if(!section)continue;if(id==='settings-shortcuts'&&mobile){section.remove();continue;}
  const title=section.querySelector('.settings-section-title'),card=section.querySelector('.settings-card');if(title&&card)card.prepend(title);
  section.id=id;const link=document.createElement('a');link.href='#'+id;link.textContent=label;
  link.onclick=event=>{event.preventDefault();section.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  nav.append(link);content.append(section);
 }
 const layout=document.createElement('div');layout.className='settings-layout';layout.append(nav,content);container.append(layout);
 return content;
}
