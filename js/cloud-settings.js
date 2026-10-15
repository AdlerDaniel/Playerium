const GUIDE='https://github.com/AdlerDaniel/Playerium/blob/main/docs/google-drive-setup.md';
export function renderCloudSettings(ui,container){
 const cloud=ui.cloud;if(!cloud)return;
 const section=document.createElement('section');section.className='settings-section cloud-settings';
 section.innerHTML=`<h2 class="settings-section-title">Google Диск</h2><div class="settings-card">
 <div class="settings-label">Музыка на всех устройствах</div><p class="settings-desc">Треки, обложки, любимые песни и плейлисты синхронизируются между компьютером и телефоном. Музыка сохраняется на устройстве для прослушивания без сети.</p>
 <p class="settings-desc" data-cloud-status role="status" aria-live="polite"></p>
 <div class="cloud-actions"><button class="settings-btn-primary" data-connect>Подключить Google Диск</button><button class="settings-btn-primary" data-sync>Синхронизировать</button><button class="settings-btn-secondary" data-disconnect>Отключить</button></div>
 <details data-setup><summary>Настройка подключения</summary><p class="settings-desc">Один раз настройте Google Cloud по инструкции. Используйте один проект и один аккаунт Google на обоих устройствах.</p><div class="cloud-actions"><button class="settings-btn-secondary" data-guide>Открыть инструкцию</button><button class="settings-btn-secondary" data-configure>Загрузить файл настройки</button></div></details>
 <details data-trash hidden><summary>Удалённые песни</summary><p class="settings-desc">Удаление действует на обоих устройствах. Резервную копию можно восстановить здесь.</p><div data-trash-list></div></details></div>`;
 container.querySelector('.settings-header')?.after(section);
 let working=false;
 const buttons=[...section.querySelectorAll('button')];
 const update=()=>{
  if(!section.isConnected)return;
  const connected=cloud.status.connected,busy=working||cloud.busy;
  const pending=Math.max(cloud.outbox.length,cloud.status.pending||0);
  section.querySelector('[data-cloud-status]').textContent=cloud.error||cloud.status.error||(busy?cloud.progress?.total?`Загрузка треков: ${cloud.progress.done} из ${cloud.progress.total}`:'Синхронизация…':connected?`Подключён ${cloud.status.email||'Google Диск'}${pending?` · В очереди: ${pending}`:cloud.lastSync?cloud.realtime?.state==='online'?' · Изменения сохранены · В реальном времени':' · Изменения сохранены':''}`:cloud.available?'Google Диск не подключён.':'Подключение доступно в приложении для Windows и Android.');
  buttons.forEach(b=>b.disabled=busy);
  section.querySelector('[data-connect]').hidden=connected&&!cloud.status.error;section.querySelector('[data-connect]').textContent=connected?'Войти повторно':'Подключить Google Диск';section.querySelector('[data-connect]').disabled=busy||!cloud.available;
  section.querySelector('[data-sync]').hidden=!connected;section.querySelector('[data-disconnect]').hidden=!connected;
  section.querySelector('[data-configure]').hidden=!window.electronAPI?.cloudRequest;
  const trash=cloud.trash;section.querySelector('[data-trash]').hidden=!connected||!trash.length;
  const list=section.querySelector('[data-trash-list]');list.replaceChildren();
  for(const track of trash){const row=document.createElement('div');row.className='settings-row';const label=document.createElement('span');label.textContent=`${track.data.title} · ${track.data.artist}`;label.className='settings-label-wrap';const restore=document.createElement('button');restore.className='settings-btn-secondary';restore.textContent='Восстановить';restore.disabled=busy;restore.onclick=()=>run(()=>cloud.restore(track.key));row.append(label,restore);list.append(row);}
 };
 const run=async action=>{working=true;cloud.error=null;update();try{await action();}catch(error){cloud.error=error.message;}finally{working=false;update();}};
 section.querySelector('[data-connect]').onclick=()=>run(()=>cloud.connect());
 section.querySelector('[data-sync]').onclick=()=>run(()=>cloud.sync());
 section.querySelector('[data-disconnect]').onclick=()=>run(()=>cloud.disconnect());
 section.querySelector('[data-configure]').onclick=()=>run(async()=>{await cloud.request('configure');await cloud.refreshStatus();});
 section.querySelector('[data-guide]').onclick=()=>{if(window.electronAPI?.openExternal)window.electronAPI.openExternal(GUIDE);else if(window.AndroidBridge?.openExternalUrl)window.AndroidBridge.openExternalUrl(GUIDE);else window.open(GUIDE,'_blank','noopener');};
 cloud.changed=update;update();
}
