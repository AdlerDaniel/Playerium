const fs = require('node:fs/promises');
const path = require('node:path');
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus']);
const internalAudio = name => /^\.playerium-(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|normalize-).*/i.test(name);

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function scanDirectory(root) {
  const files = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && !internalAudio(entry.name) && (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase()))) {
        const stat = await fs.stat(fullPath);
        files.push({ name: entry.name, fullPath, relativePath: path.relative(root, fullPath).replaceAll('\\', '/'), size: stat.size, lastModified: stat.mtimeMs });
      }
    }
  }
  // Fail the scan rather than interpreting an unreadable subtree as deleted music.
  await visit(root);
  return files;
}
// Search only approved folders, and never guess between multiple matching files.
async function findRelocatedAudio(original, roots, identity={}) {
  const name=path.basename(original).normalize('NFC').toLowerCase();
  const key=/^song_([a-f0-9]+)$/i.exec(identity.downloadId||'')?.[1];
  const size=Number(identity.fileSize),modified=Number(identity.lastModified);
  if(!key&&(!(size>0)||!(modified>0)))return null;
  const matches=new Map();
  for(const approved of roots){
    let root,files;try{root=await fs.realpath(approved);files=await scanDirectory(root);}catch{continue;}
    for(const file of files){
      const stable=/\[([a-f0-9]+)\]\.[^.]+$/i.exec(file.name)?.[1];
      const same=key?stable?.toLowerCase()===key.toLowerCase():file.name.normalize('NFC').toLowerCase()===name&&file.size===size&&Math.abs(file.lastModified-modified)<1;
      if(!same)continue;
      const real=await fs.realpath(file.fullPath).catch(()=>null);
      if(real&&isInside(root,real))matches.set(real,{...file,fullPath:real,folderSource:root,folderName:path.basename(root),previousPath:original});
    }
  }
  return matches.size===1?[...matches.values()][0]:null;
}
module.exports = { scanDirectory, isInside, AUDIO_EXTS, findRelocatedAudio };
