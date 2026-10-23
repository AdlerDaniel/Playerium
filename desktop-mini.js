const path=require('node:path');
const {pathToFileURL}=require('node:url');
const commands=new Set(['toggle','next','previous','seek','volume','openMain','pin','close','queue']);
function cleanState(value){
  if(!value||typeof value!=='object')throw Error('Invalid mini-player state');
  const text=(value,max=300)=>String(value??'').slice(0,max),number=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const theme=Object.fromEntries(['background','foreground','muted','accent','control','onAccent'].filter(key=>/^#[a-f0-9]{6}$/i.test(value.theme?.[key]||'')).map(key=>[key,value.theme[key]]));
  const image=text(value.artwork,6*1024*1024);return {title:text(value.title),artist:text(value.artist),appName:text(value.appName,100),playing:!!value.playing,position:number(value.position,0,864000),duration:number(value.duration,0,864000),volume:number(value.volume,0,1),device:text(value.device,100),remote:!!value.remote,theme,artwork:/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(image)?image:'',queue:Array.isArray(value.queue)?value.queue.slice(0,6).map(track=>({title:text(track.title),artist:text(track.artist)})):[]};
}
class MiniPlayer{
  constructor({BrowserWindow,ipcMain,mainWindow,root=__dirname,displayName=()=> 'Playerium'}){Object.assign(this,{BrowserWindow,ipcMain,mainWindow,root,displayName});this.state={};this.url=pathToFileURL(path.join(root,'mini-player.html')).href;
    ipcMain.handle('mini:command',(event,command,value)=>{if(event.sender!==this.window?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==this.url)throw Error('Untrusted mini-player sender');if(!commands.has(command))throw Error('Unsupported mini-player command');
      if(command==='close'){this.window.close();return true;}if(command==='pin'){this.window.setAlwaysOnTop(!this.window.isAlwaysOnTop());this.send();return true;}
      if(command==='openMain'){this.mainWindow()?.show();this.mainWindow()?.focus();return true;}
      if((command==='seek'||command==='volume')&&(!Number.isFinite(value)||value<0||value>(command==='volume'?1:864000)))throw Error('Invalid mini-player value');
      this.mainWindow()?.webContents.send('mini:command',{command,value});return true;
    });
  }
  open(){if(this.window&&!this.window.isDestroyed()){this.window.show();this.window.focus();return true;}
    const window=new this.BrowserWindow({width:390,height:300,minWidth:320,minHeight:270,maxWidth:560,maxHeight:640,title:this.displayName(),autoHideMenuBar:true,backgroundColor:'#171411',alwaysOnTop:true,webPreferences:{preload:path.join(this.root,'mini-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});this.window=window;
    window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('did-finish-load',()=>{this.lastArtwork=null;this.send();});window.on('closed',()=>{if(this.window===window)this.window=null;this.lastArtwork=null;const main=this.mainWindow();if(main&&!main.isDestroyed())main.webContents.send('mini:closed');});window.loadFile(path.join(this.root,'mini-player.html'));return true;
  }
  update(value){this.state=cleanState({...this.state,...value});this.send();return true;}
  send(){if(this.window&&!this.window.isDestroyed()){const artwork=this.state.artwork===this.lastArtwork?undefined:this.state.artwork;this.lastArtwork=this.state.artwork;this.window.webContents.send('mini:state',{...this.state,artwork,pinned:this.window.isAlwaysOnTop()});}}
  close(){this.window?.close();}
}
module.exports={MiniPlayer,cleanState};
