export function loadingRows(count=4){
 const root=document.createElement('div');root.className='loading-rows';root.setAttribute('role','status');root.setAttribute('aria-label','Загрузка треков');root.setAttribute('aria-busy','true');
 root.innerHTML=Array.from({length:count},()=>'<div class="loading-row" aria-hidden="true"><i class="skeleton loading-art"></i><div><i class="skeleton loading-title"></i><i class="skeleton loading-subtitle"></i></div></div>').join('');return root;
}
export function loadingIndicator(label){const root=document.createElement('div');root.className='loading-indicator';root.setAttribute('role','status');root.setAttribute('aria-busy','true');const wheel=document.createElement('i');wheel.className='loading-wheel';wheel.setAttribute('aria-hidden','true');const text=document.createElement('span');text.textContent=label;root.append(wheel,text);return root;}
export function loadingCards(count=4,round=false){
 const root=document.createElement('div');root.className='loading-cards search-entity-grid'+(round?' round':'');root.setAttribute('role','status');root.setAttribute('aria-label','Загрузка обложек');root.setAttribute('aria-busy','true');
 for(let i=0;i<count;i++){const card=document.createElement('div');card.className='loading-card';card.setAttribute('aria-hidden','true');card.innerHTML='<i class="skeleton loading-card-art"></i><i class="skeleton loading-title"></i><i class="skeleton loading-subtitle"></i>';root.append(card);}return root;
}
export function loadingFeature(){const root=document.createElement('div');root.className='loading-feature';root.setAttribute('aria-hidden','true');root.innerHTML='<i class="skeleton loading-feature-art"></i><i class="skeleton loading-title"></i><i class="skeleton loading-subtitle"></i>';return root;}
