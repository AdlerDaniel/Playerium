const { test } = require('node:test');
const assert = require('node:assert/strict');
const { indexedDB } = require('fake-indexeddb');

test('whole duplicated titles are cleaned while valid repetitions and versions survive', async () => {
  const { normalizeTrackTitle: clean } = await import('../js/track-title.js');
  const title = 'Smells Like Teen Spirit';
  for (const separator of ['\0', '\n', ' ', ' - ', ' / ', '; ']) {
    assert.equal(clean(title + separator + title), title);
  }
  assert.equal(clean(title + ' - smells like teen spirit'), title);
  assert.equal(clean(title + ' ' + title + ' ' + title), title);
  for (const value of ['Bye Bye Bye','Never Never','Duran Duran','Smells Like Teen Spirit - Live','Song / Another Song']) assert.equal(clean(value),value);
  assert.equal(clean('Song\0Different Song\0'),'Song / Different Song');
});

test('ID3 title decoding collapses duplicate UTF-8 and UTF-16 values', async () => {
  const { ID3Parser } = await import('../js/id3-parser.js');
  const title = 'Smells Like Teen Spirit';
  for (const [encoding, bytes] of [[3,Buffer.from(`${title}\0${title}`, 'utf8')], [1,Buffer.concat([Buffer.from([255,254]),Buffer.from(`${title}\0${title}`,'utf16le')])]]) {
    const result = {};
    ID3Parser.decodeFrame('TIT2',Uint8Array.from([encoding,...bytes]),result);
    assert.equal(result.title,title);
  }
  const result = {}; ID3Parser.decodeFrame('USLT',Uint8Array.from([3,101,110,103,0,104,105]),result);
  assert.equal(result.lyrics,undefined);
});

test('database reopen cleans existing titles and lyrics without losing IDs, likes or playlists',async()=>{
  global.indexedDB=indexedDB;global.window={};global.localStorage={getItem:()=>null};
  const { Library } = await import('../js/library.js');
  const lib=new Library();await lib.init();await lib.clearAll();
  const id='old-nirvana',title='Smells Like Teen Spirit';
  await lib.putInStore('tracks',{id,title:`${title}\0${title}`,liked:true,lyrics:'obsolete',lyricsModified:42});
  await lib.putInStore('playlists',{id:'manual',trackIds:[id]});
  const reopened=new Library();await reopened.init();
  const track=reopened.getTrackById(id);
  assert.equal(track.title,title);assert.equal(track.liked,true);assert.equal(track.lyrics,undefined);
  assert.equal(reopened.getPlaylistTracks('manual')[0].id,id);
  const stored=(await reopened.getAllFromStore('tracks')).find(t=>t.id===id);
  assert.equal(stored.title,title);assert.equal(stored.lyricsModified,undefined);
});
