// Drive carries authenticated rendezvous only; control travels over DTLS/SCTP.
export class ConnectRtc {
 constructor(id,receive){this.id=id;this.receive=receive;this.peers=new Map();this.local=null;this.account=null;}
 reset(account){if(this.account===account)return;for(const peer of this.peers.values())peer.pc.close();this.peers.clear();this.account=account;}
 ready(peer){return peer.channel?.readyState==='open';}
 devices(){return [...this.peers.values()].filter(p=>this.ready(p)&&p.device&&Date.now()-p.device.seenAt<5000).map(p=>({...p.device,live:true,rtc:true}));}
 signal(){const result={};for(const [id,p] of this.peers)if(p.pc.localDescription)result[id]={session:p.session,type:p.pc.localDescription.type,sdp:p.pc.localDescription.sdp};return result;}
 create(id,session){const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]}),peer={pc,id,session,started:Date.now()};this.peers.set(id,peer);pc.ondatachannel=e=>this.bind(peer,e.channel);pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){peer.failed=Date.now();}};return peer;}
 bind(peer,channel){peer.channel=channel;channel.onmessage=e=>{try{if(typeof e.data!=='string'||e.data.length>262144)return;const packet=JSON.parse(e.data);if(packet.device?.id!==peer.id||packet.account!==this.account)return;peer.device={...packet.device,seenAt:Date.now()};if(packet.command?.target===this.id)this.receive(packet.command).catch(()=>{});}catch{}};channel.onopen=()=>this.publish(this.local);}
 async gathered(pc){if(pc.iceGatheringState==='complete')return;await new Promise(resolve=>{const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);resolve();},change=()=>{if(pc.iceGatheringState==='complete')done();},timer=setTimeout(done,2000);pc.addEventListener('icegatheringstatechange',change);});}
 async discover(devices){if(typeof RTCPeerConnection==='undefined'||!this.account)return;for(const device of devices.slice(0,20)){if(device.id===this.id||!device.realtime||device.live)continue;const signal=device.rtc?.[this.id];let p=this.peers.get(device.id);if(p?.negotiating)continue;
  if(p&&(p.failed||Date.now()-p.started>30000&&!this.ready(p))&&Date.now()-p.started>45000){p.pc.close();this.peers.delete(device.id);p=null;}
  try{
   if(signal?.type==='offer'&&typeof signal.sdp==='string'&&signal.sdp.length<65536){if(p?.session!==signal.session){p?.pc.close();p=this.create(device.id,signal.session);}if(!p.pc.remoteDescription){p.negotiating=true;await p.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});await p.pc.setLocalDescription(await p.pc.createAnswer());await this.gathered(p.pc);p.negotiating=false;}}
   else if(!p&&this.id<device.id){p=this.create(device.id,crypto.randomUUID());p.negotiating=true;this.bind(p,p.pc.createDataChannel('playerium-control'));await p.pc.setLocalDescription(await p.pc.createOffer());await this.gathered(p.pc);p.negotiating=false;}
   else if(p&&signal?.type==='answer'&&signal.session===p.session&&!p.pc.remoteDescription&&typeof signal.sdp==='string'&&signal.sdp.length<65536){p.negotiating=true;await p.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});p.negotiating=false;}
  }catch{if(p){p.negotiating=false;p.failed=Date.now();}}
 }}
 publish(device){if(!device)return;this.local=device;for(const p of this.peers.values())if(this.ready(p)&&p.channel.bufferedAmount<262144)p.channel.send(JSON.stringify({account:this.account,device}));}
 send(command){const peer=this.peers.get(command.target);if(!this.ready(peer||{})||peer.channel.bufferedAmount>=262144)return false;peer.channel.send(JSON.stringify({account:this.account,device:this.local,command}));return true;}
}
