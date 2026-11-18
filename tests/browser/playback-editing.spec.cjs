const {test,expect}=require('@playwright/test');

function tone(name,seconds,first=0,last=seconds){
 const rate=8000,n=rate*seconds,wav=Buffer.alloc(44+n*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
 for(let i=first*rate;i<last*rate;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/rate)*6000),44+i*2);
 return {name:`Artist - ${name}.wav`,mimeType:'audio/wav',buffer:wav};
}
async function load(page,files){
 await page.route('https://api.github.com/**',route=>route.fulfill({json:{tag_name:'v0.0.1'}}));
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.albumArt);
 await page.evaluate(()=>window.playerApp.albumArt.stop());
 await page.locator('#hiddenAudioFilesPicker').setInputFiles(files);
 await page.waitForFunction(count=>window.playerApp.library.getTracks().length===count,files.length);
}

test('crossfade mixes two live audio elements, keeps master volume, and adopts the incoming position',async({page})=>{
 await load(page,[tone('One',9),tone('Two',9)]);
 await page.locator('#btnOpenSettings').click();
 const slider=page.getByRole('slider',{name:'Плавный переход'});await expect(slider).toHaveValue('0');
 await slider.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('2');
 await page.keyboard.press('Escape');
 await page.evaluate(async()=>{const a=window.playerApp;const tracks=a.library.getTracks().sort((x,y)=>x.title.localeCompare(y.title));await a.player.playTrack(tracks[0],0,tracks);a.player.seekToTime(5);});
 await page.waitForFunction(()=>{const p=window.playerApp.player,d=p.crossfade.deck;return d?.started&&p.gainNode.gain.value>0&&p.gainNode.gain.value<.8&&d.gain.gain.value>0&&!d.audio.paused&&d.audio.currentTime>.25;});
 await page.evaluate(()=>window.playerApp.player.setVolume(.4));
 const levels=await page.evaluate(()=>{const p=window.playerApp.player;return p.gainNode.gain.value+p.crossfade.deck.gain.gain.value;});expect(levels).toBeCloseTo(.4,4);
 await page.waitForFunction(()=>window.playerApp.player.currentTrack?.title==='Two');
 const position=await page.evaluate(()=>window.playerApp.player.getCurrentTime());expect(position).toBeGreaterThan(1);expect(position).toBeLessThan(3);
 await page.reload();await page.waitForFunction(()=>window.playerApp?.albumArt);expect(await page.evaluate(()=>window.playerApp.player.crossfadeSeconds)).toBe(2);
});

test('silence trimming saves both edges, updates playback and can be reset',async({page})=>{
 await load(page,[tone('Trim sample',9,2,6)]);
 await page.evaluate(async()=>{const a=window.playerApp,{openTrackEditor}=await import('/js/track-editor.js');openTrackEditor(a.ui,a.library.getTracks()[0]);});
 await page.getByRole('tab',{name:'Длина трека'}).click();
 await page.getByRole('button',{name:'Обрезать тишину'}).click();
 const start=page.locator('[name=trimStart]'),end=page.locator('[name=trimEnd]');
 await expect.poll(async()=>Number(await start.inputValue())).toBeCloseTo(2,1);
 expect(Number(await end.inputValue())).toBeCloseTo(6,1);
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(page.locator('.track-editor')).toHaveCount(0);
 await page.reload();await page.waitForFunction(()=>window.playerApp?.albumArt);
 const playback=await page.evaluate(async()=>{const a=window.playerApp,t=a.library.getTracks()[0];await a.player.playTrack(t,0,[t]);a.player.pause();return {duration:a.player.getDuration(),source:a.player.audio.currentTime,relative:a.player.getCurrentTime()};});
 expect(playback.duration).toBeCloseTo(4,1);expect(playback.source).toBeCloseTo(2,1);expect(playback.relative).toBeLessThan(.1);
 await page.evaluate(async()=>{const a=window.playerApp,{openTrackEditor}=await import('/js/track-editor.js');openTrackEditor(a.ui,a.library.getTracks()[0]);});
 await page.getByRole('tab',{name:'Длина трека'}).click();
 await page.locator('.track-editor-trim').getByRole('button',{name:'Сбросить'}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('.track-editor')).toHaveCount(0);
 expect(await page.evaluate(()=>window.playerApp.player.getDuration())).toBeCloseTo(9,1);
});

test('mobile song view uses the current blurred cover and the T button opens lyrics',async({page})=>{
 await page.setViewportSize({width:390,height:844});await load(page,[tone('First',12),tone('Second',12)]);
 await page.evaluate(async()=>{const a=window.playerApp,[first,second]=a.library.getTracks(),cover=await(await fetch('/assets/icon.png')).blob();first.pictureBlob=cover;first.pictureUrl=a.library.coverURL(first.id,cover);first.embeddedLyrics='Original lyric fixture';await a.player.playTrack(first,0,[first,second]);});
 await page.locator('#mobileMiniPlayer').click({position:{x:100,y:25}});
 const backdrop=page.locator('.mobile-fs-backdrop img');await expect(backdrop).toBeVisible();expect(await backdrop.evaluate(image=>getComputedStyle(image).filter)).toContain('blur(');
 const t=page.locator('#btnMobileCinema');await expect(t.locator('svg rect')).toHaveCount(0);await t.click();await expect(page.locator('.lyrics-player')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.evaluate(async()=>{const p=window.playerApp.player;await p.playTrack(p.queue[1],1);});await expect(backdrop).toHaveCount(0);
});
