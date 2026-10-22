const {test}=require('node:test'),assert=require('node:assert/strict');
const {DesktopRealtime}=require('../desktop-realtime');
function fixture(journalFetcher){const cloud={auth:{enabled:true,account:'account'}},sync=new DesktopRealtime(cloud,{journalFetcher});sync.session=async()=>({account:'account',userId:'owned-user',accessToken:'fixture'});return {cloud,sync};}
test('native journal reads small independent pages, retries an interrupted body at the same cursor and preserves revision gaps',async()=>{
 const cursors=[],rows=Array.from({length:45},(_,i)=>({revision:i*2+1,operation:{id:'op-'+i}}));let interrupted=false;
 const {sync}=fixture(async(url,options)=>{const u=new URL(url),cursor=Number(u.searchParams.get('revision').slice(3));cursors.push(cursor);assert.equal(u.hostname,'cjmdgrstuaxaimpgxsmv.supabase.co');assert.equal(u.searchParams.get('user_id'),'eq.owned-user');assert.equal(u.searchParams.get('limit'),'20');assert.equal(options.headers.Connection,'close');assert.equal(options.redirect,'error');
  if(cursor===39&&!interrupted){interrupted=true;return {ok:true,json:async()=>{throw Error('body interrupted');}};}
  return new Response(JSON.stringify(rows.filter(r=>r.revision>cursor).slice(0,20)));
 });
 const result=await sync.pullChanges(0);assert.equal(result.events.length,45);assert.equal(result.journalCursor,89);assert.deepEqual(cursors,[0,39,39,79]);
});
test('native journal cannot complete a read after switching Google accounts',async()=>{
 let f;f=fixture(async()=>{f.cloud.auth.account='other';return new Response('[]');});await assert.rejects(f.sync.pullChanges(0),/Аккаунт/);
});
test('native journal rejects invalid cursors and nonmonotonic server revisions',async()=>{
 const {sync}=fixture(async()=>new Response(JSON.stringify([{revision:3,operation:{}},{revision:2,operation:{}}])));
 await assert.rejects(sync.pullChanges(-1),/cursor/);await assert.rejects(sync.pullChanges(0),/order/);
});
test('native journal stops retrying unauthorized responses and invalidates its session',async()=>{
 let count=0;const {sync}=fixture(async()=>{count++;return new Response('{}',{status:401});});sync.current={};await assert.rejects(sync.pullChanges(),/недоступна/);assert.equal(count,1);assert.equal(sync.current,null);
});
