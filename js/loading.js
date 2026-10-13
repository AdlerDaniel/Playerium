export function loadingRows(count=4){
 const root=document.createElement('div');root.className='loading-rows';root.setAttribute('role','status');root.setAttribute('aria-label','Загрузка треков');root.setAttribute('aria-busy','true');
 root.innerHTML=Array.from({length:count},()=>'<div class="loading-row" aria-hidden="true"><i class="skeleton loading-art"></i><div><i class="skeleton loading-title"></i><i class="skeleton loading-subtitle"></i></div></div>').join('');return root;
}
