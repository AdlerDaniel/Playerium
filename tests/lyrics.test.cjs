const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../js/lyrics-service.js');
test('lyrics match exact artists, titles and durations; remixes and different recordings are rejected',async()=>{
 const {lyricsMatch,parseLrc}=await load(),track={title:'Song',artist:'Artist; Guest',duration:180};
 assert.ok(lyricsMatch(track,{title:'Song',artist:'Guest & Artist',duration:181}));
 for(const candidate of [{title:'Song (Live)',artist:'Artist; Guest',duration:180},{title:'Song',artist:'Another artist',duration:180},{title:'Song',artist:'Artist; Guest',duration:210}])assert.equal(lyricsMatch(track,candidate),false);
 assert.deepEqual(parseLrc('[ar:Artist]\n[offset:100]\n[00:01.50][01:02.003]Original test line'),[{time:1.6,text:'Original test line'},{time:62.103,text:'Original test line'}]);
});
test('multi-provider fallback skips wrong lyrics and persists verified synchronized text for offline reopening',async()=>{
 const {LyricsService}=await load(),saved=new Map(),calls=[];
 const library={getFromStore:async(_,key)=>saved.get(key),putInStore:async(_,record)=>saved.set(record.key,record)};
 const track={artist:'Artist',title:'Song',duration:180,album:'Album'};
 const service=new LyricsService(library,{spacing:0,fetcher:async url=>{calls.push(url);
  if(url.includes('/api/get?'))return new Response(JSON.stringify({trackName:'Different song',artistName:'Artist',duration:180,plainLyrics:'Wrong words'}));
  if(url.includes('/api/search?'))return new Response(JSON.stringify([{trackName:'Song (Live)',artistName:'Artist',duration:180,plainLyrics:'Wrong version'}]));
  if(url.includes('lrcmux'))return new Response(JSON.stringify({track:{title:'Song',artist:'Artist',duration:180},meta:{level:'line',source:{name:'Test source'}},lines:[{start:5000,text:'First original line'},{start:10000,text:'Second original line'}]}));
  assert.fail('Unnecessary fallback');
 }});
 const lyrics=await service.lookup(track);assert.equal(lyrics.source,'Lrcmux · Test source');assert.equal(lyrics.lines[0].time,5);assert.equal(calls.length,3);assert.equal(saved.size,1);
 const reopened=new LyricsService(library,{fetcher:()=>assert.fail('Saved lyrics must be usable without network')});assert.deepEqual(await reopened.lookup(track),lyrics);
});
test('provider rate limits back off and transient failures do not become permanent missing lyrics',async()=>{
 const {LyricsService}=await load(),stored=[],calls=[];
 const service=new LyricsService({getFromStore:async()=>null,putInStore:async(...args)=>stored.push(args)},{spacing:0,fetcher:async url=>{calls.push(url);return url.includes('lrclib')?new Response('{}',{status:429,headers:{'Retry-After':'60'}}):new Response('{}',{status:404});}});
 assert.equal(await service.lookup({title:'One',artist:'Artist',duration:10,album:'Album'}),null);assert.equal(await service.lookup({title:'Two',artist:'Artist',duration:10,album:'Album'}),null);
 assert.equal(calls.filter(url=>url.includes('lrclib')).length,1);assert.equal(stored.length,0);
});
test('embedded text takes priority and LRC stays synchronized without any network access',async()=>{
 const {LyricsService}=await load(),service=new LyricsService({}, {fetcher:()=>assert.fail('Embedded text must not contact a service')});
 const data=await service.lookup({title:'Song',artist:'Artist',embeddedLyrics:'Original line',embeddedSyncedLyrics:'[00:03.00]Original line'});assert.equal(data.lines[0].time,3);assert.equal(data.source,'Встроенный текст');
});
test('tracks without album metadata use a structured lyrics search',async()=>{
 const {LyricsService}=await load(),calls=[];const service=new LyricsService({getFromStore:async()=>null,putInStore:async()=>{}},{spacing:0,fetcher:async url=>{calls.push(url);assert.ok(url.includes('/api/search?'));return new Response(JSON.stringify([{trackName:'Song',artistName:'Artist',duration:120,plainLyrics:'Original fixture words'}]));}});
 assert.equal((await service.lookup({title:'Song',artist:'Artist',duration:120})).plain,'Original fixture words');assert.equal(calls.length,1);
});
