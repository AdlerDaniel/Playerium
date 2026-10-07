// Only distributed audio recordings, with credits supplied by the music catalog.
export function youtubeMusicEntries(data) {
  if(Array.isArray(data?.entries))return data.entries;
  const entries=[],seen=new Set();
  function visit(value) {
    if(!value||typeof value!=='object'||entries.length>=12)return;
    const row=value.musicResponsiveListItemRenderer;
    if(row) {
      const columns=(row.flexColumns||[]).map(c=>c.musicResponsiveListItemFlexColumnRenderer?.text?.runs||[]);
      const endpoint=columns[0]?.find(r=>r.navigationEndpoint?.watchEndpoint)?.navigationEndpoint.watchEndpoint;
      const type=endpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
      const id=endpoint?.videoId;
      if(type!=='MUSIC_VIDEO_TYPE_ATV'||!id||seen.has(id))return;
      const credits=columns[1]||[],pageType=r=>r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
      const artists=credits.filter(r=>pageType(r)==='MUSIC_PAGE_TYPE_ARTIST').map(r=>r.text).filter(Boolean);
      if(!artists.length)return;
      const time=credits.find(r=>/^\d+:\d{2}(?::\d{2})?$/.test(r.text||''))?.text;
      const duration=time?time.split(':').reduce((n,v)=>n*60+Number(v),0):0;
      seen.add(id);entries.push({id,title:columns[0].map(r=>r.text||'').join(''),artists,
        album:credits.find(r=>pageType(r)==='MUSIC_PAGE_TYPE_ALBUM')?.text||'',duration,
        uploader:artists[0]+' - Topic',thumbnails:row.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails||[],
        webpage_url:`https://www.youtube.com/watch?v=${id}`});
      return;
    }
    for(const child of Object.values(value))visit(child);
  }
  visit(data);return entries;
}
