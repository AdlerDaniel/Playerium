import {trackRange} from './track-edits.js';

async function analyze(ui,track){
 if(track.nativeUri)return ui.music.request('trimSilence',{uri:track.nativeUri});
 if(track.filePath)return ui.music.request('trimSilence',{filePath:track.filePath});
 const file=await ui.library.getAudioFile(track);
 if(!file)throw Error('Нет доступа к аудиофайлу.');
 const context=new OfflineAudioContext(2,1,48000);
 const audio=await context.decodeAudioData(await file.arrayBuffer());
 let first=audio.length,last=0;
 for(let channel=0;channel<audio.numberOfChannels;channel++){
  const samples=audio.getChannelData(channel),threshold=10**(-45/20);
  for(let i=0;i<first;i++)if(Math.abs(samples[i])>threshold){first=i;break;}
  for(let i=audio.length-1;i>=last;i--)if(Math.abs(samples[i])>threshold){last=i+1;break;}
 }
 return {duration:audio.duration,start:last>first?Math.max(0,first-240)/48000:0,end:last>first?Math.min(audio.length,last+240)/48000:audio.duration};
}

export function installTrackTrim(form,ui,track,showError){
 const error=form.querySelector('[role=alert]');
 error.insertAdjacentHTML('beforebegin',`<fieldset class="track-editor-trim">
  <legend>Длина трека</legend>
  <div class="trim-fields">
    <label class="dialog-field">Начало, с<input class="search-input" name="trimStart" type="number" inputmode="decimal" min="0" step="any"></label>
    <label class="dialog-field">Конец, с<input class="search-input" name="trimEnd" type="number" inputmode="decimal" min="0" step="any"></label>
  </div>
  <div class="trim-actions">
    <button type="button" class="settings-btn-secondary" data-trim-silence>Обрезать тишину</button>
    <button type="button" class="settings-btn-secondary" data-trim-reset>Сбросить</button>
  </div>
  <output class="settings-desc" aria-live="polite"></output>
 </fieldset>`);
 const fieldset=form.querySelector('.track-editor-trim'),start=form.elements.trimStart,end=form.elements.trimEnd;
 const silence=fieldset.querySelector('[data-trim-silence]'),output=fieldset.querySelector('output');
 let duration=track.duration||0,changed=false,generation=0,analysis=null;
 const precision=value=>Number(value.toFixed(3));
 const update=()=>{const length=end.valueAsNumber-start.valueAsNumber;output.value=Number.isFinite(length)&&length>0?'Длина после обрезки '+precision(length)+' с':'';};
 const showRange=(from,to)=>{start.value=precision(from);end.value=to>0?precision(to):'';update();};
 const range=trackRange(track);showRange(range.start,range.end);
 const markChanged=()=>{generation++;changed=true;showError('');update();};
 start.oninput=end.oninput=markChanged;
 fieldset.querySelector('[data-trim-reset]').onclick=()=>{showRange(0,duration);markChanged();};
 const label=silence.textContent;
 silence.onclick=async()=>{
  const request=++generation;silence.disabled=true;silence.textContent='Ищем тишину…';silence.setAttribute('aria-busy','true');showError('');
  try{
   analysis ||= analyze(ui,track);const range=await analysis;
   if(!form.isConnected||request!==generation)return;
   if(!duration)duration=range.duration;
   showRange(range.start,Math.min(duration,range.end));changed=true;
  }catch{analysis=null;if(form.isConnected&&request===generation)showError('Не удалось проанализировать звук. Проверьте доступ к файлу.');}
  finally{silence.disabled=false;silence.textContent=label;silence.setAttribute('aria-busy','false');}
 };
 return ()=>{
  if(!changed)return {};
  const from=start.valueAsNumber,to=end.valueAsNumber;
  if(from===0&&(!Number.isFinite(to)||(duration&&Math.abs(to-duration)<.001)))return {trim:null};
  if(duration&&to>duration+.001)throw Error('Конец выходит за длительность записи.');
  return {trim:{start:from,end:to}};
 };
}
