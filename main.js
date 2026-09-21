const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const AUDIO_EXTS = [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac"];
const watchers = new Map(); // folderPath -> FSWatcher

function scanDirectory(dirPath) {
  const results = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDirectory(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTS.includes(ext) || ext === ".lrc") {
          const stats = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            fullPath: fullPath,
            size: stats.size,
            lastModified: stats.mtimeMs
          });
        }
      }
    }
  } catch (e) {
    console.warn("Failed to scan directory:", dirPath, e);
  }
  return results;
}

function startWatchingFolder(folderPath, win) {
  if (watchers.has(folderPath)) return;
  let debounceTimeout = null;

  try {
    const watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        const files = scanDirectory(folderPath);
        const folderName = path.basename(folderPath);
        win.webContents.send("folder:updated", {
          folderPath,
          folderName,
          files,
          isInitial: false
        });
      }, 800);
    });
    watchers.set(folderPath, watcher);
  } catch (err) {
    console.warn("Cannot watch folder:", folderPath, err);
  }
}

function createWindow() {
  const iconIco = path.join(__dirname, "build", "icon.ico");
  const iconPng = path.join(__dirname, "assets", "icon.png");
  const windowIcon = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : null);

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Playerium",
    icon: windowIcon,
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");

  // Open native folder dialog, scan files and initiate watcher
  ipcMain.handle("dialog:openDirectory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"]
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }
    const folderPath = filePaths[0];
    const folderName = path.basename(folderPath);
    startWatchingFolder(folderPath, win);
    const files = scanDirectory(folderPath);
    return {
      folderPath,
      folderName,
      files,
      isInitial: true
    };
  });

  // Watch existing folder (e.g., restored from database)
  ipcMain.handle("folder:watch", (_event, folderPath) => {
    if (folderPath && fs.existsSync(folderPath)) {
      startWatchingFolder(folderPath, win);
      return scanDirectory(folderPath);
    }
    return [];
  });

  // Read file as ArrayBuffer for local playback
  ipcMain.handle("file:read", async (_event, filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer;
    } catch (e) {
      console.error("Failed to read file:", filePath, e);
      return null;
    }
  });

  // Open external links in default OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith("http:") || url.startsWith("https:"))) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  ipcMain.handle("shell:openExternal", async (_event, url) => {
    if (url) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  for (const watcher of watchers.values()) {
    watcher.close();
  }
  watchers.clear();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
