// Recording starts only from the microphone button, using the platform's permission flow.
export function bindVoiceSearch(ui,button,input,apply){
 ui.voiceSearch?.cancel();let recognition,active=false,nativeListener,timer;
 const reset=()=>{active=false;clearTimeout(timer);button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Голосовой поиск');button.classList.remove('listening');input.placeholder='Что хотите послушать?';if(nativeListener)window.removeEventListener('playerium-voice-result',nativeListener);nativeListener=null;};
 const accept=text=>{const value=String(text||'').trim().slice(0,200);reset();if(!input.isConnected)return;if(value)apply(value);else input.focus();};
 const cancel=()=>{if(recognition){recognition.onresult=recognition.onerror=recognition.onend=null;recognition.abort();recognition=null;}reset();};
 ui.voiceSearch={cancel,get active(){return active;}};button.setAttribute('aria-pressed','false');
 button.onclick=()=>{
  if(active){cancel();return;}
  active=true;button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Остановить голосовой поиск');button.classList.add('listening');input.placeholder='Слушаю…';
  if(window.AndroidBridge?.startVoiceSearch){
   nativeListener=event=>{const data=event.detail||{};if(data.error&&input.isConnected)ui.showToast(data.error,'error');accept(data.text);};window.addEventListener('playerium-voice-result',nativeListener);
   try{window.AndroidBridge.startVoiceSearch();timer=setTimeout(reset,120000);}catch{reset();ui.showToast('Не удалось открыть голосовой поиск.','error');}return;
  }
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){reset();ui.showToast('В этом браузере голосовой ввод недоступен. Можно ввести запрос вручную.');return;}
  try{
   recognition=new Recognition();recognition.lang=document.documentElement.lang||'ru-RU';recognition.interimResults=false;recognition.maxAlternatives=1;
   recognition.onresult=event=>accept(event.results?.[0]?.[0]?.transcript);
   recognition.onerror=event=>{reset();if(input.isConnected&&event.error!=='aborted')ui.showToast(event.error==='not-allowed'?'Нет доступа к микрофону. Разрешите его в настройках браузера.':event.error==='no-speech'?'Речь не распознана. Попробуйте ещё раз.':'Не удалось распознать речь. Попробуйте ещё раз.','error');};
   recognition.onend=reset;recognition.start();
  }catch{reset();ui.showToast('Не удалось запустить голосовой ввод.','error');}
 };
}
