// User choices belong to the local library, independently of source-file tags.
export function trackVolume(track){
 const percent=track?.userEdits?.volume;
 if(typeof percent==='number'&&Number.isFinite(percent))return Math.max(0,Math.min(200,percent))/100;
 return typeof track?.trackVolume==='number'&&Number.isFinite(track.trackVolume)?Math.max(0,Math.min(2,track.trackVolume)):1;
}

export function trackRange(track, duration = track?.duration) {
 const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
 const saved = track?.userEdits?.trim;
 const trim = saved&&Number.isFinite(saved.start)&&Number.isFinite(saved.end)&&saved.start>=0&&saved.end>saved.start?saved:null;
 const start = trim && length ? Math.min(trim.start, Math.max(0, length - .01)) : trim?.start || 0;
 const end = trim ? (length ? Math.min(length, trim.end) : trim.end) : length;
 return end > start ? {start, end, duration:end - start} : {start:0, end:length, duration:length};
}

export function applyTrackEdits(track){
 const edits=track.userEdits;if(!edits||typeof edits!=='object')return track;
 for(const field of ['title','artist','album'])if(typeof edits[field]==='string'&&edits[field].length<=200&&(field==='album'||edits[field].trim()))track[field]=edits[field];
 if(edits.coverBlob instanceof Blob&&edits.coverBlob.size>0&&edits.coverBlob.size<=4*1024*1024){track.pictureBlob=edits.coverBlob;track.pictureUrls=[];track.coverQualityVersion=2;}
 return track;
}

export function validateTrackEdits(changes){
 const edits={};
 for(const field of ['title','artist','album']){
  if(changes[field]===undefined)continue;
  if(typeof changes[field]!=='string'||changes[field].trim().length>200)throw Error('Текст должен содержать не больше 200 символов.');
  const value=changes[field].trim();if(field!=='album'&&!value)throw Error('Укажите название песни и исполнителя.');edits[field]=value;
 }
 if(changes.volume!==undefined){const volume=changes.volume;if(typeof volume!=='number'||!Number.isFinite(volume)||volume<0||volume>200)throw Error('Громкость должна быть от 0 до 200%.');edits.volume=Math.round(volume);}
 if(changes.trim!==undefined){
  const trim=changes.trim;
  if(trim===null)edits.trim=null;
  else {
   const {start,end}=trim;
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<.0099)throw Error('Укажите начало и конец с разницей хотя бы 0,01 с.');
   edits.trim={start,end};
  }
 }
 if(changes.coverBlob!==undefined){if(!(changes.coverBlob instanceof Blob)||!/^image\/(jpeg|png|webp)$/.test(changes.coverBlob.type)||changes.coverBlob.size===0||changes.coverBlob.size>4*1024*1024)throw Error('Выберите изображение обложки размером до 4 МБ.');edits.coverBlob=changes.coverBlob;}
 return edits;
}
