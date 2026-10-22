const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const URL='https://cjmdgrstuaxaimpgxsmv.supabase.co',KEY='sb_publishable_5CrRGQG0f-UJ1pOsDoKLNQ_qAHEhAua';
class DesktopRealtime {
 constructor(cloud,{journalFetcher=fetch}={}){this.cloud=cloud;this.journalFetcher=journalFetcher;}
 async pullChanges(after=0){
  let cursor=Number(after);if(!Number.isSafeInteger(cursor)||cursor<0)throw Error('Invalid journal cursor');
  const session=await this.session(),events=[];
  const check=()=>{if(!this.cloud.auth.enabled||this.cloud.auth.account!==session.account)throw Error('Аккаунт синхронизации изменился.');};
  for(;;){
   check();let rows;
   for(let attempt=0;attempt<3;attempt++){
    check();let response;
    try{
     // Small responses and fresh HTTP/1 connections avoid stalled long-lived
     // Chromium transfers on networks which interrupt larger journal reads.
     response=await this.journalFetcher(URL+'/rest/v1/playerium_events?select=revision,operation&user_id=eq.'+session.userId+'&revision=gt.'+cursor+'&order=revision.asc&limit=20',{headers:{apikey:KEY,Authorization:'Bearer '+session.accessToken,Connection:'close'},redirect:'error',signal:AbortSignal.timeout(10000)});
     if(response.ok){rows=await response.json();break;}
    }catch{response=null;if(attempt===2)throw Error('Не удалось прочитать журнал. Синхронизация продолжится автоматически.');}
    check();if(response&&response.status<500&&response.status!==429){if(response.status===401)this.current=null;throw Error('Быстрая синхронизация временно недоступна.');}
    if(attempt===2)throw Error('Не удалось прочитать журнал. Синхронизация продолжится автоматически.');
    await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
   }
   check();if(!Array.isArray(rows)||rows.length>20)throw Error('Invalid journal response');
   for(const row of rows){if(!Number.isSafeInteger(row.revision)||row.revision<=cursor)throw Error('Invalid journal order');cursor=row.revision;events.push(row.operation);}
   if(rows.length<20)return {events,journalCursor:cursor};
  }
 }
 async session(){
  const cloud=this.cloud;await cloud.load();const account=cloud.auth.account;if(!account||!cloud.auth.enabled)throw Error('Подключите Google Диск.');
  if(this.current?.account===account&&this.current.expiresAt>Date.now()+60000)return this.current;
  if(this.opening?.account===account)return this.opening.promise;
  const promise=(async()=>{const token=await cloud.token();const response=await cloud.fetcher(URL+'/functions/v1/playerium-session',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Быстрая синхронизация временно недоступна.');const result=await response.json();if(result.account!==account||cloud.auth.account!==account||!cloud.auth.enabled||typeof result.accessToken!=='string'||typeof result.userId!=='string')throw Error('Аккаунт синхронизации изменился.');this.current=result;return result;})();
  this.opening={account,promise};try{return await promise;}finally{if(this.opening?.promise===promise)this.opening=null;}
 }
 directory(account){return path.join(this.cloud.root,'realtime-outbox',crypto.createHash('sha256').update(account).digest('hex'));}
 async enqueue(operation){if(typeof operation?.id!=='string'||!(/^[A-Za-z0-9_-]{1,160}$/).test(operation.id))throw Error('Invalid realtime operation');const account=this.cloud.auth.account;if(!account)return;const dir=this.directory(account);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,operation.id+'.json');await fs.writeFile(file+'.tmp',JSON.stringify(operation));await fs.rename(file+'.tmp',file);this.drain().catch(()=>{});}
 async drain(){if(this.running)return;this.running=true;try{const session=await this.session(),dir=this.directory(session.account);await fs.mkdir(dir,{recursive:true});for(const name of await fs.readdir(dir)){if(!/^[\w-]+\.json$/.test(name))continue;if(!this.cloud.auth.enabled||this.cloud.auth.account!==session.account)return;const file=path.join(dir,name),operation=JSON.parse(await fs.readFile(file,'utf8'));const response=await this.cloud.fetcher(URL+'/rest/v1/playerium_events?on_conflict=user_id,op_id',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({user_id:session.userId,op_id:operation.id,operation}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok){if(response.status===401)this.current=null;throw Error('Realtime retry');}await fs.unlink(file);}}finally{this.running=false;if(this.cloud.auth?.enabled){clearTimeout(this.retry);this.retry=setTimeout(()=>this.drain().catch(()=>{}),30000);this.retry.unref?.();}}}
 reset(){this.current=null;clearTimeout(this.retry);}
}
module.exports={DesktopRealtime};
