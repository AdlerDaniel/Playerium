const {test,expect}=require('@playwright/test');
test('new catalogs match the requested song, omit advertisements and never mount source HTML',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {catalogCandidates,parseCatalogLyrics,LyricsCatalogs}=await import('/js/lyrics-catalogs.js');
  const track={artist:'Макс Барских',title:'Original song'},plain='First original test line\nSecond original test line';
  const search='<a href="/other/original-song">Original song Other Artist</a><a href="/max-barskih/original-song">Original song MAX BARSKIH</a><a href="https://evil.invalid/max-barskih/original-song">Original song MAX BARSKIH</a>';
  const record={"@type":"MusicRecording",name:'Original song',byArtist:{name:'Max Barskih'},recordingOf:{lyrics:{text:plain}}};
  const html='<script type="application/ld+json">'+JSON.stringify(record)+'</script><script>window.sourceExecuted=true</script><img src="https://evil.invalid/pixel"><p>Advertisement</p>';
  const calls=[],catalogs=new LyricsCatalogs(async payload=>{calls.push(payload);return {status:200,html:payload.query?search:html};},{spacing:0});
  const data=await catalogs.lookup(track);
  const alternate='<main><h1>Текст пісні Max Barskih – Original song</h1><div class="lyrics"><p>First original test line<br>Second original test line</p><ins>Advertisement</ins><iframe>Advertisement</iframe></div></main>';
  return {paths:catalogCandidates('pisni',search,track),data,calls,wrong:parseCatalogLyrics('pisni',html,{...track,artist:'Someone else'},'/max-barskih/original-song'),alternate:parseCatalogLyrics('tekst',alternate,track,'/max-barskih-original-song/'),executed:!!window.sourceExecuted};
 });
 expect(result.paths[0]).toBe('/max-barskih/original-song');expect(result.paths).toHaveLength(2);expect(result.calls).toHaveLength(2);expect(result.data.source).toBe('Pisni.in.ua');expect(result.data.lines).toEqual([]);expect(result.wrong).toBe(null);expect(result.executed).toBe(false);
 expect(result.alternate.plain).toBe('First original test line\nSecond original test line');
});
test('catalog fallback verifies the performer and keeps Ukrainian and Russian titles distinct',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {catalogCandidates,parseCatalogLyrics,LyricsCatalogs}=await import('/js/lyrics-catalogs.js'),track={artist:'Макс Барських',title:'Тумани UA'};
  const search='<a href="/max-barskih-tumany/">Max Barskih – Туманы</a><a href="/someone-tumany-ua/">Someone – Тумани UA</a><a href="/max-barskih-tumany-ua/">Max Barskih – Тумани UA</a>';
  const good='<div class="lyrics"><main><h1>Max Barskih – Тумани UA текст пісні</h1><table class="datainfo"><tr><td>Metadata is not lyrics</td></tr></table><p class="wp-block-paragraph">Це вигаданий рядок для тестування.<br>Ще один вигаданий рядок для перевірки.</p><h2>Other songs</h2><ul><li>Unrelated song</li></ul></main></div>';
  const catalogs=new LyricsCatalogs(async p=>({status:200,html:p.provider==='pisni'?'':p.query?search:good}),{spacing:0});
  return{paths:catalogCandidates('tekst',search,track),lyrics:await catalogs.lookup(track),russian:parseCatalogLyrics('tekst',good,{artist:'Max Barskih',title:'Туманы'},'/max-barskih-tumany-ua/')};
 });
 expect(result.paths).toEqual(['/max-barskih-tumany-ua/']);expect(result.lyrics.source).toBe('Tekst-pisni.com');expect(result.russian).toBe(null);expect(result.lyrics.plain).not.toMatch(/Metadata|Other songs|Unrelated/);
});
