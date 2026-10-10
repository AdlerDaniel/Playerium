const {test}=require('node:test'),assert=require('node:assert/strict');
test('artist credits include featured artists without substring matches or invented pairs',async()=>{
  const {artistCredits,belongsToArtist,artistResults}=await import('../js/music-artists.js');
  const track={artist:'Lead',title:'Song (feat. Guest & Friend)'};
  assert.deepEqual(artistCredits(track),['Lead','Guest','Friend']);assert.equal(belongsToArtist(track,{name:'Guest'}),true);assert.equal(belongsToArtist(track,{name:'Gue'}),false);
  assert.deepEqual(artistResults([], [{artist:'GRABAR, YUVI',title:'Song'}],'YUVI').map(a=>a.name),['YUVI']);
  assert.equal(artistResults([[{name:'Nirvana',deezerId:281527041,fans:252},{name:'Nirvana',deezerId:415,fans:1000000}]],[],'Nirvana')[0].deezerId,415);
});
test('popularity survives metadata merging and saved tracks while unrelated songs remain excluded',async()=>{
  const {mergeSongs}=await import('../js/music-match.js');
  const a={title:'Song A',artist:'Artist',catalog:true,duration:180,popularity:.1,sources:[]};
  const b={...a,title:'Song B',popularity:.9};
  let list=mergeSongs([[a,b,{...a,artist:'Stranger',popularity:1}]],'Artist');assert.deepEqual(list.map(t=>t.title),['Song B','Song A']);
  list=mergeSongs([[a,{...a,popularity:.8}]],'Artist',[{...a,id:'saved',catalog:false}]);assert.equal(list[0].popularity,.8);assert.equal(list[0].id,'saved');
  assert.equal(mergeSongs([[{...a,title:'Song Live at Wembley'}]],'Artist',[],true).length,1);
});
test('artist catalog URLs constrain lookup IDs and provide both platform metadata and real ranking',async()=>{
  const {catalogURL}=require('../desktop-music');const {catalogTracks}=await import('../js/music-catalog.js');
  assert.equal(catalogURL('deezerArtistTop','13'),'https://api.deezer.com/artist/13/top?limit=100');
  for(const provider of ['deezerArtistTop','itunesArtistTracks','itunesArtistAlbums'])for(const id of ['../evil','1?x=y','https://example.com'])assert.throws(()=>catalogURL(provider,id));
  assert.equal(catalogTracks('deezer',{data:[{title:'Song',artist:{name:'Artist',id:13},album:{title:'Album'},rank:900000}]} )[0].popularity,.9);
  assert.equal(catalogTracks('itunesArtistTracks',{results:[{artistName:'Artist',artistId:1},{trackName:'Song',artistName:'Artist',artistId:1}]}).length,1);
});
