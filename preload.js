const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("dialog:openDirectory"),
  watchFolder: (folderPath) => ipcRenderer.invoke("folder:watch", folderPath),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  onFolderUpdated: (callback) => ipcRenderer.on("folder:updated", (_event, data) => callback(data))
});
