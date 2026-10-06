export function renderRightQueue() {
    const container = document.getElementById("rightPanelContent");
    container.innerHTML = "";

    const curTrack = this.player.currentTrack;
    const upcoming = this.player.queue.slice(this.player.queueIndex + 1);

    let html = `
      <div class="queue-section-title">Сейчас играет</div>
    `;

    if (curTrack) {
      html += `
        <div class="queue-item current">
          <div class="queue-item-thumb">
            ${curTrack.pictureUrl ? `<img src="${curTrack.pictureUrl}" />` : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
          </div>
          <div class="queue-item-info">
            <div class="queue-item-title">${this.escapeHTML(curTrack.title)}</div>
            <div class="queue-item-artist">${this.escapeHTML(curTrack.artist)}</div>
          </div>
        </div>
      `;
    }

    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
        <div class="queue-section-title" style="margin:0;">Следующие в очереди (${upcoming.length})</div>
        ${upcoming.length > 0 ? `<button id="btnClearQueueBtn" style="font-size: 11px; font-weight: 600; color: var(--sp-text-subdued);">Очистить</button>` : ""}
      </div>
      <div class="queue-list" style="margin-top: 8px;">
    `;

    if (upcoming.length === 0) {
      html += `<div style="color: var(--sp-text-subdued); font-size: 13px; padding: 12px 0;">Очередь пуста. Вы можете нажать «Добавить в очередь» у любого трека.</div>`;
    } else {
      upcoming.forEach((track, idx) => {
        const queueListIdx = this.player.queueIndex + 1 + idx;
        html += `
          <div class="queue-item" data-queue-idx="${queueListIdx}">
            <div class="queue-item-thumb">
              ${track.pictureUrl ? `<img src="${track.pictureUrl}" />` : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">${this.escapeHTML(track.title)}</div>
              <div class="queue-item-artist">${this.escapeHTML(track.artist)}</div>
            </div>
            <button class="queue-item-remove" data-remove-idx="${queueListIdx}" title="Удалить из очереди">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;

    // Bind queue click events
    container.querySelectorAll(".queue-item").forEach((item) => {
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.addEventListener('keydown', e => {
        if (e.target === item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); item.click(); }
      });
      item.addEventListener("click", (e) => {
        if (e.target.closest(".queue-item-remove")) return;
        if (item.classList.contains('current')) { if (!this.player.isPlaying) this.player.play(); return; }
        const qIdx = parseInt(item.dataset.queueIdx, 10);
        this.player.queueIndex = qIdx;
        this.player.playTrack(this.player.queue[qIdx], qIdx);
      });
    });

    container.querySelectorAll(".queue-item-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rIdx = parseInt(btn.dataset.removeIdx, 10);
        this.player.removeFromQueue(rIdx);
        this.renderRightQueue();
      });
    });

    const clearBtn = document.getElementById("btnClearQueueBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.player.clearUpcomingQueue();
        this.renderRightQueue();
      });
    }
}
