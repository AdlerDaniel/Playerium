const PROJECT='playerium-personal', SENDER='919635824329';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

// One short-lived Google token per warm worker; no signing credential enters the app.
export function pushHandler({env,fetcher=fetch,subtle=crypto.subtle,now=Date.now}){
 let google=null;
 async function request(url,options={}){
  return fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});
 }
 async function accessToken(credentials){
  if(credentials?.project_id!==PROJECT||credentials.type!=='service_account'||
   !credentials.client_email?.endsWith('@'+PROJECT+'.iam.gserviceaccount.com'))throw Error('Invalid FCM configuration');
  if(google?.email===credentials.client_email&&google.until>now()+60000)return google.token;
  const encode=value=>b64url(new TextEncoder().encode(JSON.stringify(value)));
  const timestamp=Math.floor(now()/1000),unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({
   iss:credentials.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',
   aud:'https://oauth2.googleapis.com/token',iat:timestamp,exp:timestamp+3600
  });
  const pem=credentials.private_key?.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  if(!pem)throw Error('Missing signing key');
  const key=await subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
  const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(new Uint8Array(signature))}).toString()});
  if(!response.ok)throw Error('FCM authorization unavailable');
  const data=await response.json();if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in))throw Error('Invalid Google response');
  google={email:credentials.client_email,token:data.access_token,until:now()+Math.min(data.expires_in,3600)*1000};return google.token;
 }
 return async req=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const bearer=req.headers.get('authorization')?.match(/^Bearer ([^\s]{20,8192})$/)?.[1];
  if(!bearer)return json({error:'Authorization required'},401);
  try{
   if(Number(req.headers.get('content-length'))>8192)return json({error:'Request too large'},413);
   const raw=await req.text();if(raw.length>8192)return json({error:'Request too large'},413);
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
   const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
   if(new URL(url).hostname!=='cjmdgrstuaxaimpgxsmv.supabase.co'||!service)throw Error('Wrong project');
   const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
   async function rpc(name,args={}){
    const response=await request(url+'/rest/v1/rpc/playerium_push_'+name,{method:'POST',headers,body:JSON.stringify(args)});
    if(!response.ok)throw Error('Push storage unavailable');const text=await response.text();return text?JSON.parse(text):null;
   }
   if(body?.action==='register'||body?.action==='unregister'){
    if(!uuid(body.installation))return json({error:'Invalid installation'},400);
    if(body.action==='register'&&(typeof body.token!=='string'||!/^[A-Za-z0-9_:.-]{20,4096}$/.test(body.token)))return json({error:'Invalid token'},400);
    const verified=await request(url+'/auth/v1/user',{headers:{apikey:service,Authorization:'Bearer '+bearer}});
    if(!verified.ok)return json({error:'Authorization rejected'},401);
    const identity=await verified.json();if(!uuid(identity.id))return json({error:'Authorization rejected'},401);
    await rpc(body.action,{p_user:identity.id,p_installation:body.installation,...(body.action==='register'?{p_token:body.token}:{})});
    return json({ok:true,userId:identity.id});
   }
   if(body?.action!=='dispatch')return json({error:'Invalid action'},400);
   if(!/^[a-f0-9]{64}$/.test(bearer)||await rpc('authorize',{p_secret:bearer})!==true)return json({error:'Authorization rejected'},401);
   const credentials=await rpc('credentials');
   if(!credentials)return json({error:'FCM server configuration required'},503);
   const token=await accessToken(credentials),jobs=await rpc('claim');
   if(!Array.isArray(jobs)||jobs.length>32)throw Error('Invalid queue');
   let delivered=0,failed=0;
   async function send(job){
    let result='retry';
    try{
     const response=await request('https://fcm.googleapis.com/v1/projects/'+PROJECT+'/messages:send',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({message:{token:job.token,data:{type:'playerium-library',userId:job.user,revision:String(job.revision),sender:SENDER},
       android:{priority:'high',ttl:'86400s',collapse_key:'playerium-library'}}})
     });
     if(response.ok){result='ok';delivered++;}
     else{
      if(response.status===401)google=null;
      const error=await response.json().catch(()=>({}));
      if(error.error?.details?.some(d=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError'&&d.errorCode==='UNREGISTERED'))result='unregistered';
      failed++;
     }
    }catch{failed++;}
    await rpc('finish',{p_device:job.device,p_lease:job.lease,p_revision:job.revision,p_result:result});
   }
   // Bounded concurrency and leases let overlapping trigger/cron calls cooperate.
   let cursor=0;await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(cursor<jobs.length)await send(jobs[cursor++]);}));
   return json({delivered,failed});
  }catch{return json({error:'Push delivery temporarily unavailable'},503);}
 };
}
