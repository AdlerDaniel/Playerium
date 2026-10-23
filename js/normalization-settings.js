export function renderNormalizationSettings(ui,container){
 const section=document.createElement('section');section.className='settings-section normalization-settings';
 section.innerHTML=`<div class="settings-card"><h2 class="settings-section-title">Нормализация громкости</h2><div class="normalization-actions"><button class="settings-btn-secondary" data-normalization-check>Проверить готовность</button><button class="settings-btn-primary" data-normalization-run>Запустить нормализацию</button></div><p class="normalization-status" data-normalization-status role="status" aria-live="polite" hidden></p><progress class="normalization-progress" data-normalization-progress aria-label="Готовность нормализации" max="1" value="0" hidden></progress><p data-normalization-count hidden></p></div>`;
 container.append(section);
 const status=section.querySelector('[data-normalization-status]'),progress=section.querySelector('progress'),count=section.querySelector('[data-normalization-count]'),check=section.querySelector('[data-normalization-check]'),run=section.querySelector('[data-normalization-run]');let busy=false,stop,timer;
 const preparation=()=>ui.audioPreparation||window.playerApp?.audioPreparation;
 function update(state){
  const supported=state?.supported,busyWork=state?.running||state?.active,complete=state?.checked&&state.total>0&&state.ready===state.total;
  status.textContent=!supported?'Доступно в приложении для Windows и Android.':state.error||(!state.checked?'Проверка готовности…':complete?'Нормализация завершена. Все скачанные треки готовы.':!state.total?'Скачанных треков пока нет.':busyWork?'Нормализация выполняется…':state.failed?'Есть треки, которые не удалось подготовить. Проверьте доступ к файлам и свободное место.':state.pending?'Треки ожидают фоновой обработки.':'Есть треки без нормализации. Можно запустить подготовку.');
  section.dataset.state=complete?'complete':busyWork?'working':state?.failed?'error':'idle';
  count.textContent=state?.checked&&state.total?`Готово ${state.ready} из ${state.total}${state.failed?` · Ошибок: ${state.failed}`:''}${state.peakLimited?` · ${state.peakLimited} тише цели для защиты от перегруза`:''}`:'';
  progress.hidden=!busyWork;progress.max=Math.max(1,state?.total||0);progress.value=state?.ready||0;
  run.disabled=busy||!supported||busyWork||!state?.total;check.disabled=busy||!supported;
 }
 async function invoke(action){busy=true;status.hidden=false;count.hidden=false;update(preparation()?.state);try{await action();}catch(error){ui.showToast(error.message,'error');}finally{busy=false;update(preparation()?.state);}}
 check.onclick=()=>invoke(()=>preparation().refresh());run.onclick=()=>invoke(()=>preparation().scan(true));
 async function poll(){if(!section.isConnected){stop?.();return;}const service=preparation();if(service){if(!stop)stop=service.subscribe(update);await service.refresh();}else update(null);timer=setTimeout(poll,2000);}
 void poll();return section;
}
