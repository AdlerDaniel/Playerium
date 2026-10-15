// Google validates the credential. No Google token, refresh token or service key
// is returned to the renderer or recorded in the database/logs.
export function sessionHandler({env,fetcher=fetch}) {
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 return async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]{20,8192})$/)?.[1];
  if(!token)return json({error:'Google authorization required'},401);
  try{
   const verified=await fetcher('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!verified.ok)return json({error:'Google authorization rejected'},401);
   const account=(await verified.json()).user?.permissionId;
   if(typeof account!=='string'||!/^\d{1,100}$/.test(account))return json({error:'Google account unavailable'},401);
   const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
   if(new URL(url).hostname!=='cjmdgrstuaxaimpgxsmv.supabase.co')throw Error('Wrong project');
   const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
   async function api(path,options={}){const response=await fetcher(url+path,{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Session unavailable');const text=await response.text();return text?JSON.parse(text):null;}
   const route='/rest/v1/playerium_accounts?google_account=eq.'+account+'&select=user_id,email';
   let identity=(await api(route))[0];
   if(!identity){
    const email=crypto.randomUUID()+'@accounts.playerium.invalid';
    const created=await api('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,email_confirm:true,app_metadata:{playerium:true}})});
    await api('/rest/v1/playerium_accounts?on_conflict=google_account',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({google_account:account,user_id:created.id,email})});
    identity=(await api(route))[0];
    // Concurrent first logins may provision an extra, empty auth identity.
    if(identity.user_id!==created.id)await api('/auth/v1/admin/users/'+created.id,{method:'DELETE'});
   }
   const link=await api('/auth/v1/admin/generate_link',{method:'POST',body:JSON.stringify({type:'magiclink',email:identity.email})});
   const session=await api('/auth/v1/verify',{method:'POST',body:JSON.stringify({type:'magiclink',token_hash:link.hashed_token})});
   if(session.user?.id!==identity.user_id||!session.access_token)throw Error('Invalid session');
   return json({account,userId:identity.user_id,accessToken:session.access_token,expiresAt:Date.now()+session.expires_in*1000});
  }catch{return json({error:'Realtime session temporarily unavailable'},503);}
 };
}
