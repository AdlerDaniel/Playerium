const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('native shuffle publishes actual playback order and following a remote queue restores the local native order',async()=>{
 global.window={};global.document={querySelectorAll:()=>[]};const {ConnectController}=await import('../js/connect-controller.js');
 const tracks=['a','b','c','d'].map(id=>({id,cloudKey:id,nativeUri:'content://'+id}));
 const player={queue:tracks,originalQueue:tracks.slice(),queueIndex:0,currentTrack:tracks[0],isShuffle:true,repeatMode:'off',nativePlayback:true,nativePlaybackOrder:[0,3,1,2],nativeOrderKey:'local-order',volume:.8,getCurrentTime:()=>20,getDuration:()=>180,playbackOrder(){return this.nativePlaybackOrder;},playTrack(){},applyNativeState(){}};
 const cloud={device:'phone',library:{getTracks:()=>tracks},links:{},events:[],outbox:[],status:{account:'test'}},ui={};const c=new ConnectController(cloud,player,ui);c.info={};c.installControls();
 assert.deepEqual(c.snapshot().queue,['a','d','b','c']);c.saveLocal();c.selected='pc';c.display({id:'pc',state:{queue:['a','c','b','d'],track:{key:'a'},shuffle:true,repeat:'off',position:20,duration:180,volume:.8}});
 assert.deepEqual(player.playbackOrder(),[0,1,2,3]);assert.equal(player.queue[1].id,'c');c.restoreLocal();assert.deepEqual(player.playbackOrder(),[0,3,1,2]);assert.deepEqual(player.queue.map(t=>t.id),['a','b','c','d']);
});
test('handoff preserves position, queue and modes; both clients control the selected device and return playback',async()=>{
 global.window={};global.document={querySelectorAll:()=>[]};const {ConnectController}=await import('../js/connect-controller.js');
 const key=crypto.createHash('sha256').update('song').digest('hex'),events=[{version:1,id:'track',device:'pc',clock:1,kind:'track',key,track:{title:'Song',artist:'Artist',ext:'.mp3',size:4,audioId:'audio'}}];
 const controllers=new Map(),states=new Map(),acks=new Map(),commands=[];
 function peer(id){const track={id:id+'_song',cloudKey:key,title:'Song',artist:'Artist',duration:180};const library={getTrackById:localId=>localId===track.id?track:null,getTracks:()=>[track]};
  const cloud={device:id,status:{connected:true},events,links:{[key]:{localId:track.id}},library,save:async()=>{},request:async(op,p)=>{
   if(op==='connectPublish'){states.set(p.id,{...p,ack:acks.get(p.id),seenAt:Date.now()});return true;}
   if(op==='connectAck'){acks.set(p.id,p.commandId);return true;}
   if(op==='connectScan')return {devices:[...states.values()]};
   if(op==='connectSend'){commands.push(p.command);await controllers.get(p.id).receive(p.command);return true;}throw Error(op);
  }};
  const player={currentTrack:null,queue:[],queueIndex:0,originalQueue:[],isPlaying:false,volume:.8,isShuffle:false,repeatMode:'off',time:0,getCurrentTime(){return this.time;},getDuration(){return 180;},play(){this.isPlaying=true;},pause(){this.isPlaying=false;},togglePlay(){this.isPlaying=!this.isPlaying;},next(){this.time=0;},prev(){this.time=0;},seekToTime(value){this.time=value;},setVolume(value){this.volume=value;},toggleShuffle(){this.isShuffle=!this.isShuffle;},toggleRepeat(){this.repeatMode=['off','one','all'][(['off','one','all'].indexOf(this.repeatMode)+1)%3];},applyNativeState(){},async playTrack(t,i,q){this.currentTrack=t;this.queue=q;this.queueIndex=i;this.isPlaying=true;this.time=0;}};
  const ui={syncPlayerDisplay(){},showToast:message=>{throw Error(message);}},connect=new ConnectController(cloud,player,ui);connect.info={name:id,type:'desktop'};connect.installControls();controllers.set(id,connect);return {connect,player,track};
 }
 const pc=peer('pc'),phone=peer('phone');await pc.player.playTrack(pc.track,0,[pc.track]);pc.player.time=63;pc.player.isShuffle=true;pc.player.repeatMode='all';
 await pc.connect.select('phone');assert.equal(pc.connect.selected,'phone');assert.equal(pc.connect.localSnapshot.playing,false);assert.equal(phone.player.isPlaying,true);assert.equal(phone.player.time,63);assert.equal(phone.player.isShuffle,true);assert.equal(phone.player.repeatMode,'all');
 await pc.connect.control('pause');assert.equal(phone.player.isPlaying,false);await pc.connect.control('seek',80);assert.equal(phone.player.time,80);await pc.connect.control('volume',0);assert.equal(phone.player.volume,0);
 pc.player.toggleRepeat();await pc.connect.commandTail;assert.equal(phone.player.repeatMode,'one');pc.player.togglePlay();await pc.connect.commandTail;assert.equal(phone.player.isPlaying,true);await pc.connect.control('play');assert.equal(phone.player.isPlaying,true);await pc.connect.select('pc');assert.equal(pc.player.isPlaying,true);assert.equal(pc.player.time,80);assert.equal(phone.player.isPlaying,false);assert.equal(pc.player.volume,0);assert.ok(commands.some(c=>c.action==='transfer'&&c.media[0].key===key));
  phone.player.currentTrack=null;phone.player.isPlaying=false;phone.connect.devices=[{id:'pc',state:pc.connect.snapshot(),seenAt:Date.now()}];phone.connect.followRemote();assert.equal(phone.connect.selected,'pc');assert.equal(phone.connect.explicitTarget,null);
  await phone.player.playTrack(phone.track,0,[phone.track]);assert.equal(phone.connect.selected,'phone');assert.equal(phone.player.isPlaying,true);await new Promise(r=>setTimeout(r,0));assert.equal(pc.player.isPlaying,false);
  await phone.connect.select('pc');assert.equal(phone.connect.explicitTarget,'pc');assert.equal(pc.player.isPlaying,true);
  await phone.player.playTrack(phone.track,0,[phone.track]);assert.equal(phone.connect.selected,'pc');assert.equal(pc.player.isPlaying,true);
 });
