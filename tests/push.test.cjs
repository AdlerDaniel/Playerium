const {test}=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const UID='18d898ed-8494-4edf-88fe-212acda78010',INSTALL='323ed967-221d-42dd-b593-cb530f46c3e1';
const SECRET='a'.repeat(64),TOKEN='device-registration-token_123456789';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
const request=body=>new Request('https://push',{method:'POST',headers:{Authorization:'Bearer '+SECRET},body:JSON.stringify(body)});
async function setup(options={}){
 const {pushHandler}=await import('../supabase/functions/playerium-push/handler.js');const calls=[];
 const handler=pushHandler({env:key=>key==='SUPABASE_URL'?'https://cjmdgrstuaxaimpgxsmv.supabase.co':'server-only',fetcher:async(url,init)=>{
  calls.push({url,init});if(options.fetcher){const value=await options.fetcher(url,init);if(value)return value;}
  if(url.endsWith('/auth/v1/user'))return reply({id:UID});
  if(url.endsWith('_authorize'))return reply(true);
  if(url.endsWith('_credentials'))return reply(options.credentials??null);
  if(url.endsWith('_register')||url.endsWith('_unregister')||url.endsWith('_finish'))return reply(null);
  if(url.endsWith('_claim'))return reply(options.jobs??[]);
  if(url==='https://oauth2.googleapis.com/token')return reply({access_token:'google-only',expires_in:3600});
  if(url.startsWith('https://fcm.googleapis.com/'))return reply({name:'sent'});
  throw Error('Unexpected URL '+url);
 }});return {handler,calls};
}
test('push registration binds tokens to the verified identity and never trusts a caller userId',async()=>{
 const {handler,calls}=await setup();const result=await handler(request({action:'register',installation:INSTALL,token:TOKEN,userId:'attacker'}));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true,userId:UID});
 const rpc=calls.find(c=>c.url.endsWith('_register'));assert.deepEqual(JSON.parse(rpc.init.body),{p_user:UID,p_installation:INSTALL,p_token:TOKEN});
 assert.equal(calls[0].url.endsWith('/auth/v1/user'),true);
});
test('push rejects unauthorized registration, malformed input and client dispatch',async()=>{
 const {handler,calls}=await setup({fetcher:async url=>url.endsWith('/auth/v1/user')?reply({},401):url.endsWith('_authorize')?reply(false):null});
 assert.equal((await handler(request({action:'register',installation:INSTALL,token:TOKEN}))).status,401);
 assert.equal((await handler(request({action:'register',installation:INSTALL,token:'path/../secret'}))).status,400);
 assert.equal((await handler(request({action:'dispatch'}))).status,401);
 assert.equal(calls.some(c=>c.url.endsWith('_register')||c.url.endsWith('_claim')),false);
});
test('missing Firebase server configuration leaves durable jobs unclaimed',async()=>{
 const {handler,calls}=await setup();assert.equal((await handler(request({action:'dispatch'}))).status,503);
 assert.equal(calls.some(c=>c.url.endsWith('_claim')),false);
});
test('logout registration endpoint only removes the authenticated account installation',async()=>{
 const {handler,calls}=await setup();assert.equal((await handler(request({action:'unregister',installation:INSTALL}))).status,200);
 assert.deepEqual(JSON.parse(calls.at(-1).init.body),{p_user:UID,p_installation:INSTALL});
});
test('FCM dispatch signs a real scoped Google assertion and acknowledges each delivery outcome',async()=>{
 const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pkcs8=await webcrypto.subtle.exportKey('pkcs8',pair.privateKey);
 const credentials={type:'service_account',project_id:'playerium-personal',client_email:'push@playerium-personal.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(pkcs8).toString('base64')+'\n-----END PRIVATE KEY-----'};
 const jobs=['ok','gone','timeout','bad'].map((token,i)=>({device:INSTALL,lease:INSTALL,revision:100+i,user:UID,token}));
 const {handler,calls}=await setup({credentials,jobs,fetcher:async(url,init)=>{
  if(url==='https://oauth2.googleapis.com/token'){
   const assertion=new URLSearchParams(init.body).get('assertion'),parts=assertion.split('.');
   const payload=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(payload.scope,'https://www.googleapis.com/auth/firebase.messaging');
   assert.equal(payload.aud,'https://oauth2.googleapis.com/token');
   assert.equal(await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Buffer.from(parts[2],'base64url'),Buffer.from(parts.slice(0,2).join('.'))),true);
  }
  if(url.startsWith('https://fcm.googleapis.com/')){
   const {message}=JSON.parse(init.body);assert.equal(message.data.userId,UID);assert.equal(message.android.collapse_key,'playerium-library');
   assert.equal('notification' in message,false);assert.equal(message.data.sender,'919635824329');
   if(message.token==='gone')return reply({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}},404);
   if(message.token==='timeout')throw Error('network offline');
   if(message.token==='bad')return reply({error:{status:'INVALID_ARGUMENT'}},400);
  }
 }});
 const result=await handler(request({action:'dispatch'}));assert.equal(result.status,200);assert.deepEqual(await result.json(),{delivered:1,failed:3});
 const outcomes=calls.filter(c=>c.url.endsWith('_finish')).map(c=>JSON.parse(c.init.body).p_result).sort();
 assert.deepEqual(outcomes,['ok','retry','retry','unregistered']);
 assert.equal(calls.some(c=>c.url.includes('couple')),false);
});
test('FCM never claims jobs using a credential from another Firebase project',async()=>{
 const {handler,calls}=await setup({credentials:{project_id:'couple-space',type:'service_account'}});
 assert.equal((await handler(request({action:'dispatch'}))).status,503);assert.equal(calls.some(c=>c.url.endsWith('_claim')),false);
});
