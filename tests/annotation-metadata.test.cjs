const test=require('node:test'),assert=require('node:assert/strict');
const atom=(type,...parts)=>{const body=Buffer.concat(parts),header=Buffer.alloc(8);header.writeUInt32BE(body.length+8);header.write(type,4,4,'latin1');return Buffer.concat([header,body]);};
const tag=(type,value,format=1)=>{const flags=Buffer.alloc(8);flags.writeUInt32BE(format);return atom(type,atom('data',flags,Buffer.from(value)));};
function recording(){const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(180000,16);return new File([atom('ftyp',Buffer.from('M4A     ')),atom('mdat',Buffer.alloc(32)),atom('moov',atom('trak',atom('mdia',atom('mdhd',mdhd))),atom('udta',atom('meta',Buffer.alloc(4),atom('ilst',tag('©nam','Любила'),tag('©ART','Саша Чемеров & Бумбокс'),tag('©alb','Ignored'),tag('covr',Buffer.from([137,80,78,71]),14)))))],'Саша Чемеров & Бумбокс - Любила [fe10a9].m4a');}
test('M4A metadata after audio restores exact title and artwork without importing collection data',async()=>{
 const {ID3Parser}=await import('../js/id3-parser.js');const result=await ID3Parser.parseFile(recording());assert.equal(result.title,'Любила');assert.equal(result.artist,'Саша Чемеров & Бумбокс');assert.equal(result.duration,180);assert.equal(result.pictureBlob.type,'image/png');assert.equal(result.pictureBlob.size,4);assert.equal('album' in result,false);
});
test('existing M4A records repair stored metadata and delete collection information without changing identity or likes',async()=>{
 global.indexedDB=require('fake-indexeddb').indexedDB;global.window={};
 const {Library}=await import('../js/library.js');const lib=new Library();await lib.init();await lib.clearAll();
 await lib.putInStore('tracks',{id:'existing-m4a',title:'Любила [fe10a9]',artist:'Саша Чемеров',album:'Ignored',fileName:recording().name,folderSource:'web:Music',liked:true,metadataVersion:1});await lib.putInStore('files',{id:'existing-m4a',blob:new Blob([recording()],{type:'audio/mp4'})});
 const next=new Library();await next.init();const track=next.getTrackById('existing-m4a');assert.equal(track.title,'Любила');assert.equal(track.liked,true);assert.equal(track.id,'existing-m4a');assert.ok(track.pictureBlob);assert.equal('album' in track,false);assert.equal('album' in await next.getFromStore('tracks',track.id),false);assert.equal(next.db.transaction('tracks').objectStore('tracks').indexNames.contains('album'),false);lib.db.close();next.db.close();
});
test('cover verification rejects a different artist, version, duration and unofficial pictures',async()=>{
 const {verifiedCover}=await import('../js/cover-repair.js');const track={title:'Song (Live)',artist:'Artist',duration:180};const candidate={...track,official:true,pictureUrl:'https://is1-ssl.mzstatic.com/image.jpg'};assert.ok(verifiedCover(track,candidate));for(const other of [{...candidate,artist:'Other'},{...candidate,title:'Song'},{...candidate,duration:90},{...candidate,official:false},{...candidate,pictureUrl:'https://example.com/cover.jpg'}])assert.equal(!!verifiedCover(track,other),false);
});
test('Windows download manifest removes obsolete collection metadata while preserving saved files and recording identity',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-manifest-'));
 try {
  const file=path.join(root,'music-downloads.json');
  const record={fullPath:path.join(root,'Song.m4a'),folderSource:root,downloadId:'song-1',metadata:{title:'Song',artist:'Artist',album:'Ignored',duration:180}};
  await fs.writeFile(record.fullPath,'original-audio');await fs.writeFile(record.fullPath+'.playerium.json',JSON.stringify(record.metadata));
  await fs.writeFile(file,JSON.stringify({'song-1':record}));
  const {DesktopMusic}=require('../desktop-music.js'),music=new DesktopMusic({app:{getPath:()=>root,isPackaged:false},authorize:async p=>p});
  const saved=await music.records();assert.equal(saved['song-1'].fullPath,record.fullPath);assert.equal(saved['song-1'].downloadId,'song-1');assert.equal('album' in saved['song-1'].metadata,false);
  assert.equal('album' in JSON.parse(await fs.readFile(file,'utf8'))['song-1'].metadata,false);
  await music.request('restore',{},'restore-test');
  const sidecar=JSON.parse(await fs.readFile(record.fullPath+'.playerium.json','utf8'));assert.equal('album' in sidecar,false);assert.equal(sidecar.title,'Song');assert.equal(await fs.readFile(record.fullPath,'utf8'),'original-audio');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
