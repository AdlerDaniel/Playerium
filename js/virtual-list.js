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
  let lastEnd = -1;
  const mounted = new Map();
  let observer;
  function render() {
    frame = 0;
    if (!table.isConnected) return;
    const scroller = table.closest('.main-view');
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect();
    // DOM rectangles include application zoom; row offsets use layout pixels.
    const scale = bounds.height / scroller.offsetHeight || 1;
    const offset = (bounds.top - body.getBoundingClientRect().top) / scale;
    const start = Math.max(0, Math.min(tracks.length - 1, Math.floor(offset / rowHeight) - 6));
    const count = Math.ceil(scroller.clientHeight / rowHeight) + 14;
    const end = Math.min(tracks.length, start + count);
    if (start === lastStart && end === lastEnd && body.childElementCount) return;
    lastStart = start;
    lastEnd = end;
    for (const [index, row] of mounted) {
      if (index < start || index >= end) { row.remove(); mounted.delete(index); }
    }
    for (let i = start; i < end; i++) {
      if (mounted.has(i)) continue;
      const row = createRow(tracks[i], i, true);
      row.style.position = 'absolute'; row.style.top = `${i * rowHeight}px`;
      row.style.height = `${rowHeight}px`; row.style.width = '100%';
      row.style.boxSizing = 'border-box';
      row.setAttribute('aria-posinset', i + 1); row.setAttribute('aria-setsize', tracks.length);
      mounted.set(i, row);
      // Insert only new rows: retain decoded artwork, focus and hover state.
      const next = [...body.children].find(node => Number(node.getAttribute('aria-posinset')) > i + 1);
      body.insertBefore(row, next || null);
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  requestAnimationFrame(() => {
    const scroller = table.closest('.main-view');
    if (!scroller) return;
    scroller.addEventListener('scroll', schedule, { passive: true });
    const resize = new ResizeObserver(schedule); resize.observe(scroller);
    observer = new MutationObserver(() => {
      if (!table.isConnected) { scroller.removeEventListener('scroll', schedule); resize.disconnect(); observer.disconnect(); cancelAnimationFrame(frame); mounted.clear(); }
    });
    observer.observe(scroller, { childList: true, subtree: true });
    render();
  });
}
