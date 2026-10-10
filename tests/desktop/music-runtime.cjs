const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {DesktopMusic}=require('../../desktop-music');
(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-music-test-'));
  const rate=8000,samples=rate*2,wav=Buffer.alloc(44+samples*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*440/rate)*1000),44+i*2);
  const png=await fs.readFile(path.join(__dirname,'../../build/icon.png'));
  const server=http.createServer((req,res)=>{if(req.url==='/missing.jpg'){res.writeHead(404);res.end();return;}const data=req.url==='/art.png'?png:wav;res.writeHead(200,{'Content-Type':req.url==='/art.png'?'image/png':'audio/wav','Content-Length':data.length});res.end(data);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const engine=new DesktopMusic({app:{isPackaged:false,getPath:()=>root},authorize:async p=>fs.realpath(p)});
    if(process.env.PLAYERIUM_MUSIC_TEST_TOOLS)engine.tools=process.env.PLAYERIUM_MUSIC_TEST_TOOLS;
    const {LoudnessAnalyzer}=require('../../desktop-loudness');
    const analyzer=new LoudnessAnalyzer(path.join(engine.tools,'ffmpeg.exe'),path.join(root,'loudness'));
    const quiet=path.join(root,'quiet.wav'),loud=path.join(root,'loud.wav');
    const loudData=Buffer.from(wav);for(let i=44;i<loudData.length;i+=2)loudData.writeInt16LE(loudData.readInt16LE(i)*12,i);
    await fs.writeFile(quiet,wav);await fs.writeFile(loud,loudData);
    const q=await analyzer.analyze(quiet),l=await analyzer.analyze(loud);
    assert.ok(Math.abs(q.integrated+20*Math.log10(q.gain)-l.integrated-20*Math.log10(l.gain))<3,'Different input levels should converge within 3 dB');
    assert.deepEqual(await analyzer.analyze(quiet),q,'Measured gain must persist');
    assert.equal((await fs.readFile(quiet)).equals(wav),true,'Normalization must not rewrite source audio');
    console.log('Real FFmpeg loudness analysis, normalized level and cache verified');
    const nativeRun=engine.run.bind(engine);const run=async(...args)=>{try{return await nativeRun(...args);}catch(error){console.error(error.message);throw error;}};
    // Control only extractor responses. Audio transfer, conversion and embedding use bundled executables.
    engine.run=(args,...rest)=>args.includes('--dump-single-json')?Promise.resolve(JSON.stringify({id:'fixture',title:args.at(-1).endsWith('/wrong')?'Wrong recording':'Studio song',artist:'Playerium',uploader:'Playerium',duration:2,webpage_url:args.at(-1),ext:'wav',url:base+'/song.wav',thumbnails:[{url:base+(args.at(-1).endsWith('/no-cover')?'/missing.jpg':'/art.png'),id:'cover'}],extractor:'generic',extractor_key:'Generic',formats:[{format_id:'audio',url:base+'/song.wav',ext:'wav',acodec:'pcm_s16le',protocol:'http'}]})):run(args,...rest);
    const track={id:'song_f1234',title:'Studio song',artist:'Playerium',album:'Studio album',genre:'Electronic',year:2026,trackNo:2,isrc:'XX1234567890',duration:2,sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/wrong'},{provider:'youtubeMusic',url:'https://www.youtube.com/right'}]};
    const result=await engine.request('download',{track,folderSource:root},'fixture-save');
    const {parseFile}=await import('music-metadata');const embedded=await parseFile(result.fullPath);
    assert.equal(embedded.common.title,track.title);assert.equal(embedded.common.artist,track.artist);assert.equal(embedded.common.album,track.album);assert.equal(embedded.common.genre[0],track.genre);assert.equal(embedded.common.year,2026);assert.equal(embedded.common.track.no,2);assert.ok(embedded.common.picture?.[0]?.data.length);assert.ok(embedded.format.duration>1.9);
    const mp4=await fs.readFile(result.fullPath);
    assert.equal((await engine.request('restore',{},'fixture-restore')).length,1);
    await engine.request('delete',{downloadId:track.id},'fixture-delete');assert.equal(await fs.stat(result.fullPath).catch(()=>null),null);assert.equal((await engine.request('restore',{},'fixture-restored')).length,0);
    const noCover=await engine.request('download',{track:{...track,id:'song_f5678',sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/no-cover'}]},folderSource:root},'fixture-no-cover');
    const withoutCover=await parseFile(noCover.fullPath);assert.equal(withoutCover.common.title,track.title);assert.ok(withoutCover.format.duration>1.9);
    await engine.request('delete',{downloadId:'song_f5678'},'fixture-delete-no-cover');
    engine.pageFetcher=async()=>({ok:true,text:async()=>`<meta property="og:title" content="Playerium - Studio song - Скачать бесплатно"><div mp3source="https://cdn.music2019.su//?h=${'a'.repeat(64)}">`});
    engine.audioFetcher=async()=>({ok:true,headers:{get:()=> 'audio/mpeg'},body:[mp4]});
    const mislabeled=await engine.request('download',{track:{...track,id:'song_f9012',sources:[{provider:'hitmusic',url:'https://hit.music2019.su/track/3158',official:false}]},folderSource:root},'fixture-mislabeled');
    const actual=await parseFile(mislabeled.fullPath);assert.equal(path.extname(mislabeled.fullPath),'.m4a');assert.equal(actual.common.album,track.album);assert.ok(actual.format.duration>1.9);
    await engine.request('delete',{downloadId:'song_f9012'},'fixture-delete-mislabeled');
    console.log('Bundled audio transfer, fallback, tags, cover, restore and deletion passed');
  }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
