export function releaseChanges(notes) {
  const lines=String(notes||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const bullets=lines.filter(s=>/^[-*+]\s+|^\d+[.)]\s+/.test(s));
  return (bullets.length?bullets:lines).filter(s=>!/^#{1,6}\s|^\*\*Full Changelog|^https?:\/\/|^Проверено:|^Прошли |^Android проверен|^<!--/.test(s))
    .map(s=>s.replace(/^[-*+]\s+|^\d+[.)]\s+/,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*|`/g,''))
    .filter(Boolean).slice(0,30);
}

export function bindUpdateController() {
  const modal=document.getElementById('modalUpdateAvailable');
  const button=document.getElementById('btnDownloadUpdate');
  const ignore=document.getElementById('btnUpdateLater');
  const status=document.getElementById('updateDownloadStatus');
  const text=document.getElementById('updateStatusText');
  const progress=document.getElementById('updateProgress');
  const fill=document.getElementById('updateProgressBarFill');
  const pendingKey='playerium_pending_update';
  const clearPending=()=>{try{localStorage.removeItem(pendingKey);}catch{}};
  const activeStates=new Set(['preparing','downloading','verifying','installing','permission']);
  let busy=false;
  this.lastUpdateInfo=null;
  this.ui.showUpdateModal=info=>{
    if(busy)return;
    this.lastUpdateInfo=info;
    const list=document.getElementById('updateModalNotes');list.replaceChildren();
    for(const change of releaseChanges(info.releaseNotes)) {
      const li=document.createElement('li');li.textContent=change;list.append(li);
    }
    status.hidden=true;button.hidden=false;ignore.hidden=false;button.disabled=false;button.textContent='Обновить';ignore.disabled=false;ignore.textContent='Игнорировать';
    modal.classList.add('active');
    button.focus({preventScroll:true});
  };
  this.onUpdateState=data=>{
    if(!data)return;
    const labels={preparing:'Подготовка обновления',downloading:'Скачивание',verifying:'Проверка обновления',installing:'Установка',permission:'Подтвердите установку',complete:'Обновление установлено'};
    status.hidden=false;text.textContent=data.message||labels[data.state]||'';
    const percent=Math.max(0,Math.min(100,Number(data.percent)||0));
    progress.hidden=['failed','complete','permission'].includes(data.state);fill.style.width=percent+'%';progress.setAttribute('aria-valuenow',String(percent));
    const indeterminate=data.state!=='downloading';progress.classList.toggle('indeterminate',indeterminate);
    if(indeterminate)progress.removeAttribute('aria-valuenow');
    if(data.state==='downloading')text.textContent=`Скачивание ${percent}%`;
    busy=activeStates.has(data.state);
    if(busy)modal.classList.add('active');
    button.disabled=busy;ignore.disabled=busy;button.textContent=data.state==='failed'?'Обновить':busy?(labels[data.state]||'Обновление'):'Обновить';
    button.hidden=busy||data.state==='complete'||!this.lastUpdateInfo;ignore.hidden=busy;
    ignore.textContent=button.hidden?'Закрыть':'Игнорировать';
    modal.dataset.busy=String(busy);
    if(!busy)clearPending();
  };
  this.onUpdateDownloadFailed=message=>this.onUpdateState({state:'failed',message});
  this.ui.handleDownloadUpdate=async(info=this.lastUpdateInfo)=>{
    if(busy)return;
    if(!info)return;
    try{localStorage.setItem(pendingKey,JSON.stringify(info));}catch{}
    this.onUpdateState({state:'preparing'});
    try {
      const request={latestVersion:info.latestVersion,repo:info.repo||this.ui.updater.repo};
      if(window.electronAPI?.installUpdate)await window.electronAPI.installUpdate(request);
      else if(window.AndroidBridge?.installUpdate)window.AndroidBridge.installUpdate(JSON.stringify(request));
      else throw Error('Обновление доступно в приложении '+(window.PlayeriumBranding?.getName()||'Playerium')+' для Windows и Android.');
    }catch(error){this.onUpdateDownloadFailed(error.message||'Не удалось обновить приложение. Попробуйте снова.');}
  };
  button.onclick=()=>this.ui.handleDownloadUpdate();
  ignore.onclick=()=>{
    if(busy)return;
    if(this.lastUpdateInfo&&!button.hidden)try{this.ui.updater.ignoreVersion(this.lastUpdateInfo.latestVersion);}catch{}
    modal.classList.remove('active');
  };
  window.electronAPI?.onUpdateState?.(data=>this.onUpdateState(data));
  const restore=data=>{
    if(data?.state==='complete'){clearPending();return;}
    if(data?.state==='failed'){clearPending();if(!busy)this.ui.showToast(data.message||'Не удалось завершить обновление','error');return;}
    if(activeStates.has(data?.state)) {
      try{const info=JSON.parse(localStorage.getItem(pendingKey));if(info)this.ui.showUpdateModal(info);}catch{}
      this.onUpdateState(data);
    }
  };
  window.electronAPI?.getUpdateStatus?.().then(restore).catch(()=>{});
  if(window.AndroidBridge?.getUpdateStatus){
    try {restore(JSON.parse(window.AndroidBridge.getUpdateStatus()));}catch{}
  }
  if(this.ui.pendingUpdateInfo){this.ui.showUpdateModal(this.ui.pendingUpdateInfo);this.ui.pendingUpdateInfo=null;}
}
