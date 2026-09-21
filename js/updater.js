/**
 * Playerium - GitHub Releases Auto-Updater Module
 * Checks for new releases on GitHub upon launch and via Settings.
 */

export class AutoUpdater {
  static CURRENT_VERSION = "1.0.0";
  static DEFAULT_REPO = "AdlerDaniel/Playerium"; // User can configure in Settings

  constructor() {
    this.currentVersion = AutoUpdater.CURRENT_VERSION;
    this.repo = this.loadRepo();
    this.autoCheckEnabled = this.loadAutoCheck();
    this.onUpdateFound = null; // Callback: (updateInfo) => void
  }

  loadRepo() {
    return localStorage.getItem("playerium_github_repo") || AutoUpdater.DEFAULT_REPO;
  }

  setRepo(newRepo) {
    if (newRepo && newRepo.trim()) {
      this.repo = newRepo.trim().replace(/^https:\/\/github\.com\//, "");
      localStorage.setItem("playerium_github_repo", this.repo);
    }
  }

  loadAutoCheck() {
    const val = localStorage.getItem("playerium_auto_update_check");
    return val === null ? true : val === "true";
  }

  setAutoCheck(enabled) {
    this.autoCheckEnabled = !!enabled;
    localStorage.setItem("playerium_auto_update_check", this.autoCheckEnabled.toString());
  }

  /**
   * Check for updates via GitHub API
   * @param {boolean} isManual - whether triggered manually by user in Settings
   * @returns {Promise<Object>}
   */
  async checkForUpdates(isManual = false) {
    if (!isManual && !this.autoCheckEnabled) {
      return { hasUpdate: false, reason: "disabled" };
    }

    // If repo is still the default placeholder and not manual, wait until user enters their GitHub repo
    if (!isManual && this.repo === AutoUpdater.DEFAULT_REPO) {
      return { hasUpdate: false, reason: "default_placeholder" };
    }

    const apiUrl = `https://api.github.com/repos/${this.repo}/releases/latest`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (response.status === 404) {
        return { hasUpdate: false, error: "Репозиторий или релиз не найден на GitHub." };
      }

      if (!response.ok) {
        return { hasUpdate: false, error: `Ошибка GitHub API: ${response.statusText}` };
      }

      const release = await response.json();
      const latestTag = release.tag_name || "";
      const latestVer = latestTag.replace(/^v/i, "").trim();

      const hasUpdate = this.compareVersions(latestVer, this.currentVersion) > 0;

      // Find platform assets (.exe for Windows, .apk for Android)
      let downloadUrl = release.html_url;
      let assetName = "Перейти к релизу";

      const isAndroid = /Android/i.test(navigator.userAgent);

      if (Array.isArray(release.assets) && release.assets.length > 0) {
        if (isAndroid) {
          const apkAsset = release.assets.find((a) => a.name.toLowerCase().endsWith(".apk"));
          if (apkAsset) {
            downloadUrl = apkAsset.browser_download_url;
            assetName = apkAsset.name;
          }
        } else {
          const exeAsset = release.assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
          if (exeAsset) {
            downloadUrl = exeAsset.browser_download_url;
            assetName = exeAsset.name;
          }
        }
      }

      const updateInfo = {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion: latestVer,
        releaseTitle: release.name || latestTag,
        releaseNotes: release.body || "Новая версия Playerium доступна для загрузки.",
        releaseDate: release.published_at,
        downloadUrl,
        assetName,
        htmlUrl: release.html_url
      };

      if (hasUpdate && this.onUpdateFound) {
        this.onUpdateFound(updateInfo);
      }

      return updateInfo;
    } catch (err) {
      console.warn("Update check failed:", err);
      return { hasUpdate: false, error: "Не удалось проверить обновления. Проверьте интернет-соединение." };
    }
  }

  /**
   * Compare two semver strings: '1.0.1' vs '1.0.0'
   * Returns: 1 if verA > verB, -1 if verA < verB, 0 if equal
   */
  compareVersions(verA, verB) {
    const partsA = verA.split(".").map((n) => parseInt(n, 10) || 0);
    const partsB = verB.split(".").map((n) => parseInt(n, 10) || 0);

    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }
}
