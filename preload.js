const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getWindowState:()=>ipcRenderer.invoke('window:state'),
  windowControl:action=>ipcRenderer.invoke('window:control',action),
  onWindowState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('window:state',listener);return()=>ipcRenderer.removeListener('window:state',listener);},
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  watchFolder: path => ipcRenderer.invoke('folder:watch', path),
  unwatchFolder: path => ipcRenderer.invoke('folder:unwatch', path),
  getAudioSource: async (path,identity) => {
    try{return await ipcRenderer.invoke('file:source',path,identity);}
    catch(error){const message=String(error.message||'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');throw Error(/^(Файл|Нет доступа|Папка)/.test(message)?message:'Не удалось открыть аудиофайл. Выберите папку с музыкой ещё раз.');}
  },
  getMetadata: path => ipcRenderer.invoke('file:metadata', path),
  musicRequest: async (operation,payload,id) => {
    const result=await ipcRenderer.invoke('music:request',operation,payload,id);
    if(!result.ok)throw Error(result.error);
    return result.data;
  },
  cancelMusic: id => ipcRenderer.invoke('music:cancel',id),
  onMusicProgress: callback => {
    const listener=(_event,state)=>callback(state);ipcRenderer.on('music:progress',listener);
    return ()=>ipcRenderer.removeListener('music:progress',listener);
  },
  openExternal: url => ipcRenderer.invoke('shell:openExternal', url),
  installUpdate: info => ipcRenderer.invoke('update:install', info),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  onFolderUpdated: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('folder:updated', listener);
    return () => ipcRenderer.removeListener('folder:updated', listener);
  }
});
