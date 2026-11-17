const {test}=require('node:test'),assert=require('node:assert/strict');
const {lyricsPageURL,fetchLyricsPage}=require('../desktop-lyrics');
test('additional lyrics sources accept artist spellings without merging audio identities or language versions',async()=>{
 const {lyricsArtist,lyricsTitlesMatch,catalogQuery}=await import('../js/lyrics-catalogs.js'),{artistKey}=await import('../js/music-match.js');
 for(const name of ['Макс Барских','Макс Барських','Maks Barskikh','Max Barskih','MAX BARSKIH (Макс Барських)'])assert.equal(lyricsArtist(name),'max barskih');
 for(const name of ['DOROFEEVA','Дорофеева','Дорофєєва'])assert.equal(lyricsArtist(name),'dorofeeva');
 assert.notEqual(artistKey('Макс Барских'),artistKey('Max Barskih'));
 assert.ok(lyricsTitlesMatch('червонi прапорцi','Червоні прапорці'));assert.equal(catalogQuery('червонi прапорцi'),'червоні прапорці');
 assert.equal(lyricsTitlesMatch('Туманы','Тумани'),false);assert.equal(lyricsTitlesMatch('Song (RU)','Song UA'),false);assert.equal(lyricsTitlesMatch('Song','Song (Live)'),false);
 assert.ok(lyricsTitlesMatch('Guru','Guru'));assert.equal(lyricsTitlesMatch('Guru','Gu'),false);
});
test('lyrics page transport restricts both catalogs, rejects other targets and preserves verified provenance',async()=>{
 for(const payload of [{provider:'other',query:'Song'},{provider:'pisni',path:'//localhost/secret'},{provider:'tekst',path:'/../secret/'},{provider:'pisni',path:'/artist/%2e%2e'},{provider:'pisni',query:'x'.repeat(201)}]){
  assert.throws(()=>lyricsPageURL(payload));await assert.rejects(fetchLyricsPage(payload,{fetcher:()=>assert.fail('Invalid URL reached network')}));
 }
 const payload={provider:'pisni',path:'/artist/song'},url=lyricsPageURL(payload);
 const make=data=>new Response(JSON.stringify({code:200,data:{url,finalUrl:url,httpStatus:200,html:'<h1>Original fixture</h1>',...data}}));
 const result=await fetchLyricsPage(payload,{fetcher:async(target,options)=>{assert.equal(target,'https://r.jina.ai/'+url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers['X-Respond-With'],'html');return make({});}});
 assert.equal(result.status,200);assert.equal(result.url,url);assert.equal(result.html,'<h1>Original fixture</h1>');
 await assert.rejects(fetchLyricsPage(payload,{fetcher:async()=>make({finalUrl:'https://pisni.in.ua/other/song'})}),/другую страницу/);
 await assert.rejects(fetchLyricsPage(payload,{fetcher:async()=>new Response('x'.repeat(1024*1024+1))}),/слишком большой/);
 const limited=await fetchLyricsPage(payload,{fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'120'}})});assert.equal(limited.retryAfter,'120');assert.equal(limited.status,429);
});
test('catalog pages share rate backoff across both sites, including requests already queued',async()=>{
 const {LyricsCatalogs}=await import('../js/lyrics-catalogs.js');let calls=0;
 const catalogs=new LyricsCatalogs(async()=>{calls++;return{status:429,retryAfter:'60'};},{spacing:0});
 const results=await Promise.allSettled([catalogs.page('pisni',{query:'One'}),catalogs.page('tekst',{query:'Two'})]);
 assert.ok(results.every(result=>result.status==='rejected'));assert.equal(calls,1);
});
test('new catalogs retry old negative caches and persist plain lyrics for offline reopening',async()=>{
 const {LyricsService,lyricsKey}=await import('../js/lyrics-service.js'),track={artist:'Макс Барских',title:'Original song'},key='lyrics:'+lyricsKey(track),saved=new Map([[key,{key,value:{data:null,checkedAt:Date.now()}}]]);let calls=0;
 const library={getFromStore:async(_,key)=>saved.get(key),putInStore:async(_,record)=>saved.set(record.key,record)};
 const expected={plain:'First original fixture line\nSecond original fixture line',synced:'',lines:[],source:'Pisni.in.ua',sourceUrl:'https://pisni.in.ua/max-barskih/original-song'};
 const service=new LyricsService(library,{spacing:0,fetcher:async url=>{if(url.includes('lrclib'))assert.equal(new URL(url).searchParams.get('artist_name'),'Max Barskih');return new Response('{}',{status:404});},catalogs:{lookup:async()=>{calls++;return expected;}}});
 assert.deepEqual(await service.lookup(track),expected);assert.equal(calls,1);assert.equal(saved.get(key).value.sourcesVersion,2);
 const restarted=new LyricsService(library,{fetcher:()=>assert.fail('Offline lyrics tried network'),catalogs:{lookup:()=>assert.fail('Offline catalog request')}});assert.deepEqual(await restarted.lookup(track),expected);
});
