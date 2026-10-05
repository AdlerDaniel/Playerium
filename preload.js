const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  watchFolder: path => ipcRenderer.invoke('folder:watch', path),
  getAudioSource: path => ipcRenderer.invoke('file:source', path),
  getMetadata: path => ipcRenderer.invoke('file:metadata', path),
  readLyrics: path => ipcRenderer.invoke('file:text', path),
  openExternal: url => ipcRenderer.invoke('shell:openExternal', url),
  onFolderUpdated: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('folder:updated', listener);
    return () => ipcRenderer.removeListener('folder:updated', listener);
  }
});
