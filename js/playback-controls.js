import { icons } from './design-icons.js';

export function contextKey(context) {
  return JSON.stringify([context?.type || 'tracks', context?.id || '', context?.extra || '']);
}

export function playRow(ui, track, tracks, context, toggle = false) {
  const player = ui.player;
  if (player.currentTrack?.id === track.id) {
    if (toggle && player.isPlaying) player.pause();
    else if (!player.isPlaying) player.play();
    return;
  }
  if (contextKey(player.playbackContext) === contextKey(context)) {
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
    if (contextKey(ui.player.playbackContext) === contextKey(context) && ui.player.currentTrack) ui.player.togglePlay();
    else ui.player.playTrack(tracks[0], 0, tracks, { ...context });
  });
  updateCollectionButton(ui.player, button);
}

function updateCollectionButton(player, button) {
  const playing = player.isPlaying && !!player.currentTrack && button.dataset.playbackContext === contextKey(player.playbackContext);
  button.innerHTML = playing ? icons.pause : icons.play;
  button.title = playing ? 'Пауза' : 'Воспроизвести';
  button.setAttribute('aria-label', button.title);
  button.dataset.playing = String(playing);
}

export function syncPlaybackControls(player) {
  document.querySelectorAll('[data-playback-context]').forEach(button => updateCollectionButton(player, button));
  document.querySelectorAll('[data-track-play-id]').forEach(button => {
    const playing = player.isPlaying && button.dataset.trackPlayId === player.currentTrack?.id;
    button.innerHTML = playing ? icons.pause : icons.play;
    button.title = playing ? 'Пауза' : 'Воспроизвести';
    button.setAttribute('aria-label', button.title);
  });
  document.querySelectorAll('.track-row').forEach(row => {
    const current = row.dataset.trackId === player.currentTrack?.id;
    row.classList.toggle('playing', current);
    row.classList.toggle('is-playing', current && player.isPlaying);
    const button = row.querySelector('.track-row-play');
    button.innerHTML = current && player.isPlaying ? icons.pause : icons.play;
    button.title = current && player.isPlaying ? 'Пауза' : 'Воспроизвести';
    button.setAttribute('aria-label', button.title);
  });
}

// Pointer capture keeps mouse, pen and touch drags attached to their slider.
export function bindSlider(element, { label, getValue, preview, commit, step = 1, enabled = () => true }) {
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', label);
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');
  element.setAttribute('aria-valuenow', String(getValue()));
  let pointer = null;
  let value = getValue();
  const update = e => {
    const rect = element.getBoundingClientRect();
    value = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    preview(value);
    element.setAttribute('aria-valuenow', String(Math.round(value)));
  };
  element.addEventListener('pointerdown', e => {
    if (pointer !== null || e.button !== 0 || !enabled()) return;
    e.preventDefault();
    element.focus();
    pointer = e.pointerId;
    element.dataset.dragging = 'true';
    element.setPointerCapture(pointer);
    update(e);
  });
  element.addEventListener('pointermove', e => { if (e.pointerId === pointer) update(e); });
  element.addEventListener('pointerup', e => {
    if (e.pointerId !== pointer) return;
    update(e);
    pointer = null;
    delete element.dataset.dragging;
    commit(value);
    element.releasePointerCapture(e.pointerId);
  });
  const cancel = () => { pointer = null; delete element.dataset.dragging; preview(getValue()); };
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('lostpointercapture', () => { if (pointer !== null) cancel(); });
  element.addEventListener('keydown', e => {
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
