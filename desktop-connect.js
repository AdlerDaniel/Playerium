const {LiveConnect}=require('./desktop-live');
const crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
function installConnect(cloud){
  cloud.controlIds=new Map();cloud.controlHistory=new Map();
  cloud.live=new LiveConnect(()=>cloud.auth?.enabled&&cloud.auth.account||null);
  cloud.live.acknowledged=(device,command)=>cloud.controlHistory.get(cloud.auth.account+':'+device)?.has(command)||false;
 cloud.controlWrite=async(kind,device,data)=>{
  if(!['device','command'].includes(kind)||!identifier(device))throw Error('Invalid device');const text=JSON.stringify(data);if(Buffer.byteLength(text)>262144)throw Error('Device message too large');
  await cloud.token();const account=cloud.auth.account,key=kind+':'+device,cacheKey=account+':'+key;let file=cloud.controlIds.get(cacheKey)||await cloud.find(key);const token=await cloud.token();let response;
  if(file){response=await cloud.fetcher('https://www.googleapis.com/upload/drive/v3/files/'+file.id+'?uploadType=media&fields=id',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'X-HTTP-Method-Override':'PATCH','Content-Type':'application/json'},body:text,signal:AbortSignal.timeout(15000)});if(response.status===404){cloud.controlIds.delete(cacheKey);file=null;}}
  if(!file){const boundary='playerium_'+crypto.randomUUID(),metadata={name:key+'.json',mimeType:'application/json',parents:[await cloud.folder()],appProperties:{playeriumCloud:'1',kind,key}};const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--\r\n`;response=await cloud.fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body,signal:AbortSignal.timeout(15000)});}
  if(!response.ok)throw Error('Не удалось связаться с устройством.');const result=await response.json();if(!cloud.auth.enabled||cloud.auth.account!==account)throw Error('Аккаунт изменился.');cloud.controlIds.set(cacheKey,result);return true;
 };
 cloud.controlRead=async(kind,device)=>{if(!identifier(device))throw Error('Invalid device');const key=kind+':'+device,cacheKey=cloud.auth.account+':'+key;const file=cloud.controlIds.get(cacheKey)||await cloud.find(key);if(!file)return null;cloud.controlIds.set(cacheKey,file);try{const response=await cloud.api('files/'+file.id+'?alt=media');const text=await response.text();if(text.length>262144)throw Error('Invalid device state');return JSON.parse(text);}catch(error){cloud.controlIds.delete(cacheKey);throw error;}};
  cloud.controlAck=async(device,commandId)=>{if(!identifier(device)||!identifier(commandId))throw Error('Invalid acknowledgement');const file=path.join(cloud.root,'connect-acks.json');let acks={};try{acks=JSON.parse(await fs.readFile(file,'utf8'));}catch{}const key=cloud.auth.account+':'+device,old=acks[key],history=[...new Set([...(typeof old==='string'?[old]:old?.history||[]),commandId])].slice(-64);acks[key]={last:commandId,history};cloud.controlHistory.set(key,new Set(history));cloud.live.acknowledge(device,commandId);await fs.mkdir(cloud.root,{recursive:true});await fs.writeFile(file,JSON.stringify(acks));};
  cloud.controlLastAck=async(device)=>{try{const key=cloud.auth.account+':'+device,record=JSON.parse(await fs.readFile(path.join(cloud.root,'connect-acks.json'),'utf8'))[key];cloud.controlHistory.set(key,new Set(typeof record==='string'?[record]:record?.history||[]));return typeof record==='string'?record:record?.last||'';}catch{return '';}};
 cloud.connectRequest=async(operation,payload)=>{
  if(operation==='connectInfo'){await cloud.live.start();return {name:require('node:os').hostname(),type:'desktop',realtime:true};}
   if(operation==='connectLive'){await cloud.live.start();cloud.live.publish({...payload,ack:await cloud.controlLastAck(payload.id),ackHistory:[...(cloud.controlHistory.get(cloud.auth.account+':'+payload.id)||[])]});return cloud.live.scan(payload.id);}
   if(operation==='connectAck')return cloud.controlAck(payload.id,payload.commandId);
    if(operation==='connectSend'){if(!identifier(payload.id)||!identifier(payload.command?.id)||payload.command.target!==payload.id)throw Error('Invalid command');if(await cloud.live.send(payload.command))return {live:true};}
   await cloud.token();
  if(operation==='connectPublish'){await cloud.live.start();const local={...payload,ack:await cloud.controlLastAck(payload.id),ackHistory:[...(cloud.controlHistory.get(cloud.auth.account+':'+payload.id)||[])],seenAt:Date.now()};cloud.live.publish(local);return cloud.controlWrite('device',payload.id,{...local,lan:cloud.live.descriptor()});}
   if(operation==='connectSend')return cloud.controlWrite('command',payload.id,payload.command);
  if(operation==='connectAck')return cloud.controlAck(payload.id,payload.commandId);
  if(operation==='connectScan'){if(!identifier(payload.id))throw Error('Invalid device');const files=await cloud.list("appProperties has { key='kind' and value='device' }");const devices=await Promise.all(files.slice(0,20).map(async file=>{try{const response=await cloud.api('files/'+file.id+'?alt=media');const device=await response.json();cloud.live.learn(device);delete device.lan;return device;}catch{return null;}}));let command=await cloud.controlRead('command',payload.id);if(command&&(command.target!==payload.id||(command.id===await cloud.controlLastAck(payload.id)||cloud.live.acknowledged(payload.id,command.id))||Date.now()-command.issuedAt>90000||command.issuedAt>Date.now()+30000))command=null;return {devices:devices.filter(Boolean),command};}
  throw Error('Invalid connect operation');
 };
}
module.exports={installConnect};
