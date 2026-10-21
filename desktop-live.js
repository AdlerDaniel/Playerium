const http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const privateIP=ip=>/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^127\./.test(ip);
const sign=(secret,body)=>crypto.createHmac('sha256',secret).update(body).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const audioKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function sealFile(secret,session,file){
 const nonce=crypto.randomBytes(12),key=crypto.createHash('sha256').update('playerium-file-v1|'+secret).digest();
 const data=Buffer.from(file.base64,'base64');if(!audioKey(file.key)||!Number.isSafeInteger(file.offset)||!Number.isSafeInteger(file.size)||file.offset<0||file.size<1||file.size>1073741824||data.length>65536||file.offset+data.length>file.size)throw Error('Invalid file chunk');
 const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('playerium-file-v1|'+session+'|'+file.key+'|'+file.offset+'|'+file.size));
 return {key:file.key,offset:file.offset,size:file.size,nonce:nonce.toString('base64'),data:Buffer.concat([cipher.update(data),cipher.final(),cipher.getAuthTag()]).toString('base64')};
}
function openFile(secret,session,file,request){
 if(!file||file.key!==request.key||file.offset!==request.offset||!Number.isSafeInteger(file.size)||file.size<1||file.size>1073741824)return null;
 const nonce=Buffer.from(file.nonce,'base64'),data=Buffer.from(file.data,'base64');if(nonce.length!==12||data.length<16||data.length>65552)throw Error('Invalid encrypted chunk');
 const cipher=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update('playerium-file-v1|'+secret).digest(),nonce);cipher.setAAD(Buffer.from('playerium-file-v1|'+session+'|'+file.key+'|'+file.offset+'|'+file.size));cipher.setAuthTag(data.subarray(-16));
 const bytes=Buffer.concat([cipher.update(data.subarray(0,-16)),cipher.final()]);if(file.offset+bytes.length>file.size)throw Error('Invalid file length');return {key:file.key,offset:file.offset,size:file.size,base64:bytes.toString('base64')};
}
class LiveConnect {
 constructor(account,fetcher=globalThis.fetch){this.account=account;this.fetcher=fetcher;this.secret=crypto.randomBytes(32).toString('hex');this.session=crypto.randomUUID();this.peers=new Map();this.inboxes=new Map();this.nonces=new Map();this.local=null;this.busy=false;this.acknowledged=()=>false;}
  async start(){if(this.server)return;this.server=http.createServer({maxHeaderSize:8192},(req,res)=>this.handle(req,res));this.server.maxConnections=32;this.server.headersTimeout=2000;this.server.requestTimeout=2000;this.server.on('error',()=>{});await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'0.0.0.0',()=>{this.server.removeListener('error',reject);resolve();});});this.server.unref();this.timer=setInterval(()=>this.pump(),250);this.timer.unref();}
 descriptor(){const addresses=Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4'&&!a.internal&&privateIP(a.address)).map(a=>a.address);return {version:1,port:this.server?.address()?.port,addresses,secret:this.secret,session:this.session};}
 publish(device){const account=this.account();if(this.localAccount&&this.localAccount!==account){this.secret=crypto.randomBytes(32).toString('hex');this.session=crypto.randomUUID();this.peers.clear();this.inboxes.clear();this.nonces.clear();}this.localAccount=account;this.local={...device,seenAt:Date.now()};}
 learn(device){if(!id(device?.id)||device.id===this.local?.id)return;const old=this.peers.get(device.id)||{};this.peers.set(device.id,{...old,document:device,lan:device.lan||old.lan});}
 enqueue(command){if(!id(command?.id)||!id(command?.target)||!['play','pause','seek','volume','next','previous','shuffle','repeat','transfer'].includes(command.action))throw Error('Некорректная команда.');const commands=this.inboxes.get(command.target)||[];if(commands.some(c=>c.id===command.id)||this.local?.ack===command.id||this.acknowledged(command.target,command.id))return;if(['seek','volume'].includes(command.action))for(let i=commands.length-1;i>=0;i--)if(commands[i].action===command.action)commands.splice(i,1);if(commands.length>=32)throw Error('Слишком много команд.');commands.push({...command,issuedAt:Date.now()});this.inboxes.set(command.target,commands);}
  take(device){const queue=this.inboxes.get(device)||[];while(queue.length&&(Date.now()-queue[0].issuedAt>25000||queue[0].id===this.local?.ack||this.acknowledged(device,queue[0].id)))queue.shift();return queue[0]||null;}
 acknowledge(device,command){const queue=this.inboxes.get(device)||[];this.inboxes.set(device,queue.filter(c=>c.id!==command));if(this.local?.id===device)this.local.ack=command;}
 devices(){return [...this.peers.values()].filter(p=>p.live&&Date.now()-p.live.seenAt<5000).map(p=>({...p.live,live:true}));}
 scan(device){return {devices:this.devices(),command:this.take(device)};}
 async handle(req,res){const reply=(code,data)=>{const body=JSON.stringify({...data,serverTime:Date.now()});res.writeHead(code,{'Content-Length':Buffer.byteLength(body),'Content-Type':'application/json','X-Playerium-Signature':sign(this.secret,body),'Cache-Control':'no-store'});res.end(body);};
  if(req.method!=='POST'||req.url!=='/exchange'||!this.local||!this.account()||this.localAccount!==this.account()){reply(404,{});return;}let bytes=0;const chunks=[];req.setTimeout(2000,()=>req.destroy());
  try{for await(const chunk of req){bytes+=chunk.length;if(bytes>1048576){req.destroy();return;}chunks.push(chunk);}const body=Buffer.concat(chunks).toString('utf8');if(!equal(req.headers['x-playerium-signature'],sign(this.secret,body))){reply(401,{});return;}const packet=JSON.parse(body);if(packet.account!==this.account()||!id(packet.nonce)||!id(packet.device?.id)){reply(401,{});return;}
   if(packet.session!==this.session||Math.abs(Date.now()-packet.time)>120000){reply(409,{clock:true,session:this.session});return;}for(const [key,time] of this.nonces)if(Date.now()-time>180000)this.nonces.delete(key);if(this.nonces.has(packet.nonce)||this.nonces.size>=4096){reply(409,{});return;}this.nonces.set(packet.nonce,Date.now());
    const peer=this.peers.get(packet.device.id)||{};peer.incoming=Date.now();peer.live={...packet.device,seenAt:Date.now()};this.peers.set(packet.device.id,peer);if(packet.command){if(packet.command.target!==this.local.id)throw Error('Invalid target');this.enqueue(packet.command);}for(const ack of [...(Array.isArray(packet.device.ackHistory)?packet.device.ackHistory.slice(-64):[]),packet.device.ack])if(id(ack))this.acknowledge(packet.device.id,ack);
   if(packet.file){
    if(!audioKey(packet.file.key)||!Number.isSafeInteger(packet.file.offset)||packet.file.offset<0||packet.file.offset>1073741824){reply(400,{});return;}
    const account=this.account();const file=await this.fileReader?.(packet.file);
    if(account!==this.account()||this.localAccount!==account){reply(401,{});return;}
    reply(200,{device:this.local,file:file?sealFile(this.secret,this.session,file):null});return;
   }
   reply(200,{device:this.local,command:this.take(packet.device.id)});
  }catch{reply(400,{});}
 }
 async exchange(peer,command,fileRequest=null){if(!this.local||this.localAccount!==this.account()||!peer?.lan?.port||!/^[a-f0-9]{64}$/.test(peer.lan.secret||'')||peer.lan.port<1024||peer.lan.port>65535)return false;
  const account=this.account();const addresses=[...new Set([peer.address,...(peer.lan.addresses||[])].filter(ip=>typeof ip==='string'&&privateIP(ip)&&/^\d+\.\d+\.\d+\.\d+$/.test(ip)))].slice(0,6);
  // The first Windows fetch also initializes its HTTP runtime. Do not abort that
  // handshake before a connection exists; established peers keep the fast deadline.
  for(const address of addresses){try{for(let attempt=0;attempt<2;attempt++){const packet={account:this.account(),nonce:crypto.randomUUID(),session:peer.lan.session,time:Date.now()+(peer.offset||0),device:this.local,command,...(fileRequest?{file:fileRequest}:{})},body=JSON.stringify(packet);const start=Date.now();const response=await this.fetcher(`http://${address}:${peer.lan.port}/exchange`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Playerium-Signature':sign(peer.lan.secret,body)},body,signal:AbortSignal.timeout(fileRequest?3500:peer.address?450:1500)});const text=await response.text();if(text.length>1048576||!equal(response.headers.get('x-playerium-signature'),sign(peer.lan.secret,text)))throw Error('Invalid peer');const data=JSON.parse(text);peer.offset=data.serverTime-Date.now();if(response.status===409&&data.clock&&attempt===0){peer.lan.session=data.session;continue;}if(!response.ok)throw Error('Peer unavailable');if(data.device?.id!==(peer.document?.id||peer.live?.id))throw Error('Invalid identity');if(account!==this.account()||this.localAccount!==account)throw Error('Account changed');if(fileRequest)return openFile(peer.lan.secret,peer.lan.session,data.file,fileRequest);peer.address=address;peer.live={...data.device,seenAt:Date.now()-(Date.now()-start)/2};if(data.command)this.enqueue(data.command);for(const ack of [...(Array.isArray(data.device.ackHistory)?data.device.ackHistory.slice(-64):[]),data.device.ack])if(id(ack))this.acknowledge(data.device.id,ack);return true;}}catch{}}
  return false;
 }
  async readFile(key,offset){if(!audioKey(key)||!Number.isSafeInteger(offset)||offset<0)return null;for(const peer of this.peers.values()){const result=await this.exchange(peer,null,{key,offset});if(result&&typeof result==='object')return result;}return null;}
  async send(command){const peer=this.peers.get(command?.target);if(peer?.incoming&&Date.now()-peer.incoming<1000&&!peer.address){this.enqueue(command);return true;}if(peer&&await this.exchange(peer,command))return true;if(peer?.live&&Date.now()-peer.live.seenAt<4000){this.enqueue(command);return true;}return false;}
  async pump(){if(this.busy||!this.local||!this.account())return;this.busy=true;try{await Promise.all([...this.peers.values()].filter(p=>p.lan&&!(p.incoming&&Date.now()-p.incoming<1000&&!p.address)).slice(0,20).map(p=>this.exchange(p,this.take(p.document?.id||p.live?.id))));}finally{this.busy=false;}}
 close(){clearInterval(this.timer);this.server?.close();this.server=null;this.peers.clear();this.inboxes.clear();this.local=null;}
}
module.exports={LiveConnect,privateIP,sign,sealFile,openFile};
