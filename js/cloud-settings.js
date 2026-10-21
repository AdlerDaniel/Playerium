export function renderCloudSettings(ui,container){
 const cloud=ui.cloud;if(!cloud)return;
 const section=document.createElement('section');section.className='settings-section account-settings';section.id='settings-account';
 section.innerHTML='<h2 class="settings-section-title">Аккаунт</h2><div class="settings-card account-card"><div class="account-avatar" aria-hidden="true">G</div><div class="settings-label-wrap"><span class="settings-label" data-account-name>Ваш аккаунт Google</span><span class="settings-desc" data-account-email>Войдите в свой аккаунт на каждом устройстве.</span></div><button class="settings-btn-primary" data-connect>Войти через Google</button><button class="settings-btn-secondary" data-disconnect hidden>Выйти</button><p class="settings-desc account-error" data-account-error role="alert" hidden></p></div>';
 container.querySelector('.settings-header')?.after(section);
 const login=section.querySelector('[data-connect]'),logout=section.querySelector('[data-disconnect]'),error=section.querySelector('[data-account-error]');let working=false,authError='';
 function update(){
  if(!section.isConnected)return;
  const connected=!!cloud.status.connected;
  section.querySelector('[data-account-name]').textContent=connected?'Вы вошли в Google':'Ваш аккаунт Google';
  section.querySelector('[data-account-email]').textContent=connected?(cloud.status.email||'Аккаунт подключён'):'Войдите в свой аккаунт на каждом устройстве.';
  login.hidden=connected;logout.hidden=!connected;login.disabled=working||!cloud.available;logout.disabled=working;
  login.textContent=working?'Выполняется вход…':'Войти через Google';login.classList.toggle('is-loading',working);login.setAttribute('aria-busy',String(working));
  error.textContent=authError;error.hidden=!authError;
 }
 async function run(action){if(working)return;working=true;authError='';update();try{await action();}catch(e){authError=e.message;}finally{working=false;update();}}
 login.onclick=()=>run(()=>cloud.connect());logout.onclick=()=>run(()=>cloud.disconnect());
 cloud.changed=update;update();return section;
}
