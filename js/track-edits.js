// User choices belong to the local library, independently of source-file tags.
export function trackVolume(track){
 const percent=track?.userEdits?.volume;
 if(typeof percent==='number'&&Number.isFinite(percent))return Math.max(0,Math.min(200,percent))/100;
 return typeof track?.trackVolume==='number'&&Number.isFinite(track.trackVolume)?Math.max(0,Math.min(2,track.trackVolume)):1;
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
 if(changes.coverBlob!==undefined){if(!(changes.coverBlob instanceof Blob)||!/^image\/(jpeg|png|webp)$/.test(changes.coverBlob.type)||changes.coverBlob.size===0||changes.coverBlob.size>4*1024*1024)throw Error('Выберите изображение обложки размером до 4 МБ.');edits.coverBlob=changes.coverBlob;}
 return edits;
}
