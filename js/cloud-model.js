// Immutable operations converge regardless of delivery order or device clocks.
const hash=/^[a-f0-9]{64}$/;
const id=/^[a-zA-Z0-9_-]{1,160}$/;
const reserved=new Set(['__proto__','constructor','prototype']);
export function validOperation(op) {
  if(!op||op.version!==1||!id.test(op.id)||!id.test(op.device)||!Number.isSafeInteger(op.clock)||op.clock<1)return false;
  if(!['track','delete','restore','like','playlist','playlist-delete','member'].includes(op.kind))return false;
  if(reserved.has(op.id)||reserved.has(op.device)||reserved.has(op.playlist))return false;
  if(op.kind==='playlist'||op.kind==='playlist-delete'||op.kind==='member') {
    if(!id.test(op.playlist))return false;
    if(op.kind==='playlist'&&(typeof op.name!=='string'||op.name.length>300))return false;
  }
  if(['track','delete','restore','like','member'].includes(op.kind)&&!hash.test(op.key))return false;
  if(op.kind==='track'&&(!op.track||!id.test(op.track.audioId)||typeof op.track.title!=='string'||typeof op.track.artist!=='string'||op.track.title.length>1000||op.track.artist.length>1000||!/^\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$/i.test(op.track.ext)||!Number.isSafeInteger(op.track.size)||op.track.size<1||op.track.size>1073741824))return false;
  if(op.kind==='restore'&&(!Array.isArray(op.deletes)||op.deletes.some(value=>!id.test(value))))return false;
  if(op.kind==='like'&&typeof op.liked!=='boolean')return false;
  if(op.kind==='member'&&typeof op.present!=='boolean')return false;
  return true;
}
const newer=(a,b)=>!b||a.clock>b.clock||(a.clock===b.clock&&a.id>b.id);
export function mergeOperations(previous,incoming) {
  const events=new Map(previous.filter(validOperation).map(op=>[op.id,op]));
  for(const op of incoming)if(validOperation(op)&&!events.has(op.id))events.set(op.id,op);
  return [...events.values()];
}
export function cloudView(events) {
  const tracks=new Map(),playlists=new Map();let clock=0;
  for(const op of events) {
    if(!validOperation(op))continue;clock=Math.max(clock,op.clock);
    if(op.playlist){
      if(!playlists.has(op.playlist))playlists.set(op.playlist,{id:op.playlist,members:new Map(),deleted:false});
      const pl=playlists.get(op.playlist);
      if(op.kind==='playlist'&&newer(op,pl.meta)){pl.meta=op;pl.name=op.name;pl.description=String(op.description||'').slice(0,3000);pl.coverType=['custom','text','mosaic'].includes(op.coverType)?op.coverType:'mosaic';pl.coverUrl=typeof op.coverUrl==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(op.coverUrl)&&op.coverUrl.length<=200000?op.coverUrl:null;}
      if(op.kind==='playlist-delete')pl.deleted=true;
      if(op.kind==='member'&&newer(op,pl.members.get(op.key)))pl.members.set(op.key,op);
    }
    if(!op.key||op.kind==='member')continue;
    if(!tracks.has(op.key))tracks.set(op.key,{key:op.key,deletes:new Set(),restored:new Set(),liked:false});
    const track=tracks.get(op.key);
    if(op.kind==='track'&&newer(op,track.meta)){track.meta=op;track.data=op.track;}
    if(op.kind==='delete')track.deletes.add(op.id);
    if(op.kind==='restore')for(const key of op.deletes)track.restored.add(key);
    if(op.kind==='like'&&newer(op,track.like)){track.like=op;track.liked=!!op.liked;}
  }
  for(const t of tracks.values())t.deleted=[...t.deletes].some(key=>!t.restored.has(key));
  return {tracks,playlists,clock};
}
