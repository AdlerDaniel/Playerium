import { icons } from './design-icons.js';

export function contextKey(context) {
  return JSON.stringify([context?.type || 'tracks', context?.id || '', context?.extra || '']);
}

export function playRow(ui, track, tracks, context, toggle = false) {
  const player = ui.player;
  if(ui.connect&&ui.connect.selected!==ui.connect.id&&ui.connect.explicitTarget!==ui.connect.selected)return player.playTrack(track,tracks.indexOf(track),tracks,{...context});
  if (player.currentTrack?.id === track.id) {
    if (toggle && player.isPlaying) player.pause();
    else if (!player.isPlaying) player.play();
    return;
  }
  const sameOrder=tracks.length===player.queue.length&&tracks.every((item,index)=>item.id===player.queue[index]?.id);
  if (contextKey(player.playbackContext) === contextKey(context) && (sameOrder||player.isShuffle||!ui.tableSortExplicit)) {
    const index = player.queue.findIndex(t => t.id === track.id);
    if (index >= 0) return player.playTrack(track, index);
  }
  return player.playTrack(track, tracks.indexOf(track), tracks, { ...context });
}

export function bindCollectionPlay(ui, button, tracks, context) {
  button.dataset.playbackContext = contextKey(context);
  button.disabled = !tracks.length;
  button.addEventListener('click', () => {
    if (!tracks.length) return;
    if (contextKey(ui.player.playbackContext) === contextKey(context) && ui.player.currentTrack && !(ui.connect&&ui.connect.selected!==ui.connect.id&&ui.connect.explicitTarget!==ui.connect.selected)) ui.player.togglePlay();
    else ui.player.playTrack(tracks[0], 0, tracks, { ...context });
  });
  updateCollectionButton(ui.player, button);
}

function updateCollectionButton(player, button) {
  const playing = player.isPlaying && !!player.currentTrack && button.dataset.playbackContext === contextKey(player.playbackContext);
  if (button.dataset.playing !== String(playing)) button.innerHTML = playing ? icons.pause : icons.play;
  button.title = playing ? 'Пауза' : 'Воспроизвести';
  button.setAttribute('aria-label', button.title);
  button.dataset.playing = String(playing);
}

export function syncPlaybackControls(player) {
  document.querySelectorAll('.collection-shuffle').forEach(button=>button.setAttribute('aria-pressed',String(player.isShuffle)));
  document.querySelectorAll('[data-playback-context]').forEach(button => updateCollectionButton(player, button));
  document.querySelectorAll('[data-track-play-id]').forEach(button => {
    const playing = player.isPlaying && button.dataset.trackPlayId === player.currentTrack?.id;
    if (button.dataset.playing !== String(playing)) button.innerHTML = playing ? icons.pause : icons.play;
    button.dataset.playing = String(playing);
    button.title = playing ? 'Пауза' : 'Воспроизвести';
    button.setAttribute('aria-label', button.title);
  });
  document.querySelectorAll('.track-row').forEach(row => {
    const current = row.dataset.trackId === player.currentTrack?.id;
    row.classList.toggle('playing', current);
    row.classList.toggle('is-playing', current && player.isPlaying);
    const button = row.querySelector('.track-row-play');
    const playing = current && player.isPlaying;
    if (button.dataset.playing !== String(playing)) button.innerHTML = playing ? icons.pause : icons.play;
    button.dataset.playing = String(playing);
    button.title = playing ? 'Пауза' : 'Воспроизвести';
    button.setAttribute('aria-label', button.title);
  });
}

// Pointer capture keeps mouse, pen and touch drags attached to their slider.
export function bindSlider(element, { label, getValue, preview, commit, step = 1, enabled = () => true, fine = false, formatValue }) {
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', label);
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');
  element.setAttribute('aria-valuenow', String(getValue()));
  let pointer = null;
  let value = getValue();
  let lastX=0,startY=0,hold;
  const hint=fine?document.createElement('span'):null;if(hint){hint.className='seek-precision-indicator';hint.hidden=true;element.parentElement?.append(hint);}
  const update = e => {
    const rect = element.getBoundingClientRect();
    const distance=Math.abs(e.clientY-startY),precise=fine&&(element.dataset.fineSeek==='true'||distance>40),factor=precise?(distance>120?.1:.25):1;
    value = Math.max(0, Math.min(100, precise?value+(e.clientX-lastX)/rect.width*100*factor:(e.clientX - rect.left) / rect.width * 100));lastX=e.clientX;
    element.dataset.previewValue=String(value);if(precise)element.dataset.fineSeek='true';
    if(hint){hint.hidden=!precise;hint.textContent=(formatValue?formatValue(value):Math.round(value)+'%')+' · Точно';}
    preview(value);
    element.setAttribute('aria-valuenow', String(Math.round(value)));
    if(formatValue)element.setAttribute('aria-valuetext',formatValue(value));
  };
  element.addEventListener('pointerdown', e => {
    if (pointer !== null || e.button !== 0 || !enabled()) return;
    e.preventDefault();
    element.focus();
    pointer = e.pointerId;
    lastX=e.clientX;startY=e.clientY;value=getValue();
    element.dataset.dragging = 'true';
    element.setPointerCapture(pointer);
    update(e);
    if(fine)hold=setTimeout(()=>{if(pointer!==null)element.dataset.fineSeek='true';},350);
  });
  element.addEventListener('pointermove', e => { if (e.pointerId === pointer) update(e); });
  element.addEventListener('pointerup', e => {
    if (e.pointerId !== pointer) return;
    update(e);
    pointer = null;
    clearTimeout(hold);delete element.dataset.fineSeek;delete element.dataset.previewValue;
    if(hint)hint.hidden=true;
    delete element.dataset.dragging;
    commit(value);
    element.releasePointerCapture(e.pointerId);
  });
  const cancel = () => { pointer = null;clearTimeout(hold);delete element.dataset.fineSeek;delete element.dataset.previewValue; delete element.dataset.dragging;if(hint)hint.hidden=true; preview(getValue()); };
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('lostpointercapture', () => { if (pointer !== null) cancel(); });
  element.addEventListener('keydown', e => {
    if(e.key==='Escape'&&pointer!==null){e.preventDefault();cancel();return;}
    if (!enabled()) return;
    const increment = typeof step === 'function' ? step() : step;
    const keys = { ArrowRight: increment, ArrowUp: increment, ArrowLeft: -increment, ArrowDown: -increment, PageUp: increment * 10, PageDown: -increment * 10 };
    if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    value = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : Math.max(0, Math.min(100, getValue() + keys[e.key]));
    preview(value); commit(value);
    element.setAttribute('aria-valuenow', String(Math.round(value)));
  });
}

export function bindSeekRange(ui,range,onPreview=()=>{}){
  if(!range||range.dataset.precisionBound)return;range.dataset.precisionBound='true';
  bindSlider(range,{label:range.getAttribute('aria-label')||'Позиция песни',fine:true,enabled:()=>!range.disabled&&ui.player.getDuration()>0,getValue:()=>ui.player.getDuration()>0?ui.player.getCurrentTime()/ui.player.getDuration()*100:0,
    formatValue:value=>ui.formatTime(value/100*ui.player.getDuration()),preview:value=>{range.value=value;onPreview(value);},commit:value=>ui.player.seek(value),step:()=>500/ui.player.getDuration()});
}
