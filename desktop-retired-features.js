const fs=require('node:fs/promises');
const path=require('node:path');

// Remove saved authorization only. Downloaded music, covers and recovery copies
// remain in their existing folders, with the same authorized playback paths.
async function retireFeatures(userData){
  for(const name of ['account.bin','account.bin.tmp']){
    await fs.rm(path.join(userData,'google-drive',name),{force:true});
  }
}
module.exports={retireFeatures};
