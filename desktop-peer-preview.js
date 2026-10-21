// Older clients ignore this new operation kind and receive the ordinary final
// track operation after Drive backup. Never publish local file paths.
async function publishPreview(cloud,operation){
 if(operation.kind!=='track'||operation.id.length>152||!operation.track.audioKey)return;
 const preview={...operation,id:operation.id+'-preview',kind:'track-preview',track:{...operation.track,audioId:'peer'}};
 delete preview.track.coverId;
 await cloud.realtime.enqueue(preview);
}
module.exports={publishPreview};
