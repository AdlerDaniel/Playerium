const {test,expect}=require('@playwright/test');

async function library(page, mobile=false, count=600) {
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1280,height:800});
  await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.history.length);
  await page.evaluate(count=>{
    const {library,ui}=window.playerApp;
    const pictureUrl='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="brown"/></svg>');
    for(let i=0;i<count;i++) library.tracks.set('scroll-'+i,{id:'scroll-'+i,title:'Song '+i,artist:'Artist',duration:180,dateAdded:count-i,pictureUrl});
    ui.navigateTo({type:'allTracks',title:'Добавленные'});
  },count);
  await expect(page.locator('.track-row').first()).toBeVisible();
}

for(const mobile of [false,true]) test(`scrolling retains overlapping rows and decoded covers (${mobile?'phone':'desktop'})`,async({page})=>{
  await library(page,mobile);
  await page.locator('#mainScrollContainer').evaluate(el=>el.scrollTop=1600);
  await page.waitForTimeout(100);
  const result=await page.evaluate(async()=>{
    const scroller=document.getElementById('mainScrollContainer');
    const row=[...document.querySelectorAll('.track-row')].find(row=>row.getBoundingClientRect().top>scroller.getBoundingClientRect().top+100);
    const image=row.querySelector('img'),id=row.dataset.trackId;
    await image.decode();row.focus({preventScroll:true});
    scroller.scrollTop+=64;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const next=[...document.querySelectorAll('.track-row')].find(row=>row.dataset.trackId===id);
    return {sameRow:row===next,sameCover:image===next?.querySelector('img'),focus:document.activeElement===row,rows:document.querySelectorAll('.track-row').length};
  });
  expect(result.sameRow).toBe(true);expect(result.sameCover).toBe(true);expect(result.focus).toBe(true);expect(result.rows).toBeLessThan(60);
});

test('compact desktop columns keep actions at the right edge and rows have stable height',async({page})=>{
  await library(page,false,183);await page.setViewportSize({width:1000,height:800});
  const layout=await page.locator('.track-row').first().evaluate(row=>({height:row.getBoundingClientRect().height,end:row.getBoundingClientRect().right,actions:row.querySelector('.track-col-duration').getBoundingClientRect().right}));
  expect(layout.end-layout.actions).toBeLessThanOrEqual(20);expect(layout.height).toBe(64);
});

test('virtual rows respect zoom, viewport resizing and the bottom of a collection',async({page})=>{
  await library(page);
  await page.evaluate(()=>{document.documentElement.style.setProperty('--sp-zoom','.8');document.getElementById('mainScrollContainer').scrollTop=5000;});
  await page.waitForTimeout(100);
  await page.setViewportSize({width:1280,height:1050});await page.waitForTimeout(100);
  const covered=await page.evaluate(()=>{const scroll=document.getElementById('mainScrollContainer').getBoundingClientRect(),rows=[...document.querySelectorAll('.track-row')].map(el=>el.getBoundingClientRect());return rows[0].top<=scroll.top&&rows.at(-1).bottom>=scroll.bottom;});
  expect(covered).toBe(true);
  await page.locator('#mainScrollContainer').evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(page.locator('.track-row').last().locator('.track-name')).toHaveText('Song 599');
});

test('repeated player updates retain the right cover, queue selection and control icons',async({page})=>{
  await library(page,false,183);
  const result=await page.evaluate(async()=>{
    const a=window.playerApp,p=a.player,ui=a.ui,tracks=a.library.getTracks();
    p.currentTrack=tracks[0];p.queue=tracks;p.queueIndex=0;ui.syncPlayerDisplay();ui.openRightPanel('nowPlaying');
    const cover=document.querySelector('.now-playing-panel-cover img');await cover.decode();
    const {syncPlaybackControls}=await import('/js/playback-controls.js');syncPlaybackControls(p);
    const icon=document.querySelector('.track-row-play svg');
    for(let i=0;i<20;i++)ui.syncPlayerDisplay();
    const retainedCover=cover===document.querySelector('.now-playing-panel-cover img'),retainedIcon=icon===document.querySelector('.track-row-play svg');
    ui.switchRightTab('queue');const checkbox=document.querySelector('.queue-select');checkbox.click();
    const panel=document.getElementById('rightPanelContent');panel.scrollTop=200;
    for(let i=0;i<20;i++)ui.syncPlayerDisplay();
    const selected=checkbox===document.querySelector('.queue-select')&&checkbox.checked,scroll=panel.scrollTop;
    ui.switchRightTab('nowPlaying');const restored=!!document.querySelector('.now-playing-panel-cover');
    return {retainedCover,retainedIcon,selected,scroll,restored};
  });
  expect(result).toEqual({retainedCover:true,retainedIcon:true,selected:true,scroll:200,restored:true});
});

test('background sync retains loading indicators until completion and an empty saved device never throws',async({page})=>{
  await library(page,false,183);
  const result=await page.evaluate(()=>{
    const a=window.playerApp;a.cloud.busy=true;a.cloud.progress={done:0,total:10};a.ui.refreshCurrentView();
    const loading=document.querySelector('[data-cloud-loading]');
    for(let i=0;i<5;i++){a.cloud.progress.done=i;a.ui.refreshCurrentView();}
    const same=loading===document.querySelector('[data-cloud-loading]');a.cloud.busy=false;a.ui.refreshCurrentView();
    a.connect.devices=[{id:'inactive',state:{playing:false}}];a.cloud.status={};a.connect.followRemote();
    return {same,finished:!document.querySelector('[data-cloud-loading]')};
  });
  expect(result).toEqual({same:true,finished:true});
});
