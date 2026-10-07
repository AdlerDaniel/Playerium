export function renderSettingsView(container) {
    const settingsDiv = document.createElement("div");
    settingsDiv.className = "settings-container";

    const eq = this.player.equalizer;
    const presetsOptions = Object.keys(eq ? eq.constructor.PRESETS : {})
      .map((key) => `<option value="${key}" ${eq && eq.currentPreset === key ? "selected" : ""}>${eq.constructor.PRESETS[key].name}</option>`)
      .join("");

    const foldersListHtml = this.library.folders.map((f) => `
      <div class="folder-item">
        <div class="folder-path-wrap">
          <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          <span class="folder-path">${this.escapeHTML(f.name)}</span>
          <span class="folder-count">(${f.count} файлов)</span>
        </div>
        <button class="btn-remove-folder" data-folder-id="${f.id}" title="Удалить из медиатеки">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `).join("");

    settingsDiv.innerHTML = `
      <div class="settings-header">
        <h1>Настройки</h1>
      </div>

      <!-- Folders Management -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          Локальные файлы и папки
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Папки с музыкой на устройстве</span>
              <span class="settings-desc">Укажите каталоги, где хранятся ваши MP3, FLAC, WAV или M4A треки.</span>
            </div>
            <button class="settings-btn-primary" id="btnSettingsAddFolder">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Добавить папку
            </button>
          </div>
          <div class="folder-list" id="settingsFolderList">
            ${foldersListHtml || `<div style="color: var(--sp-text-subdued); font-size: 13px;">Папки пока не добавлены. Нажмите «Добавить папку» или перетащите аудиофайлы в окно плеера.</div>`}
          </div>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button class="settings-btn-secondary" id="btnClearAllLibrary">Очистить всю медиатеку</button>
          </div>
        </div>
      </div>

      <!-- Equalizer Section -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>
          10-полосный эквалайзер
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Включить эквалайзер</span>
              <span class="settings-desc">Настройте частоты или выберите готовый аудио-пресет.</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="settingsEqToggle" ${eq && eq.isEnabled ? "checked" : ""}>
              <span class="slider-toggle"></span>
            </label>
          </div>
          <div class="eq-presets-row">
            <span class="settings-label" style="font-size: 13px;">Пресет:</span>
            <select class="eq-select" id="settingsEqPreset">
              ${presetsOptions}
              <option value="custom" ${eq && eq.currentPreset === "custom" ? "selected" : ""}>Пользовательский (Custom)</option>
            </select>
          </div>
          <div class="eq-faders-container" id="eqFadersContainer">
            ${eq ? eq.constructor.FREQUENCIES.map((freq, idx) => `
              <div class="eq-fader-col">
                <span class="eq-fader-val" id="eqVal_${idx}">${eq.gains[idx] > 0 ? "+" : ""}${eq.gains[idx]}dB</span>
                <input type="range" class="eq-slider-vertical" min="-12" max="12" step="1" value="${eq.gains[idx]}" data-band-index="${idx}">
                <span class="eq-fader-freq">${freq >= 1000 ? freq / 1000 + "k" : freq}</span>
              </div>
            `).join("") : ""}
          </div>
        </div>
      </div>

      <!-- Appearance & UI Scaling -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 19.59 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>
          Внешний вид и акцентный цвет
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Цветовая тема</span>
              <span class="settings-desc">Выберите акцентный цвет кнопок и индикаторов в приложении.</span>
            </div>
            <div class="theme-colors-row">
              <div class="theme-dot active" style="background-color: #1ed760;" data-color="#1ed760" title="Spotify Green"></div>
              <div class="theme-dot" style="background-color: #1d75d9;" data-color="#1d75d9" title="Blue"></div>
              <div class="theme-dot" style="background-color: #8400e7;" data-color="#8400e7" title="Purple"></div>
              <div class="theme-dot" style="background-color: #e91429;" data-color="#e91429" title="Red"></div>
              <div class="theme-dot" style="background-color: #f59b23;" data-color="#f59b23" title="Orange"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Keyboard Shortcuts Reference -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>
          Горячие клавиши
        </h2>
        <div class="shortcuts-grid">
          <div class="shortcut-card"><span class="shortcut-action">Воспроизведение / Пауза</span><span class="kbd">Пробел</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Следующий трек</span><span class="kbd">Ctrl + →</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Предыдущий трек</span><span class="kbd">Ctrl + ←</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Перемотка ±5 сек</span><span class="kbd">← / →</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Громкость ±5%</span><span class="kbd">Ctrl + ↑ / ↓</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Отключение звука</span><span class="kbd">M</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Фокус поиска</span><span class="kbd">Ctrl + L</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Очередь воспроизведения</span><span class="kbd">Q</span></div>
        </div>
      </div>

      <!-- Playerium Updates Section -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>
          Обновления Playerium
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Текущая версия</span>
              <span class="settings-desc">Установленная версия приложения: <strong>v${this.updater.currentVersion}</strong></span>
            </div>
            <button class="settings-btn-primary" id="btnCheckUpdatesManual">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
              Проверить обновления
            </button>
          </div>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Репозиторий GitHub</span>
              <span class="settings-desc">Проект для проверки релизов (например, <code>username/Playerium</code>).</span>
            </div>
            <input type="text" id="inputSettingsGithubRepo" class="search-input" style="width: 260px; height: 38px; padding: 0 12px;" value="${this.escapeHTML(this.updater.repo)}" placeholder="owner/Playerium" />
          </div>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Автопроверка при входе</span>
              <span class="settings-desc">Автоматически проверять релизы на GitHub при каждом запуске плеера.</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggleAutoUpdateCheck" ${this.updater.autoCheckEnabled ? "checked" : ""}>
              <span class="slider-toggle"></span>
            </label>
          </div>
          <div id="updateCheckStatusWrap" style="font-size: 13px; color: var(--sp-text-subdued); margin-top: 4px; display: none;"></div>
        </div>
      </div>
    `;

    container.replaceChildren(settingsDiv);

    // Bind update settings
    const repoInput = document.getElementById("inputSettingsGithubRepo");
    repoInput?.addEventListener("change", (e) => {
      this.updater.setRepo(e.target.value);
      this.showToast("Репозиторий GitHub сохранен");
    });

    const toggleAuto = document.getElementById("toggleAutoUpdateCheck");
    toggleAuto?.addEventListener("change", (e) => {
      this.updater.setAutoCheck(e.target.checked);
      this.showToast(e.target.checked ? "Автопроверка обновлений включена" : "Автопроверка отключена");
    });

    const btnCheck = document.getElementById("btnCheckUpdatesManual");
    const statusWrap = document.getElementById("updateCheckStatusWrap");
    btnCheck?.addEventListener("click", async () => {
      if (statusWrap) {
        statusWrap.style.display = "block";
        statusWrap.innerHTML = `<span style="color: var(--sp-text-subdued);">Проверка обновлений на GitHub...</span>`;
      }
      const res = await this.updater.checkForUpdates(true);
      if (res.hasUpdate) {
        if (statusWrap) {
          statusWrap.innerHTML = `<span style="color: var(--sp-green); font-weight: 600;">Найдено обновление: v${res.latestVersion}!</span>`;
        }
        this.showUpdateModal(res);
      } else if (res.error) {
        if (statusWrap) {
          statusWrap.innerHTML = `<span style="color: var(--sp-red);">${this.escapeHTML(res.error)}</span>`;
        }
      } else {
        if (statusWrap) {
          statusWrap.innerHTML = `<span style="color: var(--sp-green);">У вас установлена последняя версия Playerium (v${this.updater.currentVersion}).</span>`;
        }
        this.showToast("Обновлений не найдено. Вы используете последнюю версию!");
      }
    });

    settingsDiv.querySelector('#settingsEqToggle').setAttribute('aria-label','Включить эквалайзер');
    settingsDiv.querySelector('#settingsEqPreset').setAttribute('aria-label','Пресет эквалайзера');
    settingsDiv.querySelectorAll('.eq-slider-vertical').forEach((slider,i)=>slider.setAttribute('aria-label',`Частота ${eq.constructor.FREQUENCIES[i]} Гц`));
    settingsDiv.querySelectorAll('.theme-dot').forEach(dot=>{dot.tabIndex=0;dot.setAttribute('role','button');dot.setAttribute('aria-label',dot.title);dot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dot.click();}};});
    // Bind settings event listeners
    document.getElementById("btnSettingsAddFolder").addEventListener("click", () => this.triggerFolderPicker());

    // Remove folder buttons
    settingsDiv.querySelectorAll(".btn-remove-folder").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const folderId = btn.dataset.folderId;
        if (this.player.currentTrack?.folderSource === this.library.folders.find(f => f.id === folderId)?.source) this.player.stop();
        await this.library.removeFolder(folderId);
        this.showToast("Папка удалена из медиатеки");
        this.renderSettingsView(container);
      });
    });

    // Clear all
    document.getElementById("btnClearAllLibrary").addEventListener("click", async () => {
      if (confirm("Вы действительно хотите очистить всю локальную медиатеку? Все треки и плейлисты будут удалены из базы плеера.")) {
        this.player.stop();
        await this.library.clearAll();
        this.showToast("Медиатека очищена", "danger");
        this.renderSettingsView(container);
      }
    });

    // Equalizer toggle
    document.getElementById("settingsEqToggle").addEventListener("change", (e) => {
      if (this.player.equalizer) {
        this.player.equalizer.setEnabled(e.target.checked);
        this.showToast(e.target.checked ? "Эквалайзер включен" : "Эквалайзер выключен");
      }
    });

    // Equalizer preset
    document.getElementById("settingsEqPreset").addEventListener("change", (e) => {
      if (this.player.equalizer && e.target.value !== "custom") {
        this.player.equalizer.applyPreset(e.target.value);
        // Update slider values
        this.player.equalizer.gains.forEach((val, i) => {
          const slider = settingsDiv.querySelector(`input[data-band-index="${i}"]`);
          const label = document.getElementById(`eqVal_${i}`);
          if (slider) slider.value = val;
          if (label) label.textContent = (val > 0 ? "+" : "") + val + "dB";
        });
      }
    });

    // Equalizer vertical sliders
    settingsDiv.querySelectorAll(".eq-slider-vertical").forEach((slider) => {
      slider.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.bandIndex, 10);
        const val = parseFloat(e.target.value);
        if (this.player.equalizer) {
          this.player.equalizer.setGain(idx, val);
          const label = document.getElementById(`eqVal_${idx}`);
          if (label) label.textContent = (val > 0 ? "+" : "") + val + "dB";
          document.getElementById("settingsEqPreset").value = "custom";
        }
      });
    });

    // Theme color dots
    settingsDiv.querySelectorAll(".theme-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        settingsDiv.querySelectorAll(".theme-dot").forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        const color = dot.dataset.color;
        document.documentElement.style.setProperty("--sp-green", color);
        document.documentElement.style.setProperty("--sp-green-hover", color);
      });
    });
}
