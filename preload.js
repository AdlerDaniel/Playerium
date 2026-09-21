const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("dialog:openDirectory"),
  onFolderSelected: (callback) => ipcRenderer.on("folder-selected", (_event, path, files) => callback(path, files))
});
