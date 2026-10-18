const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('miniPlayer',{
  command:(command,value)=>ipcRenderer.invoke('mini:command',command,value),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('mini:state',listener);return()=>ipcRenderer.removeListener('mini:state',listener);}
});
