/** Keeps large libraries bounded in DOM while preserving original queue indices. */
export function mountTrackRows(table, tracks, createRow) {
  if (tracks.length <= 200) { tracks.forEach((track, index) => table.appendChild(createRow(track, index))); return; }
  const body = document.createElement('div');
  body.className = 'virtual-track-body';
  body.style.position = 'relative';
  const rowHeight = 64;
  body.style.height = `${tracks.length * rowHeight}px`;
  table.appendChild(body);
  let frame = 0;
  let lastStart = -1;
  let observer;
  function render() {
    frame = 0;
    if (!table.isConnected) return;
    const scroller = table.closest('.main-view');
    if (!scroller) return;
    const offset = scroller.getBoundingClientRect().top - body.getBoundingClientRect().top;
    const start = Math.max(0, Math.min(tracks.length - 1, Math.floor(offset / rowHeight) - 6));
    const count = Math.ceil(scroller.clientHeight / rowHeight) + 14;
    if (start === lastStart && body.childElementCount) return;
    lastStart = start;
    const rows = [];
    for (let i = start; i < Math.min(tracks.length, start + count); i++) {
      const row = createRow(tracks[i], i);
      row.style.position = 'absolute'; row.style.top = `${i * rowHeight}px`;
      row.style.height = `${rowHeight}px`; row.style.width = '100%';
      row.style.boxSizing = 'border-box';
      row.setAttribute('aria-posinset', i + 1); row.setAttribute('aria-setsize', tracks.length);
      rows.push(row);
    }
    body.replaceChildren(...rows);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  requestAnimationFrame(() => {
    const scroller = table.closest('.main-view');
    if (!scroller) return;
    scroller.addEventListener('scroll', schedule, { passive: true });
    const resize = new ResizeObserver(() => { lastStart = -1; schedule(); }); resize.observe(scroller);
    observer = new MutationObserver(() => {
      if (!table.isConnected) { scroller.removeEventListener('scroll', schedule); resize.disconnect(); observer.disconnect(); cancelAnimationFrame(frame); }
    });
    observer.observe(scroller, { childList: true, subtree: true });
    render();
  });
}
