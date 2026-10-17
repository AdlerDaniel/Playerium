const {test}=require('node:test'),assert=require('node:assert/strict');
const response=(data,status=200)=>new Response(data===null?null:JSON.stringify(data),{status});

test('realtime login verifies Google before provisioning and never returns provider/server credentials',async()=>{
 const {sessionHandler}=await import('../supabase/functions/playerium-session/handler.js');let identities=[],calls=[];
 const userId='18d898ed-8494-4edf-88fe-212acda78010';
 const handler=sessionHandler({env:key=>key==='SUPABASE_URL'?'https://cjmdgrstuaxaimpgxsmv.supabase.co':'server-only-key',fetcher:async(url,options)=>{
  calls.push({url,options});const body=options.body&&JSON.parse(options.body);
  if(url.startsWith('https://www.googleapis.com/'))return response({user:{permissionId:'1234567890'}});
  if(url.includes('playerium_accounts')&&!options.method)return response(identities);
  if(url.endsWith('/admin/users'))return response({id:userId});
  if(url.includes('playerium_accounts')){identities=[body];return response(null,201);}
  if(url.endsWith('/admin/generate_link'))return response({hashed_token:'single-use-proof'});
  if(url.endsWith('/verify')){assert.equal(body.token_hash,'single-use-proof');return response({access_token:'user-session',expires_in:3600,user:{id:userId}});}
  throw Error('Unexpected request');
 }});
 const result=await handler(new Request('https://endpoint',{method:'POST',headers:{Authorization:'Bearer google-credential-that-is-valid'}}));assert.equal(result.status,200);const data=await result.json();assert.equal(data.account,'1234567890');assert.equal(data.accessToken,'user-session');assert.equal(data.userId,userId);assert.ok(!JSON.stringify(data).includes('server-only-key'));assert.ok(!JSON.stringify(data).includes('google-credential'));assert.ok(calls[0].url.startsWith('https://www.googleapis.com/'));
});
test('saved-history migration retries an interrupted batch before declaring the journal seeded',async()=>{
 const {RealtimeSync}=await import('../js/realtime-sync.js');const rows=new Map();let fail=true;
 const cloud={device:'self',account:'a',status:{account:'a',realtimeAvailable:true},events:Array.from({length:145},(_,i)=>({id:'legacy-'+i,device:'self',version:1,clock:i+1,kind:'playlist',playlist:'p'+i,name:'Legacy'})),schedule(){},nativeRequest:async op=>{if(op==='realtimeSession')return session();throw Error('Drive offline');}};
 const sync=new RealtimeSync(cloud,{Client:FakeClient,fetcher:async(_url,options)=>{
  if(options.method==='POST'){const batch=JSON.parse(options.body);if(fail&&batch[0].op_id==='legacy-100')throw Error('Interrupted');for(const row of batch)if(!rows.has(row.op_id))rows.set(row.op_id,{seq:rows.size+1,operation:row.operation});return response(null,201);}
  return response([...rows.values()]);
 }});
 const partial=await sync.pullLibrary({cursor:'saved-cursor'});assert.equal(partial.events.length,100);assert.equal(!!sync.seeded,false);
 fail=false;const recovered=await sync.pullLibrary({cursor:'saved-cursor'});assert.equal(recovered.events.length,145);assert.equal(sync.seeded,true);assert.equal(rows.size,145);assert.equal(recovered.cursor,'saved-cursor');
 sync.lastDrive=Date.now()-300001;cloud.nativeRequest=async op=>{assert.equal(op,'pull');return {cursor:'backup-cursor',events:[]};};
 assert.equal((await sync.pullLibrary({cursor:'saved-cursor'})).cursor,'backup-cursor');sync.reset();
});

test('invalid Google credentials cannot provision or access a realtime identity',async()=>{
 const {sessionHandler}=await import('../supabase/functions/playerium-session/handler.js');let calls=0;const handler=sessionHandler({env:()=>{throw Error('Should not read service configuration');},fetcher:async()=>{calls++;return response({},401);}});
 assert.equal((await handler(new Request('https://endpoint',{method:'POST'}))).status,401);assert.equal(calls,0);
 assert.equal((await handler(new Request('https://endpoint',{method:'POST',headers:{Authorization:'Bearer invalid-google-credential'}}))).status,401);assert.equal(calls,1);
});

class FakeClient {
 constructor(){this.listeners=new Map();this.closed=false;}
 channel(){return {on:(...args)=>{this.listeners.set(args[1].event,args[2]);return this.channelObject;},...this.channelObject};}
 disconnect(){this.closed=true;}
 async setAuth(token){this.token=token;}
 get channelObject(){if(!this._channel)this._channel={on:(_type,filter,handler)=>{this.listeners.set(filter.event,handler);return this._channel;},subscribe:handler=>{this.notify=handler;handler('SUBSCRIBED');},send:async()=> 'ok'};return this._channel;}
}
const session=(account='a')=>({account,userId:'18d898ed-8494-4edf-88fe-212acda78010',accessToken:'test-user-token',expiresAt:Date.now()+3600000});
test('account switching discards a delayed session and closes the old private channel',async()=>{
 const {RealtimeSync}=await import('../js/realtime-sync.js');let resolve;const cloud={device:'self',schedule(){},nativeRequest:()=>new Promise(r=>resolve=r)};const sync=new RealtimeSync(cloud,{Client:FakeClient});const opening=sync.start('a');sync.reset();resolve(session());await opening;assert.equal(sync.session,null);assert.equal(sync.client,null);
 cloud.nativeRequest=async()=>session();await sync.start('a');const client=sync.client;sync.reset();assert.equal(client.closed,true);assert.deepEqual(sync.devices(),[]);
});
test('journal pagination reads every page and notifications received while busy request another sync',async()=>{
 const {RealtimeSync}=await import('../js/realtime-sync.js');const cloud={device:'self',busy:true,schedule(){},nativeRequest:async()=>session()};let pages=0;const operation=i=>({id:'op'+i,device:'test',version:1,clock:i+1,kind:'playlist',playlist:'p'+i,name:'Test'});
 const sync=new RealtimeSync(cloud,{Client:FakeClient,fetcher:async url=>{pages++;assert.ok(url.includes(pages===1?'seq=gt.0':'seq=gt.1000'));return response(Array.from({length:pages===1?1000:3},(_,i)=>({seq:(pages-1)*1000+i+1,operation:operation((pages-1)*1000+i)})));}});await sync.start('a');assert.equal(cloud.resync,true);assert.equal((await sync.pull()).length,1003);sync.reset();
});
test('pending audio is never advertised and account-scoped journal writes remain immutable',async()=>{
 const {RealtimeSync}=await import('../js/realtime-sync.js');const writes=[];const cloud={device:'self',schedule(){},nativeRequest:async()=>session()};const sync=new RealtimeSync(cloud,{Client:FakeClient,fetcher:async(_url,options)=>{writes.push(options);return response(null,201);}});await sync.start('a');
 const op={id:'pending-audio',device:'self',version:1,clock:1,kind:'track',key:'a'.repeat(64),track:{audioId:'pending',title:'Test',artist:'Test',ext:'.mp3',size:10}};await sync.publish([op]);assert.equal(writes.length,0);await sync.publish([{...op,track:{...op.track,audioId:'ready-file'}}]);assert.equal(writes.length,1);assert.equal(writes[0].headers.Prefer,'resolution=ignore-duplicates,return=minimal');assert.equal(JSON.parse(writes[0].body)[0].user_id,session().userId);sync.reset();
});
test('realtime outage falls back to native Drive without losing its cursor',async()=>{
 const {RealtimeSync}=await import('../js/realtime-sync.js');const calls=[];const cloud={device:'self',schedule(){},nativeRequest:async(op,payload)=>{calls.push([op,payload]);return op==='realtimeSession'?session():{events:[],cursor:'native-cursor'};}};const sync=new RealtimeSync(cloud,{Client:FakeClient,fetcher:async()=>{throw Error('offline');}});await sync.start('a');sync.lastDrive=Date.now();assert.equal((await sync.pullLibrary({cursor:'old'})).cursor,'native-cursor');assert.deepEqual(calls.at(-1),['pull',{cursor:'old'}]);sync.reset();
});
test('a native retry of a slow realtime command acknowledges completion without executing twice',async()=>{
 const {ConnectController}=await import('../js/connect-controller.js');const controller=Object.create(ConnectController.prototype);let release,executions=0;const gate=new Promise(resolve=>release=resolve),calls=[];
 Object.assign(controller,{id:'device',info:{realtime:false},cloud:{request:async op=>calls.push(op),realtime:{publishState:async()=>{}}},rtc:{publish(){}},snapshot:()=>({playing:false})});
 controller.receive=async command=>{executions++;await gate;await controller.acknowledge(command);};
 const command={id:'same-command',target:'device',action:'pause',issuedAt:Date.now()};const original=controller.receiveOnce({...command,realtime:true});const retry=controller.receiveOnce(command);release();await Promise.all([original,retry]);assert.equal(executions,1);assert.equal(calls.filter(op=>op==='connectAck').length,1);assert.equal(calls.filter(op=>op==='connectPublish').length,1);
});
