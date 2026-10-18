export function renderNormalizationSettings(ui,container){
 const section=document.createElement('section');section.className='settings-section normalization-settings';
 section.innerHTML=`<h2 class="settings-section-title">Громкость музыки</h2><div class="settings-card"><span class="settings-label">Нормализация громкости</span><p class="settings-desc">Единый уровень для скачанных песен. Подготовка идёт в фоне и не задерживает воспроизведение.</p><p class="settings-desc normalization-status" data-normalization-status role="status" aria-live="polite">Проверка готовности…</p><progress class="normalization-progress" data-normalization-progress aria-label="Готовность нормализации" max="1" value="0"></progress><p class="settings-desc" data-normalization-count></p><div class="normalization-actions"><button class="settings-btn-secondary" data-normalization-check>Проверить готовность</button><button class="settings-btn-primary" data-normalization-run>Запустить нормализацию</button></div><p class="settings-desc" data-playback-latency hidden></p></div>`;
 const eq=container.querySelector('#eqFadersContainer')?.closest('.settings-section');if(eq)eq.before(section);else container.append(section);
 const status=section.querySelector('[data-normalization-status]'),progress=section.querySelector('progress'),count=section.querySelector('[data-normalization-count]'),check=section.querySelector('[data-normalization-check]'),run=section.querySelector('[data-normalization-run]');let busy=false,stop,timer;
 const preparation=()=>ui.audioPreparation||window.playerApp?.audioPreparation;
 function update(state){
  if(state?.writesOriginal)section.querySelector('.settings-desc').textContent='Цель −7 LUFS. Одна постоянная поправка на всю песню, без приглушения во время воспроизведения. Результат сохраняется в исходном файле.';
  const supported=state?.supported,busyWork=state?.running||state?.active,complete=state?.checked&&state.total>0&&state.ready===state.total;
  status.textContent=!supported?'Доступно в приложении для Windows и Android.':state.error||(!state.checked?'Проверка готовности…':complete?'Нормализация завершена. Все скачанные треки готовы.':!state.total?'Скачанных треков пока нет.':busyWork?'Нормализация выполняется…':state.failed?'Есть треки, которые не удалось подготовить. Проверьте доступ к файлам и свободное место.':state.pending?'Треки ожидают фоновой обработки.':'Есть треки без нормализации. Можно запустить подготовку.');
  section.dataset.state=complete?'complete':busyWork?'working':state?.failed?'error':'idle';
  count.textContent=state?.checked&&state.total?`Готово ${state.ready} из ${state.total}${state.failed?` · Ошибок: ${state.failed}`:''}${state.peakLimited?` · ${state.peakLimited} тише цели для защиты от перегруза`:''}`:'';
  progress.hidden=!state?.total;progress.max=Math.max(1,state?.total||0);progress.value=state?.ready||0;
  run.disabled=busy||!supported||busyWork||!state?.total;check.disabled=busy||!supported;
  const latency=section.querySelector('[data-playback-latency]');latency.hidden=!Number.isFinite(ui.player.lastNativeStartMs);if(!latency.hidden)latency.textContent=`Последний запуск звука: ${Math.round(ui.player.lastNativeStartMs)} мс`;
 }
 async function invoke(action){busy=true;update(preparation()?.state);try{await action();}catch(error){ui.showToast(error.message,'error');}finally{busy=false;update(preparation()?.state);}}
 check.onclick=()=>invoke(()=>preparation().refresh());run.onclick=()=>invoke(()=>preparation().scan(true));
 async function poll(){if(!section.isConnected){stop?.();return;}const service=preparation();if(service){if(!stop)stop=service.subscribe(update);await service.refresh();}else update(null);timer=setTimeout(poll,2000);}
 void poll();return section;
}
