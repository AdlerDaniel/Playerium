import {RealtimeClient} from './vendor/realtime.js';
import {REALTIME_URL,REALTIME_KEY} from './realtime-config.js';
import {validOperation} from './cloud-model.js';

// The durable journal is the source of truth; WebSocket messages only wake pulls.
export class RealtimeSync {
 constructor(cloud,{Client=RealtimeClient,fetcher=fetch}={}){this.cloud=cloud;this.Client=Client;this.fetcher=fetcher;this.peers=new Map();this.waiters=new Map();this.generation=0;this.state='offline';}
 reset(){this.generation++;this.client?.disconnect();this.client=null;this.channel=null;this.session=null;this.account=null;this.opening=null;this.peers.clear();for(const task of this.waiters.values()){clearTimeout(task.timer);task.resolve(null);}this.waiters.clear();this.state='offline';this.lastDrive=0;this.seeded=false;}
 async start(account){
  if(!account){this.reset();return;}
  if(this.account===account&&this.session?.expiresAt>Date.now()+60000)return;
  if(this.opening?.account===account)return this.opening.promise;
  if(this.account!==account)this.reset();this.account=account;const generation=this.generation;
  const promise=(async()=>{
   const session=await this.cloud.nativeRequest('realtimeSession');
   if(generation!==this.generation||this.account!==account)return;
   if(session.account!==account||!session.accessToken||!session.userId)throw Error('Некорректная сессия синхронизации.');
   this.session=session;
   if(this.client){await this.client.setAuth(session.accessToken);return;}
   this.client=new this.Client(REALTIME_URL+'/realtime/v1',{params:{apikey:REALTIME_KEY},accessToken:async()=>{await this.start(this.account);return this.session?.accessToken||null;}});
   this.channel=this.client.channel('playerium:'+session.userId,{config:{private:true,broadcast:{ack:true,self:false}}});
   this.channel.on('broadcast',{event:'library'},()=>this.wake());
   this.channel.on('broadcast',{event:'state'},({payload})=>this.receiveState(payload));
   this.channel.on('broadcast',{event:'command'},async({payload})=>{if(payload?.target!==this.cloud.device||!this.onCommand)return;try{await this.onCommand({...payload,realtime:true});}catch{/* Sender falls back to the native transport on timeout. */}});
   this.channel.subscribe(status=>{if(generation!==this.generation)return;this.state=status==='SUBSCRIBED'?'online':'reconnecting';this.cloud.changed?.();if(status==='SUBSCRIBED')this.wake();});
  })();this.opening={account,promise};try{await promise;}catch(error){if(generation===this.generation){this.error=error.message;this.state='offline';}throw error;}finally{if(this.opening?.promise===promise)this.opening=null;}
 }
 wake(){if(this.cloud.busy)this.cloud.resync=true;else this.cloud.schedule(100);}
 async api(path,options={}){const account=this.account;await this.start(account);const session=this.session;if(!session||session.account!==account)throw Error('Синхронизация не подключена.');const response=await this.fetcher(REALTIME_URL+'/rest/v1/'+path,{...options,headers:{apikey:REALTIME_KEY,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000),redirect:'error'});if(this.account!==account||this.session!==session)throw Error('Аккаунт изменился.');if(!response.ok){if(response.status===401)this.session=null;throw Error('Быстрая синхронизация временно недоступна.');}return response;}
 async publish(events){if(!this.session)return;const ready=events.filter(op=>validOperation(op)&&(op.kind!=='track'||op.track.audioId!=='pending'));for(let i=0;i<ready.length;i+=100){const batch=ready.slice(i,i+100);await this.api('playerium_events?on_conflict=user_id,op_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(batch.map(operation=>({user_id:this.session.userId,op_id:operation.id,operation})))});}}
 async pull(){let seq=0;const events=[];for(;;){const response=await this.api('playerium_events?select=seq,operation&user_id=eq.'+this.session.userId+'&seq=gt.'+seq+'&order=seq.asc&limit=1000'),rows=await response.json();for(const row of rows)if(validOperation(row.operation))events.push(row.operation);if(rows.length<1000)return events;seq=rows[rows.length-1].seq;}}
 async pullLibrary(payload){
   // A Drive cursor only tracks future changes. Existing installations must also
   // publish their saved journal, including deletions, before using realtime.
   if(this.cloud.status?.realtimeAvailable&&this.cloud.account===this.cloud.status.account){try{await this.start(this.cloud.account);}catch{}}
   if(this.session){try{
    if(!this.seeded){await this.publish(this.cloud.events||[]);const events=await this.pull();this.seeded=true;
     if(events.length){this.lastDrive=Date.now();return {cursor:payload.cursor,events};}
    }
    if(this.lastDrive&&Date.now()-this.lastDrive<300000)return {cursor:payload.cursor,events:await this.pull()};
   }catch(error){this.error=error.message;}}
   let result;try{result=await this.cloud.nativeRequest('pull',payload);}catch(error){if(!this.session)throw error;const events=await this.pull();this.lastDrive=Date.now();return {cursor:payload.cursor,events};}this.lastDrive=Date.now();
  // Drive remains a backup and migrates existing installations into the journal.
   if(this.session){try{await this.publish(this.seeded?(result.events||[]):[...(this.cloud.events||[]),...(result.events||[])]);result.events=[...(result.events||[]),...await this.pull()];this.seeded=true;}catch{this.lastDrive=0;}}
  return result;
 }
 devices(){const now=Date.now();return [...this.peers.values()].filter(peer=>peer.id!==this.cloud.device&&now-peer.receivedAt<15000);}
 receiveState(payload){if(!payload||typeof payload.id!=='string'||payload.id===this.cloud.device||!payload.state||JSON.stringify(payload).length>262144)return;const peer={...payload,name:String(payload.name||'Playerium').slice(0,100),seenAt:Date.now(),receivedAt:Date.now(),realtime:true};this.peers.set(peer.id,peer);for(const id of [payload.ack,...(Array.isArray(payload.ackHistory)?payload.ackHistory:[])]){const task=this.waiters.get(id);if(task&&task.target===peer.id){clearTimeout(task.timer);this.waiters.delete(id);task.resolve(peer);}}this.onDevices?.();}
 async publishState(device,force=false){if(this.state!=='online'||!this.channel)return;const signature=JSON.stringify({...device,state:{...device.state,position:undefined}});if(!force&&signature===this.lastState&&Date.now()-(this.lastStateAt||0)<2000)return;this.lastState=signature;this.lastStateAt=Date.now();return this.channel.send({type:'broadcast',event:'state',payload:device});}
 async sendCommand(command){if(this.state!=='online'||!this.peers.has(command.target))return null;return new Promise(resolve=>{const timer=setTimeout(()=>{this.waiters.delete(command.id);resolve(null);},1800);this.waiters.set(command.id,{resolve,timer,target:command.target});this.channel.send({type:'broadcast',event:'command',payload:command}).then(result=>{if(result!=='ok'){const task=this.waiters.get(command.id);if(task){clearTimeout(timer);this.waiters.delete(command.id);resolve(null);}}}).catch(()=>{clearTimeout(timer);this.waiters.delete(command.id);resolve(null);});});}
}
